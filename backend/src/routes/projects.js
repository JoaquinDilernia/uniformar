import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid, dateStr } from '../lib/validate.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { buildInsert, buildUpdate, pick } from '../lib/sql.js';
import { requirePermission, requireFlag } from '../services/permissions.js';
import { logActivity, diffFields } from '../services/activity.js';

const longText = z.string().max(20000);
const PROJECT = {
  name: z.string().trim().min(1, 'Poné un nombre').max(120),
  status: z.enum(['active', 'proposal', 'upcoming', 'done']),
  start_date: dateStr.nullish(),
  end_date: dateStr.nullish(),
  goal_text: longText,
  doing_text: longText,
  how_text: longText,
};
const createSchema = z.object({
  ...PROJECT, status: PROJECT.status.default('active'), goal_text: longText.default(''), doing_text: longText.default(''), how_text: longText.default(''),
});
const updateSchema = z.object(PROJECT).partial();
const TASK = {
  text: z.string().trim().min(1, 'Escribí la tarea').max(1000),
  due_date: dateStr.nullish(),
  assignee_ids: z.array(uuid).max(20),
  done: z.boolean(),
  sort: z.number().int().min(0).max(10000),
};
const taskCreateSchema = z.object({ text: TASK.text, due_date: TASK.due_date, assignee_ids: TASK.assignee_ids.default([]) });
const taskUpdateSchema = z.object(TASK).partial();
const updateBodySchema = z.object({ body: z.string().trim().min(1, 'Escribí la novedad').max(10000) });

function checkDates({ start_date, end_date }) {
  if (start_date && end_date && end_date < start_date) {
    throw badRequest('La fecha de cierre no puede ser anterior al inicio.', { end_date: 'Anterior al inicio' });
  }
}

