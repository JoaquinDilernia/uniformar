import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createTestContext } from './helpers/testApp.js';
import { MP4_MIN } from './helpers/fixtures.js';

const MB = 1024 * 1024;
let ctx, admin, equipo, creativeId;
beforeAll(async () => {
  ctx = await createTestContext();
  ({ agent: admin } = await ctx.asUser({ template: 'admin' }));
  ({ agent: equipo } = await ctx.asUser({ template: 'equipo' }));
  creativeId = (await admin.post('/api/ads/creatives').send({ name: 'Video', copy: 'texto' })).body.creative.id;
});
afterAll(() => ctx.close());

const ask = (agent, o = {}) => agent.post('/api/files/upload-url').send({
  owner_type: 'ad_feed', owner_id: creativeId, mime: 'video/mp4', bytes: MP4_MIN.length, original_name: 'reel.mp4', ...o,
});
const putLocal = (agent, url, body) => agent.put(url).set('Content-Type', 'video/mp4').send(body);

describe('subida de videos', () => {
  it('valida permisos, tipo y tamaño antes de dar el link', async () => {
    expect((await ask(equipo)).status).toBe(403);
    expect((await ask(admin, { mime: 'video/webm' })).status).toBe(415);
    expect((await ask(admin, { bytes: 200 * MB + 1 })).status).toBe(413);
    expect((await ask(admin, { owner_type: 'idea_ref' })).status).toBe(400);
  });

  it('pide link, sube y confirma; confirmar dos veces devuelve el mismo archivo', async () => {
    const res = await ask(admin);
    expect(res.status).toBe(200);
    expect(res.body.upload_url).toMatch(/^\/api\/files\/local-upload\//);
    expect((await putLocal(admin, res.body.upload_url, MP4_MIN)).status).toBe(200);
    const done = await admin.post('/api/files/complete').send({ token: res.body.token });
    expect(done.status).toBe(201);
    expect(done.body.file).toMatchObject({ owner_type: 'ad_feed', owner_id: creativeId, kind: 'video', mime: 'video/mp4', bytes: MP4_MIN.length, original_name: 'reel.mp4' });
    const again = await admin.post('/api/files/complete').send({ token: res.body.token });
    expect(again.status).toBe(201);
    expect(again.body.file.id).toBe(done.body.file.id);
    const { rows } = await ctx.db.query("SELECT count(*)::int AS n FROM files WHERE owner_id = $1 AND kind = 'video'", [creativeId]);
    expect(rows[0].n).toBe(1);
    // Cupo: ad_feed admite un archivo
    expect((await ask(admin)).status).toBe(409);
    await ctx.app.locals.files.remove(done.body.file.id); // borra fila y archivo del disco
  });

  it('si lo subido no coincide con lo declarado o no es video, se rechaza y se borra', async () => {
    const short = await ask(admin, { bytes: MP4_MIN.length + 10 });
    await putLocal(admin, short.body.upload_url, MP4_MIN);
    const r1 = await admin.post('/api/files/complete').send({ token: short.body.token });
    expect(r1.status).toBe(400);
    expect(r1.body.error.message).toBe('El video no se subió completo. Probá de nuevo.');

    const fake = Buffer.alloc(300, 1);
    const notVideo = await ask(admin, { bytes: fake.length });
    await putLocal(admin, notVideo.body.upload_url, fake);
    const r2 = await admin.post('/api/files/complete').send({ token: notVideo.body.token });
    expect(r2.status).toBe(415);

    const left = await fs.readdir(path.join(ctx.dir, 'ad_feed', creativeId)).catch(() => []);
    expect(left).toEqual([]);
  });

  it('subir más bytes de los declarados corta la subida', async () => {
    const res = await ask(admin, { bytes: 50 });
    expect((await putLocal(admin, res.body.upload_url, MP4_MIN)).status).toBe(413);
  });

  it('token adulterado, vencido o de otro usuario', async () => {
    expect((await admin.post('/api/files/complete').send({ token: 'x.y.z' })).status).toBe(400);
    const res = await ask(admin);
    await putLocal(admin, res.body.upload_url, MP4_MIN);
    const other = (await ctx.asUser({ template: 'admin' })).agent;
    expect((await other.post('/api/files/complete').send({ token: res.body.token })).status).toBe(403);
  });
});
