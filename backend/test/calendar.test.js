import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { insertIdea, PNG_1x1 } from './helpers/fixtures.js';

let ctx, admin, equipo, lectura;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo' })).agent;
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
});
afterAll(() => ctx.close());

describe('calendario', () => {
  it('crea una pieza con canales e idea vinculada', async () => {
    const idea = await insertIdea(ctx.db, { decision: 'yes' });
    const res = await equipo.post('/api/calendar').send({ date: '2026-10-10', title: 'Reel cliente POSTA', channels: ['ig_reel', 'tiktok'], idea_id: idea.id });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ date: '2026-10-10', status: 'draft', channels: ['ig_reel', 'tiktok'], idea: { id: idea.id, status: 'por_hacer' }, previews: [] });
  });

  it('varias piezas el mismo día, ordenadas', async () => {
    await equipo.post('/api/calendar').send({ date: '2026-10-08', title: 'Historia 1', channels: ['ig_story'] });
    await equipo.post('/api/calendar').send({ date: '2026-10-08', title: 'Historia 2', channels: ['ig_story'] });
    const { body } = await lectura.get('/api/calendar?from=2026-10-01&to=2026-10-31');
    expect(body.items.filter((i) => i.date === '2026-10-08').map((i) => i.title)).toEqual(['Historia 1', 'Historia 2']);
  });

  it('valida canal, link, idea y rango', async () => {
    const bad = await equipo.post('/api/calendar').send({ date: '2026-10-10', channels: ['facebook'], piece_url: 'nope' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['channels.0', 'piece_url']));
    const noIdea = await equipo.post('/api/calendar').send({ date: '2026-10-10', idea_id: '00000000-0000-0000-0000-000000000000' });
    expect(noIdea.status).toBe(400);
    expect(noIdea.body.error.fields.idea_id).toBe('Esa idea no existe');
    expect((await equipo.get('/api/calendar?from=2026-01-01&to=2026-12-31')).status).toBe(400);
    expect((await equipo.get('/api/calendar?from=2026-10-31&to=2026-10-01')).status).toBe(400);
    expect((await equipo.get('/api/calendar')).status).toBe(400);
  });

  it('editar estado, copy y link; queda en el historial', async () => {
    const item = (await equipo.post('/api/calendar').send({ date: '2026-10-14', title: 'Carrusel gastronomía' })).body.item;
    const res = await equipo.patch(`/api/calendar/${item.id}`).send({ status: 'ready', copy: 'Uniformá tu cocina 👨‍🍳\n#gastronomía', piece_url: 'https://drive.google.com/file/d/abc' });
    expect(res.body.item).toMatchObject({ status: 'ready', copy: 'Uniformá tu cocina 👨‍🍳\n#gastronomía' });
    const { rows } = await ctx.db.query(`SELECT action, diff FROM activity_log WHERE entity_type = 'calendar_item' AND entity_id = $1 ORDER BY id`, [item.id]);
    expect(rows.map((r) => r.action)).toEqual(['create', 'update']);
    expect(rows[1].diff.status).toEqual({ from: 'draft', to: 'ready' });
  });

  it('previsualizaciones vienen con la pieza', async () => {
    const item = (await equipo.post('/api/calendar').send({ date: '2026-10-15', channels: ['ig_post'] })).body.item;
    await equipo.post('/api/files').field('owner_type', 'calendar_preview').field('owner_id', item.id).attach('file', PNG_1x1, 'p.png');
    const { body } = await equipo.get(`/api/calendar/${item.id}`);
    expect(body.item.previews).toHaveLength(1);
    expect(body.item.preview_count).toBe(1);
  });

  it('borrar una idea deja la pieza sin idea, sin romper el calendario', async () => {
    const idea = (await admin.post('/api/ideas').send({ kind: 'idea', format: 'video', category: 'domingo', text: 'x' })).body.idea;
    const item = (await equipo.post('/api/calendar').send({ date: '2026-10-19', idea_id: idea.id })).body.item;
    await admin.delete(`/api/ideas/${idea.id}`);
    const { body } = await equipo.get(`/api/calendar/${item.id}`);
    expect(body.item.idea).toBeNull();
    expect(body.item.idea_id).toBeNull();
  });

  it('permisos: lectura no crea; equipo no borra; admin sí', async () => {
    expect((await lectura.post('/api/calendar').send({ date: '2026-10-10' })).status).toBe(403);
    const item = (await equipo.post('/api/calendar').send({ date: '2026-10-20' })).body.item;
    expect((await equipo.delete(`/api/calendar/${item.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/calendar/${item.id}`)).status).toBe(200);
    expect((await equipo.get(`/api/calendar/${item.id}`)).status).toBe(404);
  });
});
