import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { PNG_1x1 } from './helpers/fixtures.js';
import { config, fakeMeta } from './helpers/adsFakes.js';
import { planChannel } from '../src/services/igPublisher.js';

// Meta falsa para la publicación orgánica: contenedores c1, c2… y posts m1, m2…
function igMeta() {
  const meta = fakeMeta();
  let n = 0;
  meta.createIgContainer = async (igUserId, params) => {
    meta.calls.push(['createIgContainer', igUserId, params]);
    return `c${++n}`;
  };
  meta.waitIgContainer = async (id) => { meta.calls.push(['waitIgContainer', id]); };
  meta.publishIgContainer = async (igUserId, id) => { meta.calls.push(['publishIgContainer', id]); return `m${id.slice(1)}`; };
  meta.igPermalink = async (id) => `https://instagram.com/p/${id}`;
  return meta;
}

const f = (kind, url = `https://r2.test/${kind}`) => ({ kind, url });

// Fecha y hora argentinas de un momento (para programar piezas relativas a "ahora")
function art(offsetMin) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + offsetMin * 60_000)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

describe('qué archivo va a cada canal', () => {
  it('reel con el video, post con las imágenes, historias con todo', () => {
    const media = [f('video'), f('image', 'https://r2.test/1.jpg'), f('image', 'https://r2.test/2.jpg')];
    expect(planChannel('ig_reel', media, ['ig_reel', 'ig_post'])).toEqual({ type: 'reel', files: [media[0]] });
    expect(planChannel('ig_post', media, ['ig_reel', 'ig_post'])).toEqual({ type: 'carousel', files: media.slice(1) });
    expect(planChannel('ig_post', media, ['ig_post']).type).toBe('carousel');
    expect(planChannel('ig_post', [f('video')], ['ig_post']).type).toBe('reel');
    expect(planChannel('ig_post', [f('image')], ['ig_post']).type).toBe('image');
    expect(planChannel('ig_story', media, ['ig_story']).files).toHaveLength(3);
  });

  it('avisa qué falta', () => {
    expect(() => planChannel('ig_reel', [], ['ig_reel'])).toThrow(/no tiene archivos/);
    expect(() => planChannel('ig_reel', [f('image')], ['ig_reel'])).toThrow(/necesita un video/);
    expect(() => planChannel('ig_post', [f('video')], ['ig_reel', 'ig_post'])).toThrow(/al menos una imagen/);
    expect(() => planChannel('ig_story', [f('image', '/api/files/1/raw')], ['ig_story'])).toThrow(/storage local/);
  });
});

