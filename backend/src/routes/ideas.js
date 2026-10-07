import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid, dateStr, optionalUrl, requiredUrl, nullableText } from '../lib/validate.js';
import { conflict, notFound } from '../lib/errors.js';
import { buildInsert, buildUpdate, pick } from '../lib/sql.js';
import { requirePermission, requireFlag } from '../services/permissions.js';
import { logActivity, diffFields } from '../services/activity.js';

const FIELDS = {
  kind: z.enum(['idea', 'must']),
  format: z.enum(['video', 'photo']),
  category: z.enum(['domingo', 'viernes', 'producto', 'otra']),
  text: z.string().trim().min(1, 'Escribí la idea').max(5000),
  client_name: z.string().trim().max(120).nullish(),
  assignee_id: uuid.nullish(),
  reference_url: optionalUrl,
  due_date: dateStr.nullish(),
  note_santi: nullableText(5000),
  note_sofi: nullableText(5000),
};
const createSchema = z.object(FIELDS);
const updateSchema = z.object(FIELDS).partial();
const decideSchema = z.object({ decision: z.enum(['yes', 'no']) });
const completeSchema = z.object({ result_url: requiredUrl });

const EDITABLE = ['kind', 'format', 'category', 'client_id', 'assignee_id', 'text', 'reference_url', 'due_date',
  'note_santi', 'note_santi_by', 'note_sofi', 'note_sofi_by', 'decision'];

// Reglas de coherencia: cliente solo en viernes, fecha límite solo en "sí o sí"
function normalize(v) {
  return { ...v, client_id: v.category === 'viernes' ? v.client_id ?? null : null, due_date: v.kind === 'must' ? v.due_date ?? null : null };
}

export function createIdeasRouter({ db, ideasRepo, clientsRepo, activityRepo, files }) {
  const r = Router();
  const view = requirePermission('ideas', 'view');
  const edit = requirePermission('ideas', 'edit');

  async function detail(id) {
    const idea = await ideasRepo.get(id);
    if (!idea) throw notFound('No existe esa idea.');
    const all = await files.listFor(['idea_ref', 'idea_result'], [id]);
    return { ...idea, ref_files: all.filter((f) => f.owner_type === 'idea_ref'), result_files: all.filter((f) => f.owner_type === 'idea_result') };
  }

  async function lock(q, id) {
    const { rows } = await q.query('SELECT * FROM ideas WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound('No existe esa idea.');
    return rows[0];
  }

  const resolveClient = (q, category, name) => (category === 'viernes' && name ? clientsRepo.upsertByName(q, name) : null);

  r.get('/ideas', view, async (_req, res) => res.json({ ideas: await ideasRepo.list() }));
  r.get('/ideas/:id', view, async (req, res) => res.json({ idea: await detail(req.params.id) }));
  r.get('/ideas/:id/activity', view, async (req, res) => res.json({ activity: await activityRepo.listFor('idea', req.params.id) }));

  r.post('/ideas', edit, async (req, res) => {
    const b = parse(createSchema, req.body);
    const id = await db.tx(async (q) => {
      const values = normalize({
        kind: b.kind, format: b.format, category: b.category, text: b.text,
        client_id: await resolveClient(q, b.category, b.client_name),
        assignee_id: b.assignee_id ?? null, reference_url: b.reference_url ?? null, due_date: b.due_date ?? null,
        note_santi: b.note_santi ?? null, note_sofi: b.note_sofi ?? null,
        note_santi_by: b.note_santi ? req.user.id : null, note_sofi_by: b.note_sofi ? req.user.id : null,
        decision: 'pending', created_by: req.user.id,
      });
      const ins = buildInsert('ideas', values);
      const { rows } = await q.query(ins.text, ins.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'idea', entityId: rows[0].id, action: 'create' });
      return rows[0].id;
    });
    res.status(201).json({ idea: await detail(id) });
  });

  r.patch('/ideas/:id', edit, async (req, res) => {
    const b = parse(updateSchema, req.body);
    await db.tx(async (q) => {
      const before = await lock(q, req.params.id);
      const patch = pick(b, ['kind', 'format', 'category', 'text', 'assignee_id', 'reference_url', 'due_date', 'note_santi', 'note_sofi']);
      if (b.client_name !== undefined) patch.client_id = await resolveClient(q, b.category ?? before.category, b.client_name);
      if (b.kind && b.kind !== before.kind && !before.done_at) patch.decision = 'pending';
      if (b.note_santi !== undefined && b.note_santi !== before.note_santi) patch.note_santi_by = b.note_santi ? req.user.id : null;
      if (b.note_sofi !== undefined && b.note_sofi !== before.note_sofi) patch.note_sofi_by = b.note_sofi ? req.user.id : null;
      const merged = normalize({ ...before, ...patch });
      const changed = diffFields(before, merged, EDITABLE);
      if (!Object.keys(changed).length) return;
      const upd = buildUpdate('ideas', before.id, Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])));
      await q.query(upd.text, upd.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'idea', entityId: before.id, action: 'update', diff: changed });
    });
    res.json({ idea: await detail(req.params.id) });
  });

  async function transition(req, action, check, values) {
    await db.tx(async (q) => {
      const before = await lock(q, req.params.id);
      check(before);
      const upd = buildUpdate('ideas', before.id, values);
      await q.query(upd.text, upd.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'idea', entityId: before.id, action });
    });
    return detail(req.params.id);
  }

  r.post('/ideas/:id/decide', edit, async (req, res) => {
    const { decision } = parse(decideSchema, req.body);
    const idea = await transition(req, decision === 'yes' ? 'decide_yes' : 'decide_no', (i) => {
      if (i.kind === 'must') throw conflict('Los contenidos "sí o sí" no se deciden: ya están por hacer.');
      if (i.done_at) throw conflict('Esta idea ya está realizada. Reabrila primero.');
    }, { decision });
    res.json({ idea });
  });

  r.post('/ideas/:id/undecide', edit, async (req, res) => {
    const idea = await transition(req, 'undecide', (i) => {
      if (i.done_at) throw conflict('Esta idea ya está realizada. Reabrila primero.');
    }, { decision: 'pending' });
    res.json({ idea });
  });

  r.post('/ideas/:id/complete', edit, async (req, res) => {
    const { result_url } = parse(completeSchema, req.body);
    const idea = await transition(req, 'complete', (i) => {
      if (i.decision === 'no') throw conflict('Esta idea está marcada como "No se hace".');
      if (i.kind === 'idea' && i.decision !== 'yes') throw conflict('Primero marcá "Sí la hago".');
      if (i.done_at) throw conflict('Esta idea ya está realizada.');
    }, { done_at: new Date(), result_url });
    res.json({ idea });
  });

  r.post('/ideas/:id/reopen', edit, async (req, res) => {
    const idea = await transition(req, 'reopen', (i) => {
      if (!i.done_at) throw conflict('Esta idea no está realizada.');
    }, { done_at: null });
    res.json({ idea });
  });

  r.delete('/ideas/:id', edit, requireFlag('can_delete'), async (req, res) => {
    const keys = await db.tx(async (q) => {
      const before = await lock(q, req.params.id);
      const k = await files.removeOwnerRows(q, ['idea_ref', 'idea_result'], before.id);
      await q.query('DELETE FROM ideas WHERE id = $1', [before.id]);
      await logActivity(q, { actorId: req.user.id, entityType: 'idea', entityId: before.id, action: 'delete', diff: { text: { from: before.text, to: null } } });
      return k;
    });
    await files.purgeKeys(keys);
    res.json({ ok: true });
  });

  return r;
}