export function createProjectsRouter({ db, projectsRepo, activityRepo, files }) {
  const r = Router();
  const view = requirePermission('projects', 'view');
  const edit = requirePermission('projects', 'edit');
  const touch = (q, id) => q.query('UPDATE projects SET updated_at = now() WHERE id = $1', [id]);

  async function mustProject(id) {
    const p = await projectsRepo.get(id);
    if (!p) throw notFound('No existe ese proyecto.');
    return p;
  }

  async function detail(id) {
    const p = await mustProject(id);
    const [tasks, updates, all] = await Promise.all([
      projectsRepo.tasks(id), projectsRepo.updates(id), files.listFor(['project_photo', 'project_pdf'], [id]),
    ]);
    return { ...p, tasks, updates, photos: all.filter((f) => f.owner_type === 'project_photo'), pdfs: all.filter((f) => f.owner_type === 'project_pdf') };
  }

  async function assertAssignees(q, ids) {
    if (!ids?.length) return;
    const { rows } = await q.query('SELECT count(*)::int AS n FROM users WHERE id = ANY($1) AND is_active', [ids]);
    if (rows[0].n !== new Set(ids).size) {
      throw badRequest('Hay una persona que no existe o está desactivada.', { assignee_ids: 'Hay una persona que no existe o está desactivada' });
    }
  }

  async function setAssignees(q, taskId, ids) {
    await q.query('DELETE FROM task_assignees WHERE task_id = $1', [taskId]);
    for (const userId of new Set(ids)) await q.query('INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)', [taskId, userId]);
  }

  r.get('/projects', view, async (_req, res) => res.json({ projects: await projectsRepo.list() }));
  r.get('/projects/:id', view, async (req, res) => res.json({ project: await detail(req.params.id) }));
  r.get('/projects/:id/activity', view, async (req, res) => res.json({ activity: await activityRepo.listFor('project', req.params.id) }));

  r.post('/projects', edit, async (req, res) => {
    const b = parse(createSchema, req.body);
    checkDates(b);
    const id = await db.tx(async (q) => {
      const ins = buildInsert('projects', { ...b, start_date: b.start_date ?? null, end_date: b.end_date ?? null, created_by: req.user.id });
      const { rows } = await q.query(ins.text, ins.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: rows[0].id, action: 'create' });
      return rows[0].id;
    });
    res.status(201).json({ project: await detail(id) });
  });

  r.patch('/projects/:id', edit, async (req, res) => {
    const b = parse(updateSchema, req.body);
    await db.tx(async (q) => {
      const { rows } = await q.query('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [req.params.id]);
      const before = rows[0];
      if (!before) throw notFound('No existe ese proyecto.');
      checkDates({ ...before, ...b });
      const changed = diffFields(before, b, Object.keys(PROJECT));
      if (!Object.keys(changed).length) return;
      const upd = buildUpdate('projects', before.id, Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])));
      await q.query(upd.text, upd.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: before.id, action: 'update', diff: changed });
    });
    res.json({ project: await detail(req.params.id) });
  });

  r.delete('/projects/:id', edit, requireFlag('can_delete'), async (req, res) => {
    const keys = await db.tx(async (q) => {
      const { rows } = await q.query('DELETE FROM projects WHERE id = $1 RETURNING id, name', [req.params.id]);
      if (!rows[0]) throw notFound('No existe ese proyecto.');
      const k = await files.removeOwnerRows(q, ['project_photo', 'project_pdf'], rows[0].id);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: rows[0].id, action: 'delete', diff: { name: { from: rows[0].name, to: null } } });
      return k;
    });
    await files.purgeKeys(keys);
    res.json({ ok: true });
  });

  r.post('/projects/:id/tasks', edit, async (req, res) => {
    const b = parse(taskCreateSchema, req.body);
    const project = await mustProject(req.params.id);
    const task = await db.tx(async (q) => {
      await assertAssignees(q, b.assignee_ids);
      const { rows: [{ next }] } = await q.query('SELECT COALESCE(max(sort), -1) + 1 AS next FROM project_tasks WHERE project_id = $1', [project.id]);
      const ins = buildInsert('project_tasks', { project_id: project.id, text: b.text, due_date: b.due_date ?? null, sort: next });
      const { rows } = await q.query(ins.text, ins.params);
      await setAssignees(q, rows[0].id, b.assignee_ids);
      await touch(q, project.id);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: project.id, action: 'task_create', diff: { task: { from: null, to: b.text } } });
      return projectsRepo.task(q, rows[0].id);
    });
    res.status(201).json({ task });
  });

  r.patch('/tasks/:id', edit, async (req, res) => {
    const b = parse(taskUpdateSchema, req.body);
    const task = await db.tx(async (q) => {
      const before = await projectsRepo.task(q, req.params.id);
      if (!before) throw notFound('No existe esa tarea.');
      const values = pick(b, ['text', 'due_date', 'done', 'sort']);
      if (b.done !== undefined && b.done !== before.done) values.done_at = b.done ? new Date() : null;
      const upd = buildUpdate('project_tasks', before.id, values);
      await q.query(upd.text, upd.params);
      if (b.assignee_ids) {
        await assertAssignees(q, b.assignee_ids);
        await setAssignees(q, before.id, b.assignee_ids);
      }
      await touch(q, before.project_id);
      const diff = diffFields(before, { ...pick(b, ['text', 'due_date', 'done']), ...(b.assignee_ids ? { assignee_ids: [...b.assignee_ids].sort() } : {}) },
        ['text', 'due_date', 'done', 'assignee_ids']);
      if (Object.keys(diff).length) {
        await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: before.project_id, action: 'task_update', diff: { ...diff, task: { from: before.text, to: before.text } } });
      }
      return projectsRepo.task(q, before.id);
    });
    res.json({ task });
  });

  r.delete('/tasks/:id', edit, requireFlag('can_delete'), async (req, res) => {
    await db.tx(async (q) => {
      const { rows } = await q.query('DELETE FROM project_tasks WHERE id = $1 RETURNING project_id, text', [req.params.id]);
      if (!rows[0]) throw notFound('No existe esa tarea.');
      await touch(q, rows[0].project_id);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: rows[0].project_id, action: 'task_delete', diff: { task: { from: rows[0].text, to: null } } });
    });
    res.json({ ok: true });
  });

  r.post('/projects/:id/updates', edit, async (req, res) => {
    const { body } = parse(updateBodySchema, req.body);
    const project = await mustProject(req.params.id);
    const id = await db.tx(async (q) => {
      const { rows } = await q.query('INSERT INTO project_updates (project_id, author_id, body) VALUES ($1, $2, $3) RETURNING id', [project.id, req.user.id, body]);
      await touch(q, project.id);
      return rows[0].id;
    });
    const update = (await projectsRepo.updates(project.id)).find((u) => u.id === id);
    res.status(201).json({ update });
  });

  r.delete('/updates/:id', edit, async (req, res) => {
    const { rows } = await db.query('SELECT id, author_id FROM project_updates WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('No existe esa novedad.');
    if (rows[0].author_id !== req.user.id && !req.user.can_delete) {
      throw forbidden('Solo el autor o alguien con permiso de borrar puede eliminar esta novedad.');
    }
    await db.query('DELETE FROM project_updates WHERE id = $1', [rows[0].id]);
    res.json({ ok: true });
  });

  return r;
}
