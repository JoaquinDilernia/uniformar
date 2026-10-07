import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { PNG_1x1, insertCalendarItem } from './helpers/fixtures.js';

let ctx, admin, equipo, equipoUser, lectura, santi;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  ({ agent: equipo, user: equipoUser } = await ctx.asUser({ template: 'equipo', name: 'Sofi' }));
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
  santi = await ctx.createUser({ template: 'equipo', name: 'Santi' });
});
afterAll(() => ctx.close());

const base = { kind: 'idea', format: 'video', category: 'domingo', text: 'Reel de humor con el delantal' };
const create = (agent, body = {}) => agent.post('/api/ideas').send({ ...base, ...body });

describe('ideas', () => {
  it('crea una idea por decidir, asignada', async () => {
    const res = await create(equipo, { assignee_id: santi.id });
    expect(res.status).toBe(201);
    expect(res.body.idea).toMatchObject({ status: 'por_decidir', decision: 'pending', assignee_name: 'Santi', ref_files: [], result_files: [] });
  });

  it('cliente solo para viernes; se reutiliza sin importar mayúsculas', async () => {
    const a = (await create(equipo, { category: 'viernes', client_name: 'Estudio Wonder' })).body.idea;
    const b = (await create(equipo, { category: 'viernes', client_name: 'estudio wonder' })).body.idea;
    const c = (await create(equipo, { category: 'domingo', client_name: 'Yaguar' })).body.idea;
    expect(a.client_id).toBe(b.client_id);
    expect(a.client_name).toBe('Estudio Wonder');
    expect(c.client_id).toBeNull();
  });

  it('fecha límite solo para "sí o sí"', async () => {
    const must = (await create(equipo, { kind: 'must', format: 'photo', category: 'producto', due_date: '2026-10-31' })).body.idea;
    const idea = (await create(equipo, { due_date: '2026-10-31' })).body.idea;
    expect(must).toMatchObject({ status: 'si_o_si', due_date: '2026-10-31' });
    expect(idea.due_date).toBeNull();
  });

  it('textos largos con saltos de línea y emojis vuelven idénticos, con autor de la nota', async () => {
    const note = 'Línea 1\nLínea 2 🎬\n\n  con sangría y "comillas"';
    const res = await create(equipo, { text: 'Idea\ncon dos líneas 😂', note_sofi: note });
    expect(res.body.idea.text).toBe('Idea\ncon dos líneas 😂');
    expect(res.body.idea.note_sofi).toBe(note);
    expect(res.body.idea.note_sofi_by_name).toBe('Sofi');
  });

  it('validaciones con mensajes en español', async () => {
    const res = await create(equipo, { text: '', reference_url: 'instagram.com/reel/x' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toMatchObject({ text: 'Escribí la idea', reference_url: 'Link inválido' });
  });

  it('flujo: decidir sí → por hacer → realizada (link obligatorio) → reabrir', async () => {
    const id = (await create(equipo)).body.idea.id;
    expect((await equipo.post(`/api/ideas/${id}/complete`).send({ result_url: 'https://drive.google.com/x' })).body.error.message)
      .toBe('Primero marcá "Sí la hago".');
    expect((await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'yes' })).body.idea.status).toBe('por_hacer');
    const noLink = await equipo.post(`/api/ideas/${id}/complete`).send({});
    expect(noLink.status).toBe(400);
    expect(noLink.body.error.fields.result_url).toBe('Pegá el link del resultado');
    const done = await equipo.post(`/api/ideas/${id}/complete`).send({ result_url: 'https://www.instagram.com/reel/abc/' });
    expect(done.body.idea).toMatchObject({ status: 'realizada', result_url: 'https://www.instagram.com/reel/abc/' });
    expect(done.body.idea.done_at).toBeTruthy();
    expect((await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'no' })).status).toBe(409);
    expect((await equipo.post(`/api/ideas/${id}/reopen`)).body.idea.status).toBe('por_hacer');
  });

  it('decidir no y deshacer', async () => {
    const id = (await create(equipo)).body.idea.id;
    expect((await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'no' })).body.idea.status).toBe('no_se_hace');
    expect((await equipo.post(`/api/ideas/${id}/complete`).send({ result_url: 'https://x.com' })).status).toBe(409);
    expect((await equipo.post(`/api/ideas/${id}/undecide`)).body.idea.status).toBe('por_decidir');
  });

  it('"sí o sí" no se decide pero sí se completa', async () => {
    const id = (await create(equipo, { kind: 'must' })).body.idea.id;
    const res = await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'yes' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Los contenidos "sí o sí" no se deciden: ya están por hacer.');
    expect((await equipo.post(`/api/ideas/${id}/complete`).send({ result_url: 'https://x.com/r' })).body.idea.status).toBe('realizada');
  });

  it('editar todo: idea → sí o sí reinicia decisión; dejar de ser viernes limpia cliente', async () => {
    const created = (await create(equipo, { category: 'viernes', client_name: 'POSTA' })).body.idea;
    await equipo.post(`/api/ideas/${created.id}/decide`).send({ decision: 'no' });
    const res = await equipo.patch(`/api/ideas/${created.id}`).send({ kind: 'must', category: 'producto', text: 'Fotos de catálogo' });
    expect(res.body.idea).toMatchObject({ kind: 'must', status: 'si_o_si', client_id: null, text: 'Fotos de catálogo' });
  });

  it('historial registra quién hizo qué', async () => {
    const id = (await create(equipo)).body.idea.id;
    await equipo.patch(`/api/ideas/${id}`).send({ text: 'Otro texto' });
    await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'yes' });
    const { body } = await lectura.get(`/api/ideas/${id}/activity`);
    expect(body.activity.map((a) => a.action)).toEqual(['decide_yes', 'update', 'create']);
    expect(body.activity[1].diff.text).toEqual({ from: base.text, to: 'Otro texto' });
    expect(body.activity[0].actor_name).toBe('Sofi');
  });

  it('lectura ve pero no edita', async () => {
    expect((await lectura.get('/api/ideas')).status).toBe(200);
    const res = await create(lectura);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('No tenés permiso para editar Ideas');
  });

  it('borrar: requiere permiso, borra archivos y deja la pieza vinculada sin idea', async () => {
    const id = (await create(equipo, { format: 'photo' })).body.idea.id;
    const item = await insertCalendarItem(ctx.db, { idea_id: id });
    const file = (await equipo.post('/api/files').field('owner_type', 'idea_ref').field('owner_id', id).attach('file', PNG_1x1, 'r.png')).body.file;
    const { rows: [{ storage_key }] } = await ctx.db.query('SELECT storage_key FROM files WHERE id = $1', [file.id]);
    const detail = (await equipo.get(`/api/ideas/${id}`)).body.idea;
    expect(detail.ref_files).toHaveLength(1);
    expect(detail.calendar_links).toEqual([{ id: item.id, date: '2026-10-07' }]);
    expect((await equipo.delete(`/api/ideas/${id}`)).status).toBe(403);
    expect((await admin.delete(`/api/ideas/${id}`)).status).toBe(200);
    expect((await equipo.get(`/api/ideas/${id}`)).status).toBe(404);
    const { rows } = await ctx.db.query('SELECT idea_id FROM calendar_items WHERE id = $1', [item.id]);
    expect(rows[0].idea_id).toBeNull();
    await expect(fs.access(path.join(ctx.dir, storage_key))).rejects.toThrow();
  });

  it('lista ordenada de más nueva a más vieja', async () => {
    const { body } = await equipo.get('/api/ideas');
    const dates = body.ideas.map((i) => new Date(i.created_at).getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    expect(equipoUser.name).toBe('Sofi');
  });
});
