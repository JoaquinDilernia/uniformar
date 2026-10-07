import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { insertIdea } from './helpers/fixtures.js';
import { diffFields } from '../src/services/activity.js';
import { buildUpdate } from '../src/lib/sql.js';

let ctx, admin, equipo, lectura;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo' })).agent;
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
});
afterAll(() => ctx.close());

describe('helpers', () => {
  it('diffFields compara por valor, incluidos arrays', () => {
    expect(diffFields({ a: 1, b: ['x'], c: null }, { a: 1, b: ['x', 'y'], c: 'z' }, ['a', 'b', 'c'])).toEqual({
      b: { from: ['x'], to: ['x', 'y'] },
      c: { from: null, to: 'z' },
    });
  });

  it('buildUpdate rechaza nombres de columna raros', () => {
    expect(() => buildUpdate('ideas', 'id', { 'text; drop': 'x' })).toThrow();
  });
});

describe('grilla fija', () => {
  it('cualquiera con calendario puede leerla', async () => {
    const res = await lectura.get('/api/settings/content-rules');
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(4);
    expect(res.body.rules[0]).toMatchObject({ weekday: 2, theme: 'Foco por rubro' });
  });

  it('solo edit en calendario la reemplaza, validando hora y canales', async () => {
    expect((await lectura.put('/api/settings/content-rules').send({ rules: [] })).status).toBe(403);
    const bad = await equipo.put('/api/settings/content-rules').send({ rules: [{ weekday: 1, time: '25:00', theme: 'x', channels: ['ig_post'] }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields['rules.0.time']).toBe('Hora inválida');
    const ok = await equipo.put('/api/settings/content-rules').send({
      rules: [
        { weekday: 1, time: '19:30', theme: 'Detrás de escena', format: 'Historias', channels: ['ig_story'], active: true },
        { weekday: 5, theme: 'Cliente real', format: 'Reel', channels: ['ig_reel', 'tiktok'] },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.rules.map((r) => r.theme)).toEqual(['Detrás de escena', 'Cliente real']);
    expect(ok.body.rules[1].time).toBeNull();
  });
});

describe('clientes', () => {
  it('crear es idempotente sin importar mayúsculas y espacios', async () => {
    const a = await equipo.post('/api/clients').send({ name: 'Estudio  Wonder' });
    const b = await equipo.post('/api/clients').send({ name: 'estudio wonder' });
    expect(a.status).toBe(201);
    expect(b.body.client.id).toBe(a.body.client.id);
    expect(a.body.client.name).toBe('Estudio Wonder');
  });

  it('renombrar a un nombre existente → 409', async () => {
    const posta = (await equipo.post('/api/clients').send({ name: 'POSTA' })).body.client;
    const res = await equipo.patch(`/api/clients/${posta.id}`).send({ name: 'estudio wonder' });
    expect(res.status).toBe(409);
  });

  it('unificar mueve las ideas y borra el duplicado (requiere borrar)', async () => {
    const dup = (await equipo.post('/api/clients').send({ name: 'Posta SRL' })).body.client;
    const posta = (await equipo.get('/api/clients')).body.clients.find((c) => c.name === 'POSTA');
    const idea = await insertIdea(ctx.db, { category: 'viernes', client_id: dup.id });
    expect((await equipo.post(`/api/clients/${dup.id}/merge`).send({ into_id: posta.id })).status).toBe(403);
    expect((await admin.post(`/api/clients/${dup.id}/merge`).send({ into_id: posta.id })).status).toBe(200);
    const { rows } = await ctx.db.query('SELECT client_id FROM ideas WHERE id = $1', [idea.id]);
    expect(rows[0].client_id).toBe(posta.id);
    const list = (await admin.get('/api/clients')).body.clients;
    expect(list.find((c) => c.id === dup.id)).toBeUndefined();
    expect(list.find((c) => c.id === posta.id).idea_count).toBe(1);
  });

  it('lectura no crea clientes', async () => {
    expect((await lectura.post('/api/clients').send({ name: 'Yaguar' })).status).toBe(403);
  });
});
