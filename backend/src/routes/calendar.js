import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid, dateStr, optionalUrl, nullableText } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { buildInsert, buildUpdate, pick } from '../lib/sql.js';
import { CHANNELS } from '../lib/channels.js';
import { requirePermission, requireFlag } from '../services/permissions.js';
import { logActivity, diffFields } from '../services/activity.js';

const FIELDS = {
  date: dateStr,
  title: z.string().trim().max(300),
  channels: z.array(z.enum(CHANNELS)).max(4),
  idea_id: uuid.nullish(),
  copy: nullableText(5000),
  piece_url: optionalUrl,
  refs: nullableText(5000),
  status: z.enum(['draft', 'ready', 'published']),
  sort: z.number().int().min(0).max(1000),
};
const createSchema = z.object({ ...FIELDS, title: FIELDS.title.default(''), channels: FIELDS.channels.default([]), status: FIELDS.status.default('draft') }).omit({ sort: true });
const updateSchema = z.object(FIELDS).partial();
const rangeSchema = z.object({ from: dateStr, to: dateStr });
const EDITABLE = Object.keys(FIELDS);
const DAY = 86_400_000;

export function createCalendarRouter({ db, calendarRepo, files }) {
  const r = Router();
  const view = requirePermission('calendar', 'view');
  const edit = requirePermission('calendar', 'edit');

  async function withPreviews(items) {
    const previews = await files.listFor(['calendar_preview'], items.map((i) => i.id));
    return items.map((i) => ({ ...i, previews: previews.filter((p) => p.owner_id === i.id) }));
  }

  async function detail(id) {
    const item = await calendarRepo.get(id);
    if (!item) throw notFound('No existe esa pieza.');
    return (await withPreviews([item]))[0];
  }

  async function assertIdea(q, ideaId) {
    if (!ideaId) return;
    const { rows } = await q.query('SELECT id FROM ideas WHERE id = $1', [ideaId]);
    if (!rows[0]) throw badRequest('Esa idea no existe.', { idea_id: 'Esa idea no existe' });
  }

  r.get('/calendar', view, async (req, res) => {
    const { from, to } = parse(rangeSchema, req.query);
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;
    if (days < 0) throw badRequest('La fecha "hasta" tiene que ser posterior a "desde".');
    if (days > 62) throw badRequest('El rango máximo es de 62 días.');
    res.json({ items: await withPreviews(await calendarRepo.range(from, to)) });
  });

  r.get('/calendar/:id', view, async (req, res) => res.json({ item: await detail(req.params.id) }));

  r.post('/calendar', edit, async (req, res) => {
    const b = parse(createSchema, req.body);
    const id = await db.tx(async (q) => {
      await assertIdea(q, b.idea_id);
      const { rows: [{ n }] } = await q.query('SELECT count(*)::int AS n FROM calendar_items WHERE date = $1', [b.date]);
      const ins = buildInsert('calendar_items', { ...b, idea_id: b.idea_id ?? null, sort: n, created_by: req.user.id });
      const { rows } = await q.query(ins.text, ins.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'calendar_item', entityId: rows[0].id, action: 'create' });
      return rows[0].id;
    });
    res.status(201).json({ item: await detail(id) });
  });

  r.patch('/calendar/:id', edit, async (req, res) => {
    const b = parse(updateSchema, req.body);
    await db.tx(async (q) => {
      const { rows } = await q.query('SELECT * FROM calendar_items WHERE id = $1 FOR UPDATE', [req.params.id]);
      const before = rows[0];
      if (!before) throw notFound('No existe esa pieza.');
      if (b.idea_id) await assertIdea(q, b.idea_id);
      const changed = diffFields(before, pick(b, EDITABLE), EDITABLE);
      if (!Object.keys(changed).length) return;
      const upd = buildUpdate('calendar_items', before.id, Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])));
      await q.query(upd.text, upd.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'calendar_item', entityId: before.id, action: 'update', diff: changed });
    });
    res.json({ item: await detail(req.params.id) });
  });

  r.delete('/calendar/:id', edit, requireFlag('can_delete'), async (req, res) => {
    const keys = await db.tx(async (q) => {
      const { rows } = await q.query('DELETE FROM calendar_items WHERE id = $1 RETURNING id, title', [req.params.id]);
      if (!rows[0]) throw notFound('No existe esa pieza.');
      const k = await files.removeOwnerRows(q, ['calendar_preview'], rows[0].id);
      await logActivity(q, { actorId: req.user.id, entityType: 'calendar_item', entityId: rows[0].id, action: 'delete', diff: { title: { from: rows[0].title, to: null } } });
      return k;
    });
    await files.purgeKeys(keys);
    res.json({ ok: true });
  });

  return r;
}
