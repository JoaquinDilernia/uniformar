import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import sharp from 'sharp';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeAnthropic } from './helpers/adsFakes.js';
import { createAdsRepo } from '../src/repo/ads.js';

const jpg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#556b2f' } }).jpeg().toBuffer();

function fakeGads() {
  const calls = [];
  return {
    calls, customerId: '4593693295',
    search: async () => [],
    async mutateAll(ops, opts = {}) {
      calls.push({ ops, validateOnly: Boolean(opts.validateOnly) });
      return opts.validateOnly ? [] : ops.map((o, i) => ({ r: { resourceName: o.assetOperation ? `customers/4593693295/assets/${i}` : `customers/4593693295/campaignAssets/${i}` } }));
    },
    suggestLocations: async () => [],
  };
}

let ctx, admin, gads, repo;
beforeAll(async () => {
  gads = fakeGads();
  ctx = await createTestContext({ ads: { anthropic: fakeAnthropic([]), gads, config } });
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  repo = createAdsRepo(ctx.db, { platform: 'google' });
});
afterAll(() => ctx.close());
beforeEach(() => { gads.calls.length = 0; });

async function metaPiece(name, buffer) {
  const id = (await admin.post('/api/ads/creatives').send({ name, copy: 'Escribinos' })).body.creative.id;
  await admin.post('/api/files').field('owner_type', 'ad_feed').field('owner_id', id).attach('file', buffer, 'feed.jpg');
  return id;
}

describe('imágenes de Google', () => {
  it('se traen de una pieza de Meta (una sola vez) y se cargan a mano', async () => {
    const creative = await metaPiece('Camisa grafa', await jpg(1080, 1350));
    const first = await admin.post(`/api/gads/images/from-creative/${creative}`);
    expect(first.status).toBe(201);
    const again = await admin.post(`/api/gads/images/from-creative/${creative}`);
    expect(again.body.image.id).toBe(first.body.image.id);

    const own = (await admin.post('/api/gads/images').send({ name: 'Chaqueta cocina' })).body.image;
    const up = await admin.post('/api/files').field('owner_type', 'gads_image').field('owner_id', own.id).attach('file', await jpg(1200, 800), 'chaqueta.jpg');
    expect(up.status).toBe(201);

    const list = (await admin.get('/api/gads/images')).body.images;
    expect(list.map((i) => i.name)).toEqual(['Chaqueta cocina', 'Camisa grafa']);
    expect(list[1]).toMatchObject({ source_name: 'Camisa grafa', file: { width: 1080, height: 1350 } });

    for (const [shape, size] of [['cuadrada', '1200x1200'], ['horizontal', '1200x628']]) {
      const dl = await admin.get(`/api/gads/images/${own.id}/${shape}.jpg`).buffer(true).parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
      const m = await sharp(dl.body).metadata();
      expect(`${m.width}x${m.height}`).toBe(size);
    }
    await admin.post(`/api/gads/images/${own.id}/archive`);
    expect((await admin.get('/api/gads/images')).body.images).toHaveLength(1);
  });

  it('aprobar los recursos crea vínculos, destacados y fragmento y los vincula a la campaña', async () => {
    const input = {
      campaign_id: '24471685193',
      sitelinks: [{ text: 'Rubros', description1: 'Gastronomía, obra e industria', description2: 'Uniformes para cada equipo', url: 'https://uniformar.ar/#rubros' }, { text: 'Cotizá', url: 'https://uniformar.ar/#cotiza' }],
      callouts: ['Envío gratis al país', 'Desde 30 prendas', 'Envío gratis al país'],
      structured_snippet: { header: 'Tipos', values: ['Camisas', 'Chombas', 'Camperas'] },
    };
    const d = await repo.addDecision({ tool: 'propose_assets', input, status: 'pending', title: 'Recursos' });
    const res = await admin.post(`/api/gads/decisions/${d.id}/approve`);
    expect(res.body.decision).toMatchObject({ status: 'executed', result: { created: 5 } });
    const { ops } = gads.calls[0];
    const links = ops.filter((o) => o.campaignAssetOperation).map((o) => o.campaignAssetOperation.create);
    expect(links.map((l) => l.fieldType)).toEqual(['SITELINK', 'SITELINK', 'CALLOUT', 'CALLOUT', 'STRUCTURED_SNIPPET']);
    expect(links.every((l) => l.campaign === 'customers/4593693295/campaigns/24471685193')).toBe(true);
  });

  it('frena textos largos y descripciones incompletas antes de llamar a Google', async () => {
    const bad = async (input) => {
      const d = await repo.addDecision({ tool: 'propose_assets', input: { campaign_id: '1', ...input }, status: 'pending', title: 'x' });
      return (await admin.post(`/api/gads/decisions/${d.id}/approve`)).body.decision;
    };
    expect(await bad({ callouts: ['Un texto destacado demasiado largo'] })).toMatchObject({ status: 'failed', error: expect.stringMatching(/máximo para un texto destacado es 25/) });
    expect(await bad({ sitelinks: [{ text: 'Rubros', description1: 'solo una', url: 'https://uniformar.ar/' }] })).toMatchObject({ status: 'failed', error: expect.stringMatching(/dos descripciones/) });
    expect(await bad({ sitelinks: [{ text: 'Rubros', url: 'https://otra.com/' }] })).toMatchObject({ status: 'failed', error: expect.stringMatching(/uniformar\.ar/) });
    expect(gads.calls).toHaveLength(0);
  });

  it('una pieza de Meta en video no se puede traer', async () => {
    const id = (await admin.post('/api/ads/creatives').send({ name: 'Reel', copy: 'x' })).body.creative.id;
    const res = await admin.post(`/api/gads/images/from-creative/${id}`);
    expect(res.status).toBe(409);
  });
});
