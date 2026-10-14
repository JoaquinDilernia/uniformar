import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeMeta, fakeAnthropic } from './helpers/adsFakes.js';

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
