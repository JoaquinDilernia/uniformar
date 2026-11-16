import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { fakeAnthropic, toolTurn, config } from './helpers/adsFakes.js';
import { createGoogleExecutor } from '../src/gads/executor.js';
import { capCheck, daysLeftInMonth, projectMonth } from '../src/gads/agent.js';

// Cliente de Google falso: registra las mutaciones y devuelve una cuenta con una campaña
function fakeGads() {
  const calls = [];
  return {
    calls,
    customerId: '4593693295',
    async search(q) {
      if (q.includes('FROM campaign WHERE campaign.status')) {
        return [{ campaign: { id: '11', name: 'UNIFORMAR | SEARCH', status: 'ENABLED', advertisingChannelType: 'SEARCH', biddingStrategyType: 'TARGET_SPEND', campaignBudget: 'customers/4593693295/campaignBudgets/7' }, campaignBudget: { amountMicros: '1000000000' } }];
      }
      if (q.includes('campaign_budget.explicitly_shared')) return [{ campaign: { id: '11', campaignBudget: 'customers/4593693295/campaignBudgets/7' }, campaignBudget: { explicitlyShared: false } }];
      return [];
    },
    async mutateAll(ops, opts = {}) {
      calls.push({ ops, validateOnly: Boolean(opts.validateOnly) });
      if (opts.validateOnly) return [];
      return ops.map((o, i) => ({ [Object.keys(o)[0].replace('Operation', 'Result')]: { resourceName: o.campaignOperation ? 'customers/4593693295/campaigns/99' : `customers/4593693295/x/${i}` } }));
    },
    suggestLocations: async () => [{ id: '20010', name: 'Ciudad Autónoma de Buenos Aires', type: 'Province' }],
  };
}

const group = (over = {}) => ({
  name: 'Gastronomía',
  keywords: [{ text: 'Uniformes Gastronómicos', match_type: 'PHRASE' }, { text: 'chaquetas de cocina', match_type: 'EXACT' }],
  headlines: ['Uniformes con tu logo', 'Chaquetas de cocina', 'Envío gratis al país'],
  descriptions: ['Bordado o estampado con tu logo. Mínimo 30 prendas.', 'Cotizá por WhatsApp y te respondemos hoy.'],
  final_url: 'https://uniformar.ar/',
  ...over,
});
const campaign = (over = {}) => ({
  name: 'UNIFORMAR | SEARCH', daily_budget_ars: 1500, bidding: { strategy: 'MAXIMIZE_CLICKS', max_cpc_ars: 600 },
  negative_keywords: ['gratis', 'Empleo'], ad_groups: [group()], title: 't', reason: 'r', expected_impact: 'e', ...over,
});

describe('ejecutor de Google', () => {
  it('arma la campaña de búsqueda entera en un solo pedido, activa, solo búsqueda y en español', async () => {
    const gads = fakeGads();
    const res = await createGoogleExecutor({ gads })('propose_search_campaign', campaign());
    expect(res).toMatchObject({ campaign_id: '99', status: 'ENABLED' });
    const { ops } = gads.calls[0];
    const camp = ops.find((o) => o.campaignOperation).campaignOperation.create;
    expect(camp).toMatchObject({ status: 'ENABLED', advertisingChannelType: 'SEARCH', targetSpend: { cpcBidCeilingMicros: '600000000' } });
    expect(camp.networkSettings).toMatchObject({ targetGoogleSearch: true, targetContentNetwork: false, targetPartnerSearchNetwork: false });
    expect(ops[0].campaignBudgetOperation.create.amountMicros).toBe('1500000000');
    const crit = ops.filter((o) => o.campaignCriterionOperation).map((o) => o.campaignCriterionOperation.create);
    expect(crit).toContainEqual(expect.objectContaining({ location: { geoTargetConstant: 'geoTargetConstants/2032' } }));
    expect(crit).toContainEqual(expect.objectContaining({ language: { languageConstant: 'languageConstants/1003' } }));
    expect(crit.filter((c) => c.negative).map((c) => c.keyword.text)).toEqual(['gratis', 'empleo']);
    const kws = ops.filter((o) => o.adGroupCriterionOperation).map((o) => o.adGroupCriterionOperation.create.keyword);
    expect(kws[0]).toEqual({ text: 'uniformes gastronómicos', matchType: 'PHRASE' });
    expect(ops.find((o) => o.adGroupAdOperation).adGroupAdOperation.create.ad.finalUrls).toEqual(['https://uniformar.ar/']);
  });

  it('rechaza títulos largos, links a otra web y concordancias inválidas antes de llamar a Google', async () => {
    const gads = fakeGads();
    const execute = createGoogleExecutor({ gads });
    await expect(execute('propose_search_campaign', campaign({ ad_groups: [group({ headlines: ['Un título que claramente pasa los treinta', 'b', 'c'] })] }))).rejects.toThrow(/máximo para títulos es 30/);
    await expect(execute('propose_search_campaign', campaign({ ad_groups: [group({ final_url: 'https://otra.com/' })] }))).rejects.toThrow(/uniformar\.ar/);
    await expect(execute('add_keywords', { ad_group_id: '5', keywords: [{ text: 'x', match_type: 'RARA' }] })).rejects.toThrow(/concordancia/);
    expect(gads.calls).toHaveLength(0);
  });

  it('validate usa validateOnly y cambiar presupuesto actualiza el presupuesto de la campaña', async () => {
    const gads = fakeGads();
    const execute = createGoogleExecutor({ gads });
    await execute.validate('propose_search_campaign', campaign());
    expect(gads.calls[0].validateOnly).toBe(true);
    await execute('propose_budget_change', { campaign_id: '11', current_budget_ars: 1000, proposed_budget_ars: 1200 });
    expect(gads.calls[1].ops[0].campaignBudgetOperation.update).toEqual({ resourceName: 'customers/4593693295/campaignBudgets/7', amountMicros: '1200000000' });
  });
});

