import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { PNG_1x1, PDF_MIN, insertIdea, insertProject, insertCalendarItem } from './helpers/fixtures.js';
import { createFilesService } from '../src/services/files.js';

let ctx, admin, equipo, lectura, idea;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo' })).agent;
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
  idea = await insertIdea(ctx.db, { format: 'photo' });
});
afterAll(() => ctx.close());

const up = (agent, ownerType, ownerId, buffer, name = 'foto.png') =>
  agent.post('/api/files').field('owner_type', ownerType).field('owner_id', ownerId).attach('file', buffer, name);

describe('archivos', () => {
  it('sube una imagen, guarda medidas y se puede leer', async () => {
    const res = await up(equipo, 'idea_ref', idea.id, PNG_1x1);
    expect(res.status).toBe(201);
    expect(res.body.file).toMatchObject({ kind: 'image', mime: 'image/png', width: 1, height: 1, original_name: 'foto.png' });
    expect(res.body.file.url).toBe(`/api/files/${res.body.file.id}/raw`);
    const raw = await lectura.get(res.body.file.url);
    expect(raw.status).toBe(200);
    expect(raw.headers['content-type']).toMatch(/image\/png/);
  });

  it('detecta el tipo real: texto con extensión .png → 415', async () => {
    const res = await up(equipo, 'idea_ref', idea.id, Buffer.from('hola, no soy imagen'), 'trucho.png');
    expect(res.status).toBe(415);
    expect(res.body.error.message).toBe('Solo se aceptan imágenes JPG, PNG o WebP.');
  });

  it('PDF solo en project_pdf', async () => {
    const project = await insertProject(ctx.db);
    expect((await up(equipo, 'idea_ref', idea.id, PDF_MIN, 'doc.pdf')).status).toBe(415);
    const ok = await up(equipo, 'project_pdf', project.id, PDF_MIN, 'propuesta.pdf');
    expect(ok.status).toBe(201);
    expect(ok.body.file.kind).toBe('pdf');
  });

  it('imagen de más de 2 MB → 413 con mensaje claro', async () => {
    const big = Buffer.concat([PNG_1x1, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await up(equipo, 'idea_ref', idea.id, big);
    expect(res.status).toBe(413);
    expect(res.body.error.message).toBe('La imagen pesa más de 2 MB.');
  });

  it('dueño inexistente → 404; sin archivo → 400', async () => {
    expect((await up(equipo, 'idea_ref', '00000000-0000-0000-0000-000000000000', PNG_1x1)).status).toBe(404);
    const res = await equipo.post('/api/files').field('owner_type', 'idea_ref').field('owner_id', idea.id);
    expect(res.status).toBe(400);
  });

  it('permisos: lectura no sube; sin acceso a ideas no lee', async () => {
    expect((await up(lectura, 'idea_ref', idea.id, PNG_1x1)).status).toBe(403);
    const file = (await up(equipo, 'idea_ref', idea.id, PNG_1x1)).body.file;
    const { agent: sinIdeas } = await ctx.asUser({ template: 'equipo', permissions: { ideas: 'none' } });
    expect((await sinIdeas.get(file.url)).status).toBe(403);
  });

  it('máximo 10 previsualizaciones por pieza', async () => {
    const item = await insertCalendarItem(ctx.db);
    for (let i = 0; i < 10; i++) expect((await up(equipo, 'calendar_preview', item.id, PNG_1x1)).status).toBe(201);
    const res = await up(equipo, 'calendar_preview', item.id, PNG_1x1);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Máximo 10 archivos acá.');
  });

  it('borrar requiere can_delete y elimina del storage', async () => {
    const file = (await up(equipo, 'idea_ref', idea.id, PNG_1x1)).body.file;
    expect((await equipo.delete(`/api/files/${file.id}`)).status).toBe(403);
    const { rows } = await ctx.db.query('SELECT storage_key FROM files WHERE id = $1', [file.id]);
    expect((await admin.delete(`/api/files/${file.id}`)).status).toBe(200);
    await expect(fs.access(path.join(ctx.dir, rows[0].storage_key))).rejects.toThrow();
  });

  it('reordenar', async () => {
    const it2 = await insertIdea(ctx.db, { format: 'photo' });
    const a = (await up(equipo, 'idea_ref', it2.id, PNG_1x1)).body.file;
    const b = (await up(equipo, 'idea_ref', it2.id, PNG_1x1)).body.file;
    expect((await equipo.patch('/api/files/order').send({ ids: [b.id, a.id] })).status).toBe(200);
    const { rows } = await ctx.db.query('SELECT id FROM files WHERE owner_id = $1 ORDER BY sort', [it2.id]);
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it('si el storage falla al borrar, queda pendiente y se reintenta', async () => {
    let fail = true;
    const storage = { ...ctx.storage, remove: async (key) => { if (fail) throw new Error('caído'); return ctx.storage.remove(key); } };
    const files = createFilesService({ db: ctx.db, storage });
    await files.purgeKeys(['idea_ref/x/y.png']);
    let { rows } = await ctx.db.query('SELECT * FROM storage_deletions_pending');
    expect(rows.map((r) => r.storage_key)).toContain('idea_ref/x/y.png');
    fail = false;
    expect(await files.retryPending()).toBe(1);
    ({ rows } = await ctx.db.query('SELECT * FROM storage_deletions_pending'));
    expect(rows).toHaveLength(0);
  });
});
