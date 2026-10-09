import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid } from '../lib/validate.js';
import { AppError } from '../lib/errors.js';
import { requirePermission } from '../services/permissions.js';
import { buildSnapshot } from '../ads/snapshot.js';

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

const LEVEL_LABEL = { campaign: 'la campaña', adset: 'el conjunto', ad: 'el anuncio' };
const SNAPSHOT_TTL_MS = 5 * 60_000;

export function createAdsRouter({ repo, meta, startRun, execute }) {
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
  const invalidate = () => { cache = null; };

  r.get('/ads/overview', view, async (req, res) => {
    const [settings, runs, pending] = await Promise.all([repo.getSettings(), repo.listRuns(1), repo.listDecisions({ status: 'pending', limit: 100 })]);
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
      settings, lastRun: runs[0] ?? null, pendingCount: pending.length, snapshot: snap, metaError,
    });
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
      const result = await execute(d.tool, d.input);
      await repo.setDecisionResult(id, { status: 'executed', result });
    } catch (err) {
      await repo.setDecisionResult(id, { status: 'failed', error: String(err.message || err) });
    }
    invalidate();
    res.json({ decision: await repo.getDecision(id) });
  });

  r.post('/ads/decisions/:id/reject', edit, async (req, res) => {
    const id = parse(uuid, req.params.id);
    await repo.claimPending(id, req.user.id, 'rejected');
    res.json({ decision: await repo.getDecision(id) });
  });

  r.get('/ads/creatives', view, async (_req, res) => res.json({ creatives: await repo.listCreatives() }));

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

  r.get('/ads/settings', view, async (_req, res) => res.json({ settings: await repo.getSettings() }));
  r.put('/ads/settings', edit, async (req, res) => res.json({ settings: await repo.updateSettings(parse(settingsSchema, req.body)) }));

  return r;
}
