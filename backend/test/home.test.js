import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { insertIdea, insertProject, insertCalendarItem } from './helpers/fixtures.js';

let ctx, sofi, santi, bauti, sofiAgent;
beforeAll(async () => {
  ctx = await createTestContext();
  ({ user: sofi, agent: sofiAgent } = await ctx.asUser({ template: 'admin', name: 'Sofi' }));
  santi = await ctx.createUser({ template: 'equipo', name: 'Santi' });
  bauti = await ctx.createUser({ template: 'equipo', name: 'Bauti' });
  const db = ctx.db;
  // semana del 5 al 11 de octubre de 2026
  await insertIdea(db, { text: 'Lunes 00:30 ART', created_at: '2026-10-05T03:30:00Z', assignee_id: santi.id });
  await insertIdea(db, { text: 'Domingo anterior 23:30 ART', created_at: '2026-10-05T02:30:00Z', assignee_id: santi.id });
  await insertIdea(db, { text: 'Por hacer de Santi', decision: 'yes', assignee_id: santi.id, created_at: '2026-09-01T12:00:00Z' });
  await insertIdea(db, { text: 'Sí o sí de Santi', kind: 'must', due_date: '2026-10-09', assignee_id: santi.id, created_at: '2026-09-01T12:00:00Z' });
  await insertIdea(db, { text: 'Hecha', decision: 'yes', done_at: '2026-10-06T15:00:00Z', result_url: 'https://instagram.com/reel/x', created_at: '2026-09-01T12:00:00Z' });
  const active = await insertProject(db, { name: 'Meta Ads', status: 'active' });
  const proposal = await insertProject(db, { name: 'LinkedIn', status: 'proposal' });
  const t1 = (await db.query(`INSERT INTO project_tasks (project_id, text) VALUES ($1, 'Duplicar conjunto a WhatsApp') RETURNING id`, [active.id])).rows[0];
  const t2 = (await db.query(`INSERT INTO project_tasks (project_id, text) VALUES ($1, 'Tarea de propuesta') RETURNING id`, [proposal.id])).rows[0];
  await db.query(`INSERT INTO project_tasks (project_id, text, done) VALUES ($1, 'Hecha', true)`, [active.id]);
  await db.query('INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2), ($1, $3), ($4, $2)', [t1.id, bauti.id, sofi.id, t2.id]);
  await insertCalendarItem(db, { date: '2026-10-06', title: 'Carrusel salud', status: 'ready', channels: ['ig_post'] });
  await insertCalendarItem(db, { date: '2026-10-09', title: 'Reel cliente', status: 'draft' });
  await insertCalendarItem(db, { date: '2026-10-09', title: 'Extra', status: 'published' });
});
afterAll(() => ctx.close());

describe('inicio', () => {
  it('semana con grilla fija y estado de cada día', async () => {
    const { body } = await sofiAgent.get('/api/home?week=2026-10-08');
    expect(body.week).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
    const byDate = Object.fromEntries(body.week.days.map((d) => [d.date, d]));
    expect(byDate['2026-10-06'].rules[0].theme).toBe('Foco por rubro');
    expect(byDate['2026-10-06'].state).toBe('ready');
    expect(byDate['2026-10-09'].state).toBe('planned');
    expect(byDate['2026-10-07'].state).toBe('empty');
    expect(byDate['2026-10-11'].rules[0]).toMatchObject({ theme: 'Humor / trend', time: '20:00' });
  });

  it('contadores de la semana en hora argentina', async () => {
    const { body } = await sofiAgent.get('/api/home?week=2026-10-08');
    // "Lunes 00:30 ART" cuenta; "Domingo anterior 23:30 ART" no. Las demás se crearon en septiembre.
    expect(body.counters.new_ideas_week).toBe(1);
    expect(body.counters.done_week).toBe(1);
    expect(body.counters.to_decide).toBe(2);
    expect(body.counters.active_projects).toBe(1);
  });

  it('pendientes por persona: solo usuarios activos y tareas de proyectos activos', async () => {
    const off = await ctx.createUser({ template: 'equipo', name: 'Agus' });
    await ctx.usersRepo.update(off.id, { is_active: false });
    const { body } = await sofiAgent.get('/api/home');
    const names = body.pending_by_user.map((p) => p.user.name);
    expect(names).not.toContain('Agus');
    const bautiCol = body.pending_by_user.find((p) => p.user.id === bauti.id);
    expect(bautiCol.tasks.map((t) => t.text)).toEqual(['Duplicar conjunto a WhatsApp']);
    const santiCol = body.pending_by_user.find((p) => p.user.id === santi.id);
    expect(santiCol.ideas.map((i) => i.text).sort()).toEqual(['Por hacer de Santi', 'Sí o sí de Santi']);
  });

  it('"te toca" de cada usuario', async () => {
    const santiAgent = await ctx.agentFor(santi.email);
    const { body } = await santiAgent.get('/api/home');
    expect(body.mine.to_decide.map((i) => i.text).sort()).toEqual(['Domingo anterior 23:30 ART', 'Lunes 00:30 ART']);
    expect(body.mine.to_do.map((i) => i.text).sort()).toEqual(['Por hacer de Santi', 'Sí o sí de Santi']);
    const sofiHome = (await sofiAgent.get('/api/home')).body;
    expect(sofiHome.mine.tasks.map((t) => t.text)).toEqual(['Duplicar conjunto a WhatsApp']);
  });

  it('realizado reciente y proyectos', async () => {
    const { body } = await sofiAgent.get('/api/home');
    expect(body.recently_done[0]).toMatchObject({ text: 'Hecha', result_url: 'https://instagram.com/reel/x', thumb_url: null });
    expect(body.projects.active).toEqual([expect.objectContaining({ name: 'Meta Ads', task_total: 2, task_done: 1 })]);
    expect(body.projects.proposals.map((p) => p.name)).toEqual(['LinkedIn']);
  });

  it('cada bloque respeta los permisos', async () => {
    const { agent } = await ctx.asUser({ template: 'equipo', permissions: { ideas: 'none', projects: 'none' } });
    const { body } = await agent.get('/api/home');
    expect(body.to_decide).toBeNull();
    expect(body.projects).toBeNull();
    expect(body.counters.to_decide).toBeNull();
    expect(body.week).not.toBeNull();
    expect(body.pending_by_user.every((p) => p.ideas.length === 0 && p.tasks.length === 0)).toBe(true);
    const { agent: noHome } = await ctx.asUser({ template: 'equipo', permissions: { home: 'none' } });
    expect((await noHome.get('/api/home')).status).toBe(403);
  });
});
