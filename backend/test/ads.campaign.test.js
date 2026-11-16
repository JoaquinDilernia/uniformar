import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeMeta, fakeAnthropic, contextSection } from './helpers/adsFakes.js';
import { PNG_1x1 } from './helpers/fixtures.js';
import { createAdsRepo } from '../src/repo/ads.js';
import { buildContext } from '../src/ads/agent.js';
import { TOOL_DEFINITIONS, META_ACTIONS } from '../src/ads/tools.js';

let ctx, meta, admin, repo;
beforeAll(async () => {
  meta = fakeMeta();
  ctx = await createTestContext({ ads: { meta, anthropic: fakeAnthropic([]), config } });
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  repo = createAdsRepo(ctx.db);
});
afterAll(() => ctx.close());
beforeEach(() => { meta.calls.length = 0; });

async function piece(name) {
  const id = (await admin.post('/api/ads/creatives').send({ name, copy: 'Escribinos 👇' })).body.creative.id;
  await admin.post('/api/files').field('owner_type', 'ad_feed').field('owner_id', id).attach('file', PNG_1x1, 'feed.png');
  return id;
}
const why = { title: 't', reason: 'r', expected_impact: 'e' };
const targeting = { geo_locations: { countries: ['AR'] } };
const approve = async (tool, input) => {
  const d = await repo.addDecision({ tool, input, title: 't', status: 'pending' });
  return admin.post(`/api/ads/decisions/${d.id}/approve`);
};
const names = () => meta.calls.map((c) => c[0]);

describe('el agente arma campañas y conjuntos', () => {
  it('propose_campaign es una acción sobre Meta disponible para el agente', () => {
    expect(META_ACTIONS.has('propose_campaign')).toBe(true);
    expect(TOOL_DEFINITIONS.find((t) => t.name === 'propose_campaign').input_schema.required).toEqual(expect.arrayContaining(['adsets', 'daily_budget_ars']));
  });

  it('aprobar una campaña la crea pausada, arma conjuntos y anuncios, y recién al final la activa', async () => {
    const a = await piece('Gastro 1');
    const b = await piece('Gastro 2');
    const res = await approve('propose_campaign', {
      name: 'UNIFORMAR | WPP GASTRO', daily_budget_ars: 5000, ...why,
      adsets: [{ name: 'WPP_GASTRO_AMBA', targeting, creative_ids: [a, b] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.decision.status).toBe('executed');
    const camp = meta.calls.find((c) => c[0] === 'createCampaign')[1];
    expect(camp).toMatchObject({ objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', daily_budget: 500000 });
    expect(meta.calls.find((c) => c[0] === 'createAdset')[1]).toMatchObject({ campaign_id: '910', status: 'PAUSED', destination_type: 'WHATSAPP' });
    expect(names().filter((n) => n === 'createAd')).toHaveLength(2);
    // Orden: conjunto activo después de sus anuncios; la campaña, lo último
    const statuses = meta.calls.filter((c) => c[0] === 'setStatus');
    expect(statuses).toEqual([['setStatus', '903', 'ACTIVE'], ['setStatus', '910', 'ACTIVE']]);
    expect(names().lastIndexOf('createAd')).toBeLessThan(names().indexOf('setStatus'));
    const used = (await admin.get('/api/ads/creatives')).body.creatives.filter((c) => [a, b].includes(c.id));
    expect(used.every((c) => c.status === 'used')).toBe(true);
  });

  it('si una pieza ya no está libre, no crea nada en Meta', async () => {
    const a = await piece('Libre');
    const res = await approve('propose_campaign', {
      name: 'X', daily_budget_ars: 1000, ...why,
      adsets: [{ name: 'X_1', targeting, creative_ids: [a, '00000000-0000-0000-0000-000000000000'] }],
    });
    expect(res.body.decision).toMatchObject({ status: 'failed' });
    expect(res.body.decision.error).toMatch(/ya se publicó/);
    expect(names()).not.toContain('createCampaign');
  });

  it('si falla un anuncio, la campaña queda pausada y lo avisa', async () => {
    const a = await piece('Falla');
    const original = meta.createAd;
    meta.createAd = async () => { throw new Error('Meta 100: algo'); };
    try {
      const res = await approve('propose_campaign', { name: 'Y', daily_budget_ars: 1000, ...why, adsets: [{ name: 'Y_1', targeting, creative_ids: [a] }] });
      expect(res.body.decision).toMatchObject({ status: 'failed' });
      expect(res.body.decision.error).toMatch(/PAUSADA/);
      expect(meta.calls.filter((c) => c[0] === 'setStatus')).toEqual([]);
    } finally {
      meta.createAd = original;
    }
    // La pieza vuelve a quedar libre
    expect((await admin.get('/api/ads/creatives')).body.creatives.find((c) => c.id === a).status).toBe('unused');
  });

  it('un conjunto nuevo con pieza arranca activo; sin pieza, pausado', async () => {
    const a = await piece('Conjunto');
    await approve('propose_adset', { campaign_id: '900', name: 'WPP_SALUD', targeting, creative_id: a, ...why });
    expect(meta.calls.filter((c) => c[0] === 'setStatus')).toEqual([['setStatus', '903', 'ACTIVE']]);
    meta.calls.length = 0;
    const res = await approve('propose_adset', { campaign_id: '900', name: 'WPP_VACIO', targeting, ...why });
    expect(res.body.decision.result).toMatchObject({ status: 'PAUSED' });
    expect(names()).not.toContain('setStatus');
  });

  it('el contexto muestra qué piezas ya están propuestas', async () => {
    const a = await piece('Propuesta');
    await repo.addDecision({ tool: 'create_ad', input: { creative_id: a, adset_id: '901' }, title: 'Publicar', status: 'pending' });
    const text = await buildContext({ meta, repo, config });
    expect(contextSection(text, 'pendingRecommendations').some((d) => d.creativeIds?.includes(a))).toBe(true);
  });
});
