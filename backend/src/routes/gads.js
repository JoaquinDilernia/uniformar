import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid } from '../lib/validate.js';
import { AppError } from '../lib/errors.js';
import { requirePermission } from '../services/permissions.js';
import { buildGoogleSnapshot } from '../gads/snapshot.js';
import { projectMonth } from '../gads/agent.js';
import { mountChatRoutes } from './chats.js';

const settingsSchema = z.object({
  agent_enabled: z.boolean(),
  monthly_cap_ars: z.number().int().min(0).max(100_000_000),
  business_notes: z.string().max(5000),
}).partial();
const answerSchema = z.object({ answer: z.string().trim().min(1, 'Escribí la respuesta').max(2000), analyze: z.boolean().default(false) });
const statusSchema = z.object({
  level: z.enum(['campaign', 'ad_group']), status: z.enum(['ENABLED', 'PAUSED']), name: z.string().max(200).default(''),
});
const SNAPSHOT_TTL_MS = 10 * 60_000;
const LEVEL_LABEL = { campaign: 'la campaña', ad_group: 'el grupo' };

// Agente de Google Ads (mismo permiso que la sección Pauta)
export function createGoogleAdsRouter({ repo, gads, startRun, execute, images, chatReply }) {
  const r = Router();
  const view = requirePermission('ads', 'view');
  const edit = requirePermission('ads', 'edit');
  const needGoogle = (_req, _res, next) => {
    if (!gads || !execute) throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Falta conectar Google Ads (GOOGLE_ADS_SERVICE_ACCOUNT y GOOGLE_ADS_CUSTOMER_ID) en el servidor.');
    next();
  };
  const needAgent = (_req, _res, next) => {
    if (!startRun) throw new AppError(503, 'AGENT_NOT_CONFIGURED', 'Falta la clave de Claude (ANTHROPIC_API_KEY) en el servidor.');
    next();
  };

  // La cuota de la API de Google es chica (2.880 operaciones por día): la foto se cachea
  let cache = null;
  async function snapshot(force) {
    if (!force && cache && Date.now() - cache.at < SNAPSHOT_TTL_MS) return cache.data;
    const data = await buildGoogleSnapshot(gads);
    cache = { at: Date.now(), data };
    return data;
  }
  const invalidate = () => { cache = null; };

  r.get('/gads/overview', view, async (req, res) => {
    const [settings, runs, pending, openQuestions] = await Promise.all([
      repo.getSettings(), repo.listRuns(1), repo.listDecisions({ status: 'pending', limit: 100 }), repo.countOpenQuestions(),
    ]);
    let snap = null;
    let googleError = null;
    if (gads) {
      try {
        snap = await snapshot(req.query.refresh === '1');
      } catch (err) {
        googleError = String(err.message || err);
      }
    }
    res.json({
      configured: { google: Boolean(gads), agent: Boolean(startRun) },
      settings, lastRun: runs[0] ?? null, pendingCount: pending.length, openQuestions,
      snapshot: snap, projectedMonth: snap ? projectMonth(snap) : null, googleError,
    });
  });

  r.post('/gads/objects/:id/status', edit, needGoogle, async (req, res) => {
    const id = parse(z.string().regex(/^\d{1,20}$/, 'Id inválido'), req.params.id);
    const body = parse(statusSchema, req.body);
    const input = { level: body.level, object_id: id, object_name: body.name, status: body.status };
    const result = await execute('set_status', input);
    await repo.addDecision({
      tool: 'set_status', input, status: 'executed', result,
      title: `${body.status === 'ENABLED' ? 'Activar' : 'Pausar'} ${LEVEL_LABEL[body.level]} ${body.name}`.trim(),
      reason: 'Hecho a mano desde el panel.',
    });
    invalidate();
    res.json({ ok: true });
  });

  r.get('/gads/runs', view, async (_req, res) => res.json({ runs: await repo.listRuns(20) }));
  r.post('/gads/runs', edit, needGoogle, needAgent, async (req, res) => {
    const { run, done } = await startRun('manual', req.user.id);
    done.finally(invalidate);
    res.status(202).json({ run });
  });

  r.get('/gads/decisions', view, async (req, res) => {
    const status = req.query.status ? parse(z.enum(['pending', 'executed', 'rejected', 'failed']), req.query.status) : undefined;
    res.json({ decisions: await repo.listDecisions({ status, limit: 100 }) });
  });
  r.post('/gads/decisions/:id/approve', edit, needGoogle, async (req, res) => {
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
  r.post('/gads/decisions/:id/reject', edit, async (req, res) => {
    const id = parse(uuid, req.params.id);
    await repo.claimPending(id, req.user.id, 'rejected');
    res.json({ decision: await repo.getDecision(id) });
  });

  r.get('/gads/learnings', view, async (_req, res) => res.json({ learnings: await repo.listLearnings() }));
  r.delete('/gads/learnings/:id', edit, async (req, res) => {
    await repo.deleteLearning(parse(uuid, req.params.id));
    res.json({ ok: true });
  });

  r.get('/gads/questions', view, async (req, res) => {
    const status = req.query.status ? parse(z.enum(['open', 'answered']), req.query.status) : 'open';
    res.json({ questions: await repo.listQuestions({ status, limit: 30 }) });
  });
  r.post('/gads/questions/:id/answer', edit, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(answerSchema, req.body);
    const question = await repo.answerQuestion(id, body.answer, req.user.id);
    let run = null;
    let note = null;
    if (body.analyze) {
      if (!startRun || !gads) note = 'Respuesta guardada. El agente de Google no está configurado para analizar ahora.';
      else {
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
  r.post('/gads/questions/:id/dismiss', edit, async (req, res) => res.json({ question: await repo.dismissQuestion(parse(uuid, req.params.id)) }));

  // Biblioteca de imágenes para los anuncios: se crea la fila y el navegador sube el archivo a /files (owner gads_image)
  r.get('/gads/images', view, async (_req, res) => res.json({ images: await images.list() }));
  r.post('/gads/images', edit, async (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(1, 'Poné un nombre').max(120) }), req.body);
    res.status(201).json({ image: await images.create(name, req.user.id) });
  });
  r.post('/gads/images/from-creative/:id', edit, async (req, res) => {
    res.status(201).json({ image: await images.importFromCreative(parse(uuid, req.params.id), req.user.id) });
  });
  r.get('/gads/images/:id/:shape.jpg', view, async (req, res) => {
    const { buffer, filename } = await images.crop(parse(uuid, req.params.id), req.params.shape);
    res.set({ 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` }).send(buffer);
  });
  r.post('/gads/images/:id/archive', edit, async (req, res) => res.json({ image: await images.archive(parse(uuid, req.params.id)) }));
  // Sube la imagen (cuadrada y horizontal) a una campaña de búsqueda, en el momento: no gasta más, se paga el clic
  r.post('/gads/images/:id/to-campaign', edit, needGoogle, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const body = parse(z.object({ campaign_id: z.string().regex(/^\d{1,20}$/, 'Id de campaña inválido'), campaign_name: z.string().max(200).default('') }), req.body);
    const img = (await images.list()).find((i) => i.id === id);
    if (!img) throw new AppError(404, 'NOT_FOUND', 'No existe esa imagen.');
    const input = { campaign_id: body.campaign_id, campaign_name: body.campaign_name, image_ids: [id] };
    const result = await execute('add_campaign_images', input);
    await repo.addDecision({
      tool: 'add_campaign_images', input, status: 'executed', result,
      title: `Subir “${img.name}” a ${body.campaign_name || `la campaña ${body.campaign_id}`}`,
      reason: 'Hecho a mano desde el panel.',
    });
    invalidate();
    res.json({ ok: true, created: result.created });
  });

  mountChatRoutes(r, { base: '/gads', repo, chatReply, view, edit, missing: 'Falta conectar Google Ads y la clave de Claude en el servidor.' });

  r.get('/gads/settings', view, async (_req, res) => res.json({ settings: await repo.getSettings() }));
  r.put('/gads/settings', edit, async (req, res) => res.json({ settings: await repo.updateSettings(parse(settingsSchema, req.body)) }));

  return r;
}
