import { Router } from 'express';
import { z } from 'zod';
import { dateStr, parse, uuid } from '../lib/validate.js';
import { AppError, badRequest } from '../lib/errors.js';
import { requirePermission } from '../services/permissions.js';
import { buildSnapshot } from '../ads/snapshot.js';
import { buildReport } from '../ads/report.js';
import { artDate, daysBetween } from '../ads/metrics.js';
import { loadIgPosts } from '../ads/igPosts.js';

const metaId = z.string().regex(/^\d{1,30}$/, 'Id de Meta inválido');
const creativeSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(60),
  copy: z.string().trim().min(1, 'Escribí el texto del anuncio').max(2000),
  headline: z.string().trim().max(80).default(''),
  notes: z.string().trim().max(2000).default(''),
});
const creativePatch = creativeSchema.partial().extend({ status: z.enum(['unused', 'archived']).optional() });
const publishSchema = z.object({ adset_id: metaId, adset_name: z.string().max(200).default('') });
const statusSchema = z.object({ level: z.enum(['campaign', 'adset', 'ad']), status: z.enum(['ACTIVE', 'PAUSED']), name: z.string().max(200).default('') });
const settingsSchema = z.object({
  agent_enabled: z.boolean(),
  autonomous: z.boolean(),
  monthly_cap_ars: z.number().int().min(0).max(100_000_000),
  business_notes: z.string().max(5000),
}).partial();

const promoteSchema = z.object({ adset_id: metaId, adset_name: z.string().max(200).default(''), permalink: z.string().max(500).default('') });
const answerSchema = z.object({
  answer: z.string().trim().min(1, 'Escribí la respuesta').max(2000),
  analyze: z.boolean().default(false),
});

const rangeSchema = z.object({ since: dateStr, until: dateStr });
const MAX_REPORT_DAYS = 93;

const LEVEL_LABEL = { campaign: 'la campaña', adset: 'el conjunto', ad: 'el anuncio' };
const SNAPSHOT_TTL_MS = 5 * 60_000;
const REPORT_TTL_MS = 15 * 60_000;

function parseRange(data) {
  const { since, until } = parse(rangeSchema, data);
  if (since > until) throw badRequest('La fecha de inicio tiene que ser anterior a la de fin.');
  if (until > artDate()) throw badRequest('El período no puede terminar en el futuro.');
  if (daysBetween(since, until) > MAX_REPORT_DAYS) throw badRequest(`El período puede tener hasta ${MAX_REPORT_DAYS} días.`);
  return { since, until };
}