describe('publicar en Instagram desde el calendario', () => {
  let ctx, admin, lectura, meta, publisher;
  beforeAll(async () => {
    meta = igMeta();
    ctx = await createTestContext({ ads: { meta, config }, urlFor: async (file) => `https://r2.test/${file.storage_key}` });
    admin = (await ctx.asUser({ template: 'admin' })).agent;
    lectura = (await ctx.asUser({ template: 'lectura' })).agent;
    publisher = ctx.app.locals.igPublisher;
  });
  afterAll(() => ctx.close());
  beforeEach(() => { meta.calls.length = 0; });

  async function item(body, media = []) {
    const { body: { item: it } } = await admin.post('/api/calendar').send({ date: '2026-10-10', ...body });
    for (const [i, kind] of media.entries()) {
      await ctx.db.query(
        `INSERT INTO files (owner_type, owner_id, kind, storage_key, mime, bytes, sort) VALUES ('calendar_media', $1, $2, $3, $4, 100, $5)`,
        [it.id, kind, `calendar_media/${it.id}/${i}.${kind === 'video' ? 'mp4' : 'jpg'}`, kind === 'video' ? 'video/mp4' : 'image/jpeg', i],
      );
    }
    return it;
  }
  const pubs = async (id) => (await ctx.db.query('SELECT * FROM calendar_publications WHERE item_id = $1 ORDER BY channel', [id])).rows;
  const getItem = async (it) => (await admin.get(`/api/calendar?from=${it.date}&to=${it.date}`)).body.items.find((x) => x.id === it.id);
  async function settle(id) {
    for (let i = 0; i < 50; i++) {
      if ((await pubs(id)).every((p) => p.status !== 'publishing')) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('la publicación no terminó');
  }

  it('las imágenes para publicar solo se aceptan en JPG', async () => {
    const it = await item({ title: 'Post', channels: ['ig_post'] });
    const res = await admin.post('/api/files').field('owner_type', 'calendar_media').field('owner_id', it.id).attach('file', PNG_1x1, 'a.png');
    expect(res.status).toBe(415);
    expect(res.body.error.message).toBe('Solo se aceptan imágenes JPG.');
  });

  it('"Publicar ahora": reel con el video y carrusel con las imágenes; la pieza queda publicada con el link', async () => {
    const it = await item({ title: 'Entrega POSTA', channels: ['ig_reel', 'ig_post'], copy: 'Así quedó el equipo 👕' }, ['video', 'image', 'image']);
    expect((await lectura.post(`/api/calendar/${it.id}/publish`)).status).toBe(403);
    const res = await admin.post(`/api/calendar/${it.id}/publish`);
    expect(res.status).toBe(202);
    await settle(it.id);

    const containers = meta.calls.filter((c) => c[0] === 'createIgContainer').map((c) => c[2]);
    expect(containers).toEqual([
      { image_url: `https://r2.test/calendar_media/${it.id}/1.jpg`, is_carousel_item: true },
      { image_url: `https://r2.test/calendar_media/${it.id}/2.jpg`, is_carousel_item: true },
      { media_type: 'CAROUSEL', children: 'c1,c2', caption: 'Así quedó el equipo 👕' },
      { media_type: 'REELS', video_url: `https://r2.test/calendar_media/${it.id}/0.mp4`, caption: 'Así quedó el equipo 👕', share_to_feed: true },
    ]);
    expect(meta.calls.filter((c) => c[0] === 'createIgContainer').every((c) => c[1] === config.igUserId)).toBe(true);
    const after = await getItem(it);
    expect(after.status).toBe('published');
    expect(after.piece_url).toBe('https://instagram.com/p/m3');
    expect(after.publications.map((p) => [p.channel, p.status])).toEqual([['ig_post', 'published'], ['ig_reel', 'published']]);
    expect(after.media).toHaveLength(3);

    const again = await admin.post(`/api/calendar/${it.id}/publish`);
    expect(again.status).toBe(400);
    expect(again.body.error.message).toMatch(/Ya está publicada/);
  });

  it('sin archivos avisa antes de tocar Instagram', async () => {
    const it = await item({ title: 'Reel', channels: ['ig_reel'] });
    const res = await admin.post(`/api/calendar/${it.id}/publish`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no tiene archivos/);
    expect(await pubs(it.id)).toEqual([]);
  });

  it('a la hora se publica solo lo que está listo; un fallo no se reintenta solo pero sí a mano', async () => {
    const past = art(-5);
    const future = art(120);
    const due = await item({ title: 'Historias', channels: ['ig_story', 'tiktok'], status: 'ready', date: past.date, publish_time: past.time }, ['image', 'image']);
    const later = await item({ title: 'Después', channels: ['ig_post'], status: 'ready', date: future.date, publish_time: future.time }, ['image']);
    const draft = await item({ title: 'Borrador', channels: ['ig_post'], status: 'draft', date: past.date, publish_time: past.time }, ['image']);
    const broken = await item({ title: 'Falla', channels: ['ig_post'], status: 'ready', date: past.date, publish_time: past.time }, ['image']);
    const old = art(-60 * 24);
    const tooLate = await item({ title: 'Viejo', channels: ['ig_post'], status: 'ready', date: old.date, publish_time: old.time }, ['image']);

    // la de "Falla" va después de "Historias" (mismo horario, creada después): falla su primer contenedor
    const origCreate = meta.createIgContainer;
    meta.createIgContainer = async (igUserId, params) => {
      if (params.image_url?.includes(broken.id)) throw new Error('Meta 9004: no se pudo descargar la imagen');
      return origCreate(igUserId, params);
    };
    await publisher.runDue();
    meta.createIgContainer = origCreate;

    const stories = meta.calls.filter((c) => c[0] === 'createIgContainer').map((c) => c[2]);
    expect(stories).toEqual([
      { media_type: 'STORIES', image_url: `https://r2.test/calendar_media/${due.id}/0.jpg` },
      { media_type: 'STORIES', image_url: `https://r2.test/calendar_media/${due.id}/1.jpg` },
    ]);
    expect((await pubs(due.id))[0].status).toBe('published');
    expect((await pubs(due.id))[0].ig_media_ids).toHaveLength(2);
    // con TikTok pendiente (a mano) la pieza sigue "lista"
    expect((await getItem(due)).status).toBe('ready');
    expect(await pubs(later.id)).toEqual([]);
    expect(await pubs(draft.id)).toEqual([]);
    expect(await pubs(tooLate.id)).toEqual([]);
    expect((await pubs(broken.id))[0]).toMatchObject({ status: 'failed', error: 'Meta 9004: no se pudo descargar la imagen' });

    meta.calls.length = 0;
    await publisher.runDue();
    expect(meta.calls).toEqual([]);

    expect((await admin.post(`/api/calendar/${broken.id}/publish`)).status).toBe(202);
    await settle(broken.id);
    expect((await pubs(broken.id))[0]).toMatchObject({ status: 'published', attempts: 2, error: null });
    expect((await getItem(broken)).status).toBe('published');
  });

  it('guarda y valida la hora de publicación', async () => {
    const it = await item({ title: 'Con hora', channels: ['ig_post'], publish_time: '18:30' });
    expect(it.publish_time).toBe('18:30');
    expect((await admin.patch(`/api/calendar/${it.id}`).send({ publish_time: '25:00' })).status).toBe(400);
    expect((await admin.patch(`/api/calendar/${it.id}`).send({ publish_time: null })).body.item.publish_time).toBeNull();
    expect((await lectura.get('/api/calendar/publishing')).body).toEqual({ instagram: true });
  });
});
