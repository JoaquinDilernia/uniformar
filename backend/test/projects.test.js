import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { PNG_1x1, PDF_MIN } from './helpers/fixtures.js';

let ctx, admin, equipo, equipoUser, lectura, bauti;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin', name: 'Joaco' })).agent;
  ({ agent: equipo, user: equipoUser } = await ctx.asUser({ template: 'equipo', name: 'Sofi' }));
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
  bauti = await ctx.createUser({ template: 'equipo', name: 'Bauti' });
});
afterAll(() => ctx.close());

const goal = 'Rediseñar la web:\n- rubros\n- catálogo 👕\n\nCon simulador.';

describe('proyectos', () => {
  let project;

  it('crea un proyecto con textos largos intactos', async () => {
    const res = await equipo.post('/api/projects').send({ name: 'Rediseño web', status: 'active', start_date: '2026-10-01', end_date: '2026-11-30', goal_text: goal });
    expect(res.status).toBe(201);
    project = res.body.project;
    expect(project).toMatchObject({ name: 'Rediseño web', goal_text: goal, doing_text: '', tasks: [], updates: [], photos: [], pdfs: [] });
  });

  it('cierre antes que inicio → 400', async () => {
    const res = await equipo.post('/api/projects').send({ name: 'X', start_date: '2026-10-10', end_date: '2026-10-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.end_date).toBe('Anterior al inicio');
    const p = (await equipo.post('/api/projects').send({ name: 'Y', start_date: '2026-10-10' })).body.project;
    expect((await equipo.patch(`/api/projects/${p.id}`).send({ end_date: '2026-10-01' })).status).toBe(400);
  });

  it('tareas con varias personas, fecha límite y check', async () => {
    const t = await equipo.post(`/api/projects/${project.id}/tasks`).send({ text: 'Armar catálogo', due_date: '2026-10-20', assignee_ids: [equipoUser.id, bauti.id] });
    expect(t.status).toBe(201);
    expect(t.body.task.assignee_ids.sort()).toEqual([equipoUser.id, bauti.id].sort());
    await equipo.post(`/api/projects/${project.id}/tasks`).send({ text: 'Fotos de producto' });
    const done = await equipo.patch(`/api/tasks/${t.body.task.id}`).send({ done: true, assignee_ids: [bauti.id] });
    expect(done.body.task).toMatchObject({ done: true, assignee_ids: [bauti.id] });
    expect(done.body.task.done_at).toBeTruthy();
    const { body } = await lectura.get(`/api/projects/${project.id}`);
    expect(body.project.tasks.map((x) => x.text)).toEqual(['Fotos de producto', 'Armar catálogo']); // abiertas primero
    const list = (await lectura.get('/api/projects')).body.projects;
    expect(list.find((p) => p.id === project.id)).toMatchObject({ task_total: 2, task_done: 1 });
    const undone = await equipo.patch(`/api/tasks/${t.body.task.id}`).send({ done: false });
    expect(undone.body.task.done_at).toBeNull();
  });

  it('asignar a un usuario inexistente o desactivado → 400', async () => {
    const off = await ctx.createUser({ template: 'equipo' });
    await ctx.usersRepo.update(off.id, { is_active: false });
    const res = await equipo.post(`/api/projects/${project.id}/tasks`).send({ text: 'x', assignee_ids: [off.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.assignee_ids).toBe('Hay una persona que no existe o está desactivada');
  });

  it('novedades con autor; solo el autor o quien puede borrar las elimina', async () => {
    const u = await equipo.post(`/api/projects/${project.id}/updates`).send({ body: 'Primera reunión con el diseñador ✅' });
    expect(u.status).toBe(201);
    expect(u.body.update).toMatchObject({ author_name: 'Sofi', body: 'Primera reunión con el diseñador ✅' });
    const { agent: otro } = await ctx.asUser({ template: 'equipo' });
    expect((await otro.delete(`/api/updates/${u.body.update.id}`)).status).toBe(403);
    expect((await equipo.delete(`/api/updates/${u.body.update.id}`)).status).toBe(200);
  });

  it('fotos y PDFs aparecen en el detalle', async () => {
    await equipo.post('/api/files').field('owner_type', 'project_photo').field('owner_id', project.id).attach('file', PNG_1x1, 'f.png');
    await equipo.post('/api/files').field('owner_type', 'project_pdf').field('owner_id', project.id).attach('file', PDF_MIN, 'brief.pdf');
    const { body } = await equipo.get(`/api/projects/${project.id}`);
    expect(body.project.photos).toHaveLength(1);
    expect(body.project.pdfs[0].original_name).toBe('brief.pdf');
  });

  it('cambio de estado queda en el historial', async () => {
    await equipo.patch(`/api/projects/${project.id}`).send({ status: 'done' });
    const { body } = await equipo.get(`/api/projects/${project.id}/activity`);
    expect(body.activity[0]).toMatchObject({ action: 'update', diff: { status: { from: 'active', to: 'done' } } });
  });

  it('permisos: lectura no crea; equipo no borra; admin borra con todo', async () => {
    expect((await lectura.post('/api/projects').send({ name: 'Z' })).status).toBe(403);
    expect((await equipo.delete(`/api/projects/${project.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/projects/${project.id}`)).status).toBe(200);
    expect((await equipo.get(`/api/projects/${project.id}`)).status).toBe(404);
    const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM files WHERE owner_id = $1', [project.id]);
    expect(rows[0].n).toBe(0);
  });
});