export function createAdsRouter({ repo, meta, startRun, execute, config, files, analyzeReport }) {
  const r = Router();
  const view = requirePermission('ads', 'view');
  const edit = requirePermission('ads', 'edit');
  const needMeta = (_req, _res, next) => {
    if (!meta || !execute) throw new AppError(503, 'META_NOT_CONFIGURED', 'Falta conectar Meta (META_ACCESS_TOKEN) en el servidor.');
    next();
  };
  const needAgent = (_req, _res, next) => {
    if (!startRun) throw new AppError(503, 'AGENT_NOT_CONFIGURED', 'Falta la clave de Claude (ANTHROPIC_API_KEY) en el servidor.');
    next();
  };

  // La foto de Meta se cachea unos minutos: cada carga del panel no le pega a la API
  let cache = null;
  async function snapshot(force) {
    if (!force && cache && Date.now() - cache.at < SNAPSHOT_TTL_MS) return cache.data;
    const data = await buildSnapshot(meta);
    cache = { at: Date.now(), data };
    return data;
  }
  // Un reporte son ~12 consultas a Meta: se cachea por período
  const reportCache = new Map();
  async function report({ since, until }, force) {
    const key = `${since}|${until}`;
    const hit = reportCache.get(key);
    if (!force && hit && Date.now() - hit.at < REPORT_TTL_MS) return hit.data;
    const decisions = await repo.listDecisions({ status: 'executed', limit: 200 });
    const data = await buildReport(meta, { since, until }, { decisions });
    if (reportCache.size > 20) reportCache.clear();
    reportCache.set(key, { at: Date.now(), data });
    return data;
  }
  const invalidate = () => { cache = null; reportCache.clear(); };

  let igCache = null;
  async function igPosts(force) {
    if (!force && igCache && Date.now() - igCache.at < SNAPSHOT_TTL_MS) return igCache.data;
    const data = await loadIgPosts({ meta, repo, igUserId: config.igUserId });
    igCache = { at: Date.now(), data };
    return data;
  }

  r.get('/ads/overview', view, async (req, res) => {
    const [settings, runs, pending, openQuestions] = await Promise.all([
      repo.getSettings(), repo.listRuns(1), repo.listDecisions({ status: 'pending', limit: 100 }), repo.countOpenQuestions(),
    ]);
    let snap = null;
    let metaError = null;
    if (meta) {
      try {
        snap = await snapshot(req.query.refresh === '1');
      } catch (err) {
        metaError = String(err.message || err);
      }
    }
    res.json({
      configured: { meta: Boolean(meta), agent: Boolean(startRun) },
      settings, lastRun: runs[0] ?? null, pendingCount: pending.length, openQuestions, snapshot: snap, metaError,
    });
  });

  r.get('/ads/report', view, needMeta, async (req, res) => {
    const range = parseRange(req.query);
    let data;
    try {
      data = await report(range, req.query.refresh === '1');
    } catch (err) {
      throw new AppError(502, 'META_ERROR', `Meta no respondió: ${err.message}`);
    }
    res.json({ report: data, analysis: (await repo.latestReportAnalysis(range.since, range.until)) ?? null, canAnalyze: Boolean(analyzeReport) });
  });

  // La lectura del agente sobre el período: tarda unos segundos y queda guardada
  r.post('/ads/report/analysis', edit, needMeta, async (req, res) => {
    if (!analyzeReport) throw new AppError(503, 'AGENT_NOT_CONFIGURED', 'Falta la clave de Claude (ANTHROPIC_API_KEY) en el servidor.');
    const range = parseRange(req.body);
    const [data, settings, learnings] = await Promise.all([report(range), repo.getSettings(), repo.listLearnings({ activeOnly: true })]);
    let text;
    try {
      text = await analyzeReport(data, { businessNotes: settings.business_notes, learnings });
    } catch (err) {
      throw new AppError(502, 'AGENT_ERROR', `El agente no pudo analizar: ${err.message}`);
    }
    await repo.addReportAnalysis({ ...range, text, userId: req.user.id });
    res.json({ analysis: await repo.latestReportAnalysis(range.since, range.until) });
  });

  r.post('/ads/objects/:id/status', edit, needMeta, async (req, res) => {
    const id = parse(metaId, req.params.id);
    const body = parse(statusSchema, req.body);
    const input = { level: body.level, object_id: id, object_name: body.name, status: body.status };
    const result = await execute('set_status', input);
    await repo.addDecision({
      tool: 'set_status', input, status: 'executed', result,
      title: `${body.status === 'ACTIVE' ? 'Activar' : 'Pausar'} ${LEVEL_LABEL[body.level]} ${body.name}`.trim(),
      reason: 'Hecho a mano desde el panel.',
    });
    invalidate();
    res.json({ ok: true });
  });

  r.get('/ads/runs', view, async (_req, res) => res.json({ runs: await repo.listRuns(20) }));

  r.post('/ads/runs', edit, needMeta, needAgent, async (req, res) => {
    const { run, done } = await startRun('manual', req.user.id);
    done.finally(invalidate);
    res.status(202).json({ run });
  });

  r.get('/ads/decisions', view, async (req, res) => {
    const status = req.query.status ? parse(z.enum(['pending', 'executed', 'rejected', 'failed']), req.query.status) : undefined;
    res.json({ decisions: await repo.listDecisions({ status, limit: 100 }) });
  });

  r.post('/ads/decisions/:id/approve', edit, needMeta, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const d = await repo.claimPending(id, req.user.id, 'executed');
    try {
      const result = await execute(d.tool, d.input, { userId: req.user.id });
      await repo.setDecisionResult(id, { status: 'executed', result });
    } catch (err) {
      await repo.setDecisionResult(id, { status: 'failed', error: String(err.message || err) });
    }
    invalidate();
    igCache = null;
    res.json({ decision: await repo.getDecision(id) });
  });

  r.post('/ads/decisions/:id/reject', edit, async (req, res) => {
    const id = parse(uuid, req.params.id);
    await repo.claimPending(id, req.user.id, 'rejected');
    res.json({ decision: await repo.getDecision(id) });
  });

  // Cada pieza trae su feed/historia con tipo y URL (firmada en R2: los videos no pasan por el servidor)
  r.get('/ads/creatives', view, async (_req, res) => {
    const creatives = await repo.listCreatives();
    const media = await files.listFor(['ad_feed', 'ad_story'], creatives.map((c) => c.id));
    const pick = (type, id) => {
      const f = media.find((m) => m.owner_type === type && m.owner_id === id);
      return f ? { id: f.id, kind: f.kind, url: f.url } : null;
    };
    res.json({ creatives: creatives.map((c) => ({ ...c, feed: pick('ad_feed', c.id), story: pick('ad_story', c.id) })) });
  });

  r.post('/ads/creatives', edit, async (req, res) => {
    const body = parse(creativeSchema, req.body);
    res.status(201).json({ creative: await repo.createCreative(body, req.user.id) });
  });

  r.patch('/ads/creatives/:id', edit, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const patch = parse(creativePatch, req.body);
    const current = await repo.getCreative(id);
    if (current.status === 'used' && patch.status) throw new AppError(409, 'CONFLICT', 'Esta pieza ya está publicada en Meta.');
    res.json({ creative: await repo.updateCreative(id, patch) });
  });

  r.post('/ads/creatives/:id/publish', edit, needMeta, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(publishSchema, req.body);
    const creative = await repo.getCreative(id);
    const input = { creative_id: id, adset_id: body.adset_id, adset_name: body.adset_name };
    const base = { tool: 'create_ad', input, title: `Publicar "${creative.name}" en ${body.adset_name || body.adset_id}`, reason: 'Hecho a mano desde el panel.' };
    try {
      const result = await execute('create_ad', input);
      await repo.addDecision({ ...base, status: 'executed', result });
      invalidate();
      res.json({ ok: true, ...result });
    } catch (err) {
      if (err.status === 409) throw err;
      await repo.addDecision({ ...base, status: 'failed', error: String(err.message || err) });
      throw new AppError(502, 'META_ERROR', `Meta rechazó el anuncio: ${err.message}`);
    }
  });

  r.get('/ads/ig-posts', view, needMeta, async (req, res) => {
    try {
      res.json({ posts: await igPosts(req.query.refresh === '1') });
    } catch (err) {
      throw new AppError(502, 'META_ERROR', `Instagram no respondió: ${err.message}`);
    }
  });

  r.post('/ads/ig-posts/:mediaId/promote', edit, needMeta, async (req, res) => {
    const mediaId = parse(metaId, req.params.mediaId);
    const body = parse(promoteSchema, req.body);
    const input = { ig_media_id: mediaId, adset_id: body.adset_id, adset_name: body.adset_name, permalink: body.permalink };
    const base = { tool: 'promote_ig_post', input, title: `Promocionar post de Instagram en ${body.adset_name || body.adset_id}`, reason: 'Hecho a mano desde el panel.' };
    try {
      const result = await execute('promote_ig_post', input, { userId: req.user.id });
      await repo.addDecision({ ...base, status: 'executed', result });
      invalidate();
      igCache = null;
      res.json({ ok: true, ...result });
    } catch (err) {
      if (err.status === 409) throw err;
      await repo.addDecision({ ...base, status: 'failed', error: String(err.message || err) });
      throw new AppError(502, 'META_ERROR', `Meta rechazó el anuncio: ${err.message}`);
    }
  });

  r.get('/ads/requests', view, async (_req, res) => res.json({ requests: await repo.listRequests({ status: 'open' }) }));
  r.post('/ads/requests/:id/done', edit, async (req, res) => res.json({ request: await repo.closeRequest(parse(uuid, req.params.id)) }));

  r.get('/ads/learnings', view, async (_req, res) => res.json({ learnings: await repo.listLearnings() }));
  r.delete('/ads/learnings/:id', edit, async (req, res) => {
    await repo.deleteLearning(parse(uuid, req.params.id));
    res.json({ ok: true });
  });

  r.get('/ads/questions', view, async (req, res) => {
    const status = req.query.status ? parse(z.enum(['open', 'answered']), req.query.status) : 'open';
    res.json({ questions: await repo.listQuestions({ status, limit: 30 }) });
  });

  r.post('/ads/questions/:id/answer', edit, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(answerSchema, req.body);
    const question = await repo.answerQuestion(id, body.answer, req.user.id);
    let run = null;
    let note = null;
    if (body.analyze) {
      if (!startRun || !meta) {
        note = 'Respuesta guardada. El agente no está configurado para analizar ahora.';
      } else {
        try {
          const started = await startRun('manual', req.user.id);
          started.done.finally(invalidate);
          run = started.run;
        } catch (err) {
          if (err.status !== 409) throw err;
          note = 'Ya hay un análisis corriendo: el agente la toma en el próximo.';
        }
      }
    }
    res.json({ question, run, note });
  });

  r.post('/ads/questions/:id/dismiss', edit, async (req, res) => {
    res.json({ question: await repo.dismissQuestion(parse(uuid, req.params.id)) });
  });

  r.get('/ads/settings', view, async (_req, res) => res.json({ settings: await repo.getSettings() }));
  r.put('/ads/settings', edit, async (req, res) => res.json({ settings: await repo.updateSettings(parse(settingsSchema, req.body)) }));

  return r;
}
