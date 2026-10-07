import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid } from '../lib/validate.js';
import { CHANNELS } from '../lib/channels.js';
import { requirePermission, requireFlag } from '../services/permissions.js';

const ruleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida').nullish(),
  theme: z.string().trim().min(1, 'Poné la temática').max(80),
  format: z.string().trim().max(80).default(''),
  channels: z.array(z.enum(CHANNELS)).max(4).default([]),
  active: z.boolean().default(true),
});
const rulesSchema = z.object({ rules: z.array(ruleSchema).max(30) });
const nameSchema = z.object({ name: z.string().trim().min(1, 'Poné el nombre').max(120) });
const mergeSchema = z.object({ into_id: uuid });

export function createSettingsRouter({ db, clientsRepo }) {
  const r = Router();

  async function rules() {
    const { rows } = await db.query('SELECT id, weekday, time, theme, format, channels, active, sort FROM content_rules ORDER BY sort');
    return rows;
  }

  r.get('/settings/content-rules', requirePermission('calendar', 'view'), async (_req, res) => res.json({ rules: await rules() }));

  r.put('/settings/content-rules', requirePermission('calendar', 'edit'), async (req, res) => {
    const body = parse(rulesSchema, req.body);
    await db.tx(async (q) => {
      await q.query('DELETE FROM content_rules');
      for (const [i, rule] of body.rules.entries()) {
        await q.query(
          'INSERT INTO content_rules (weekday, time, theme, format, channels, active, sort) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [rule.weekday, rule.time ?? null, rule.theme, rule.format, rule.channels, rule.active, i + 1],
        );
      }
    });
    res.json({ rules: await rules() });
  });

  r.get('/clients', requirePermission('ideas', 'view'), async (_req, res) => res.json({ clients: await clientsRepo.list() }));

  r.post('/clients', requirePermission('ideas', 'edit'), async (req, res) => {
    const { name } = parse(nameSchema, req.body);
    const id = await clientsRepo.upsertByName(db, name);
    res.status(201).json({ client: await clientsRepo.get(id) });
  });

  r.patch('/clients/:id', requirePermission('ideas', 'edit'), async (req, res) => {
    const { name } = parse(nameSchema, req.body);
    res.json({ client: await clientsRepo.rename(req.params.id, name) });
  });

  r.post('/clients/:id/merge', requirePermission('ideas', 'edit'), requireFlag('can_delete'), async (req, res) => {
    const { into_id } = parse(mergeSchema, req.body);
    await clientsRepo.merge(req.params.id, into_id);
    res.json({ ok: true });
  });

  return r;
}