describe('tope mensual', () => {
  const snap = { today: '2026-11-16', spendToday: 0, month: { spend: 0 }, campaigns: [] };
  it('proyecta el mes y frena lo que lo pasa', () => {
    expect(daysLeftInMonth('2026-11-16')).toBe(15);
    expect(projectMonth(snap, 3000)).toBe(45000);
    expect(capCheck('propose_search_campaign', { daily_budget_ars: 3000 }, { snapshot: snap, settings: { monthly_cap_ars: 50000 } })).toBeNull();
    expect(capCheck('propose_search_campaign', { daily_budget_ars: 4000 }, { snapshot: snap, settings: { monthly_cap_ars: 50000 } })).toMatch(/tope es \$50/);
  });
});

describe('agente de Google en la app', () => {
  let ctx, admin, gads;
  beforeAll(async () => {
    gads = fakeGads();
    const anthropic = fakeAnthropic([
      toolTurn(
        ['propose_search_campaign', campaign({ daily_budget_ars: 999999 })],
        ['propose_search_campaign', campaign({ title: 'Lanzar búsqueda' })],
        ['ask_team', { question: '¿Las consultas de Google son empresas?', why: 'calidad' }],
      ),
      { stop_reason: 'end_turn', content: [{ type: 'text', text: '**Cómo vamos** Google arrancando' }] },
    ]);
    ctx = await createTestContext({ ads: { anthropic, gads, config } });
    admin = (await ctx.asUser({ template: 'admin' })).agent;
  });
  afterAll(() => ctx.close());
  beforeEach(() => { gads.calls.length = 0; });

  it('corre, frena lo que pasa el tope, valida en Google y deja la campaña para aprobar', async () => {
    const res = await admin.post('/api/gads/runs');
    expect(res.status).toBe(202);
    let run;
    for (let i = 0; i < 50; i++) {
      run = (await admin.get('/api/gads/runs')).body.runs[0];
      if (run.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(run).toMatchObject({ status: 'done', report: expect.stringContaining('Google arrancando') });
    const pending = (await admin.get('/api/gads/decisions?status=pending')).body.decisions;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ tool: 'propose_search_campaign', title: 'Lanzar búsqueda' });
    expect(gads.calls.every((c) => c.validateOnly)).toBe(true);
    expect((await admin.get('/api/gads/questions')).body.questions).toHaveLength(1);
    // Lo de Google no se mezcla con Meta
    expect((await admin.get('/api/ads/decisions?status=pending')).body.decisions).toHaveLength(0);
    expect((await admin.get('/api/ads/questions')).body.questions).toHaveLength(0);
  });

  it('aprobar crea la campaña en Google; una decisión de Google no se aprueba desde Meta', async () => {
    const [d] = (await admin.get('/api/gads/decisions?status=pending')).body.decisions;
    expect((await admin.post(`/api/ads/decisions/${d.id}/approve`)).status).not.toBe(200);
    const res = await admin.post(`/api/gads/decisions/${d.id}/approve`);
    expect(res.body.decision).toMatchObject({ status: 'executed', result: { campaign_id: '99' } });
    expect(gads.calls[0].validateOnly).toBe(false);
  });

  it('overview muestra la cuenta, el tope de Google y la proyección', async () => {
    const res = await admin.get('/api/gads/overview');
    expect(res.body.configured).toEqual({ google: true, agent: true });
    expect(res.body.settings.monthly_cap_ars).toBe(50000);
    expect(res.body.snapshot.campaigns[0]).toMatchObject({ id: '11', dailyBudgetArs: 1000 });
    expect(typeof res.body.projectedMonth).toBe('number');
    expect((await admin.get('/api/ads/settings')).body.settings.monthly_cap_ars).toBe(200000);
  });
});
