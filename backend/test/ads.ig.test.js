import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeMeta, fakeAnthropic, contextSection } from './helpers/adsFakes.js';
import { createAdsRepo } from '../src/repo/ads.js';
import { createDispatcher, buildContext } from '../src/ads/agent.js';

const REEL = '17900000000123456';
let ctx, meta, admin, equipo;
beforeAll(async () => {
  meta = fakeMeta();
  ctx = await createTestContext({ ads: { meta, anthropic: fakeAnthropic([]), config } });
  admin = (await ctx.asUser({ template: 'admin', name: 'Sofi' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo' })).agent;
});
afterAll(() => ctx.close());
beforeEach(() => { meta.calls.length = 0; });

describe('posts de Instagram', () => {
  it('lista los posts', async () => {
    const res = await equipo.get('/api/ads/ig-posts');
    expect(res.status).toBe(200);
    expect(res.body.posts[0]).toMatchObject({ id: REEL, type: 'reel', likes: 40, promotedIn: [] });
  });

  it('promocionar crea creative con el post original + anuncio, y lo registra', async () => {
    expect((await equipo.post(`/api/ads/ig-posts/${REEL}/promote`).send({ adset_id: '901' })).status).toBe(403);
    const res = await admin.post(`/api/ads/ig-posts/${REEL}/promote`).send({ adset_id: '901', adset_name: 'WPP_INTERESES_AMBA_20261009', permalink: 'https://ig/1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, ad_id: '905', name: expect.stringMatching(/^WPPINTERESESAMBA_IG123456_\d{8}$/) });
    const spec = meta.calls.find((c) => c[0] === 'createCreative')[1];
    expect(spec).toMatchObject({ source_instagram_media_id: REEL, instagram_user_id: '222', object_id: '111' });
    expect(meta.calls.find((c) => c[0] === 'createAd')[1]).toMatchObject({ adsetId: '901', creativeId: '904', status: 'ACTIVE' });

    const posts = (await equipo.get('/api/ads/ig-posts')).body.posts;
    expect(posts[0].promotedIn).toEqual([{ adset_id: '901', adset_name: 'WPP_INTERESES_AMBA_20261009', ad_id: '905', created_at: expect.any(String) }]);
    const [d] = (await admin.get('/api/ads/decisions')).body.decisions;
    expect(d).toMatchObject({ tool: 'promote_ig_post', status: 'executed' });
    const { rows: [promo] } = await ctx.db.query('SELECT p.*, u.name FROM ad_ig_promotions p JOIN users u ON u.id = p.created_by');
    expect(promo).toMatchObject({ ig_media_id: REEL, permalink: 'https://ig/1', name: 'Sofi' });
  });

  it('el mismo post en el mismo conjunto no se promociona dos veces', async () => {
    const res = await admin.post(`/api/ads/ig-posts/${REEL}/promote`).send({ adset_id: '901' });
    expect(res.status).toBe(409);
    expect(meta.calls.find((c) => c[0] === 'createAd')).toBeUndefined();
  });

  it('dos promociones a la vez del mismo post en el mismo conjunto crean un solo anuncio', async () => {
    const OTHER = '17900000000999999';
    // Meta tarda: las dos requests llegan a chequear antes de que la primera termine
    const original = meta.createCreative;
    meta.createCreative = async (spec) => { await new Promise((r) => setTimeout(r, 50)); return original(spec); };
    let results;
    try {
      results = await Promise.all([
        admin.post(`/api/ads/ig-posts/${OTHER}/promote`).send({ adset_id: '901' }),
        admin.post(`/api/ads/ig-posts/${OTHER}/promote`).send({ adset_id: '901' }),
      ]);
    } finally {
      meta.createCreative = original;
    }
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(meta.calls.filter((c) => c[0] === 'createAd')).toHaveLength(1);
  });

  it('si Meta falla, la promoción no queda registrada y se puede reintentar', async () => {
    const original = meta.createAd;
    meta.createAd = async () => { throw new Error('Meta 100: Invalid parameter'); };
    try {
      expect((await admin.post('/api/ads/ig-posts/17900000000888888/promote').send({ adset_id: '901' })).status).toBe(502);
    } finally {
      meta.createAd = original;
    }
    expect((await admin.post('/api/ads/ig-posts/17900000000888888/promote').send({ adset_id: '901' })).status).toBe(200);
  });

  it('sin acceso a @uniform.ar: error claro y NO usa la cuenta de la página', async () => {
    const original = meta.createCreative;
    meta.createCreative = async (spec) => {
      meta.calls.push(['createCreative', spec]);
      throw new Error('Meta 200: Permissions error (La cuenta publicitaria no tiene acceso a esta cuenta de Instagram.)');
    };
    try {
      const res = await admin.post('/api/ads/ig-posts/17900000000654321/promote').send({ adset_id: '901' });
      expect(res.status).toBe(502);
      expect(res.body.error.message).toContain('La cuenta publicitaria no tiene acceso a @uniform.ar');
      expect(meta.calls.filter((c) => c[0] === 'createCreative')).toHaveLength(1);
    } finally {
      meta.createCreative = original;
    }
  });
});

describe('agente y posts de IG', () => {
  it('promote_ig_post queda pendiente aunque el modo autónomo esté prendido', async () => {
    const repo = createAdsRepo(ctx.db);
    const executed = [];
    const dispatch = createDispatcher({ meta, repo, execute: async (...a) => { executed.push(a); return {}; } });
    const res = await dispatch('promote_ig_post', {
      ig_media_id: '17900000000654321', adset_id: '901', adset_name: 'WPP_INTERESES_AMBA_20261009',
      title: 'Promocionar el post de chaquetas', reason: '12 likes orgánicos', expected_impact: 'más conversaciones',
    }, { runId: null, settings: { autonomous: true } });
    expect(res).toMatchObject({ queued: true });
    expect(executed).toHaveLength(0);
    const pending = (await admin.get('/api/ads/decisions?status=pending')).body.decisions;
    expect(pending.find((d) => d.tool === 'promote_ig_post')).toBeTruthy();
  });

  it('el contexto trae los posts con dónde ya se promocionaron', async () => {
    const text = await buildContext({ meta, repo: createAdsRepo(ctx.db), config });
    const posts = contextSection(text, 'igPosts');
    expect(posts[0]).toMatchObject({ id: REEL, type: 'reel', likes: 40, reach: 1200, promotedIn: ['WPP_INTERESES_AMBA_20261009'] });
    expect(posts[0].caption.length).toBeLessThanOrEqual(300);
  });

  it('si Instagram falla, el contexto avisa y el análisis sigue', async () => {
    const broken = { ...meta, getIgMedia: async () => { throw new Error('Meta 10: sin permiso'); } };
    const text = await buildContext({ meta: broken, repo: createAdsRepo(ctx.db), config });
    expect(contextSection(text, 'igPosts')).toEqual({ error: 'Meta 10: sin permiso' });
  });
});
