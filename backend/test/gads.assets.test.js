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

  it('sube imágenes de la biblioteca a la campaña (cuadrada y horizontal) desde el panel', async () => {
    const img = (await admin.post('/api/gads/images').send({ name: 'Camisa con logo' })).body.image;
    await admin.post('/api/files').field('owner_type', 'gads_image').field('owner_id', img.id).attach('file', await jpg(1600, 1000), 'camisa.jpg');

    const res = await admin.post(`/api/gads/images/${img.id}/to-campaign`).send({ campaign_id: '24471685193', campaign_name: 'Search' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, created: 2 });
    const { ops, validateOnly } = gads.calls[0];
    expect(validateOnly).toBe(false);
    const assets = ops.filter((o) => o.assetOperation).map((o) => o.assetOperation.create);
    const links = ops.filter((o) => o.campaignAssetOperation).map((o) => o.campaignAssetOperation.create);
    expect(assets).toHaveLength(2);
    expect(assets.every((a) => a.type === 'IMAGE' && a.imageAsset.data.length > 100 && a.name.startsWith('Camisa con logo'))).toBe(true);
    const sizes = await Promise.all(assets.map(async (a) => { const m = await sharp(Buffer.from(a.imageAsset.data, 'base64')).metadata(); return `${m.width}x${m.height}`; }));
    expect(sizes).toEqual(['1200x1200', '1200x628']);
    expect(links).toEqual(assets.map((a) => ({ campaign: 'customers/4593693295/campaigns/24471685193', asset: a.resourceName, fieldType: 'AD_IMAGE' })));
    const done = (await repo.listDecisions({ status: 'executed' })).find((d) => d.tool === 'add_campaign_images');
    expect(done).toMatchObject({ title: 'Subir “Camisa con logo” a Search' });
  });

  it('el agente propone imágenes para la campaña y al aprobarlas se suben', async () => {
    const img = (await admin.post('/api/gads/images').send({ name: 'Chaqueta' })).body.image;
    await admin.post('/api/files').field('owner_type', 'gads_image').field('owner_id', img.id).attach('file', await jpg(1200, 1200), 'chaqueta.jpg');
    const d = await repo.addDecision({ tool: 'add_campaign_images', input: { campaign_id: '24471685193', image_ids: [img.id, img.id] }, status: 'pending', title: 'Imágenes' });
    const res = await admin.post(`/api/gads/decisions/${d.id}/approve`);
    expect(res.body.decision).toMatchObject({ status: 'executed', result: { created: 2 } });

    const bad = await repo.addDecision({ tool: 'add_campaign_images', input: { campaign_id: '24471685193', image_ids: [] }, status: 'pending', title: 'x' });
    expect((await admin.post(`/api/gads/decisions/${bad.id}/approve`)).body.decision).toMatchObject({ status: 'failed', error: expect.stringMatching(/entre 1 y 6 imágenes/) });
  });

  it('una pieza de Meta en video no se puede traer', async () => {
    const id = (await admin.post('/api/ads/creatives').send({ name: 'Reel', copy: 'x' })).body.creative.id;
    const res = await admin.post(`/api/gads/images/from-creative/${id}`);
    expect(res.status).toBe(409);
  });
});

describe('el agente trae fotos de Meta', () => {
  it('importa solo piezas de Meta con foto, sin aprobación, y no duplica', async () => {
    const { createGoogleDispatcher } = await import('../src/gads/agent.js');
    const { createGoogleImages } = await import('../src/gads/images.js');
    const { createFilesService } = await import('../src/services/files.js');
    const images = createGoogleImages({ db: ctx.db, files: createFilesService({ db: ctx.db, storage: ctx.storage, uploadSecret: 'test-secret' }) });
    const photo = await metaPiece('Chomba logística', await jpg(1080, 1080));
    const reel = (await admin.post('/api/ads/creatives').send({ name: 'Reel sin foto', copy: 'x' })).body.creative.id;
    const candidates = await images.metaCandidates();
    expect(candidates.map((c) => c.id)).toContain(photo);
    expect(candidates.map((c) => c.id)).not.toContain(reel);

    const dispatch = createGoogleDispatcher({ gads, repo, execute: null, images });
    const res = await dispatch('import_meta_images', { creative_ids: [photo, reel] }, { runId: null });
    expect(res.imported).toEqual([expect.objectContaining({ name: 'Chomba logística' })]);
    expect(res.errors[0]).toMatch(/no es una pieza de Meta con foto/);
    const again = await dispatch('import_meta_images', { creative_ids: [photo] }, { runId: null });
    expect(again.imported[0].image_id).toBe(res.imported[0].image_id);
    expect((await images.metaCandidates()).find((c) => c.id === photo).in_google).toBe(true);
    expect((await repo.listDecisions({ status: 'pending' })).filter((d) => d.tool === 'import_meta_images')).toHaveLength(0);
  });
});
