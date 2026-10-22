import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeMeta, fakeAnthropic } from './helpers/adsFakes.js';
import { CONVERSATION, addDays, artDate, daysAgo } from '../src/ads/metrics.js';
import { buildReport, decisionImpact, groupBreakdown, rank } from '../src/ads/report.js';

const conv = (n) => [{ action_type: CONVERSATION, value: String(n) }];

// Meta falsa con datos por nivel, por día y por desglose
function reportMeta({ failBreakdown } = {}) {
  const base = fakeMeta();
  const calls = [];
  return {
    ...base,
    calls,
    getAds: async () => [{ id: 'a1', creative: { thumbnail_url: 'https://t/a1.jpg' }, effective_status: 'ACTIVE' }],
    async getInsights(level, since, until, opts = {}) {
      calls.push([level, since, until, opts]);
      if (opts.breakdowns) {
        if (opts.breakdowns === failBreakdown) throw new Error('Meta 100: breakdown no soportado');
        if (opts.breakdowns === 'age') return [{ age: '35-44', spend: '6000', actions: conv(3) }, { age: '25-34', spend: '4000', actions: conv(1) }];
        if (opts.breakdowns.startsWith('publisher_platform')) {
          return [
            { publisher_platform: 'instagram', platform_position: 'instagram_reels', spend: '3000', actions: conv(2) },
            { publisher_platform: 'instagram', platform_position: 'instagram_stories', spend: '1000', actions: conv(1) },
            { publisher_platform: 'facebook', platform_position: 'feed', spend: '6000', actions: conv(1) },
          ];
        }
        return [];
      }
      if (opts.daily) {
        const rows = [];
        for (let d = since; d <= until; d = addDays(d, 1)) {
          rows.push(level === 'adset'
            ? { adset_id: 's1', adset_name: 'Conjunto 1', date_start: d, spend: '1000', actions: conv(1) }
            : { date_start: d, spend: '2000', actions: conv(1) });
        }
        return rows;
      }
      if (level === 'ad') {
        return [
          { ad_id: 'a1', ad_name: 'Barato', adset_name: 'Conjunto 1', spend: '2000', actions: conv(2) },
          { ad_id: 'a2', ad_name: 'Caro', adset_name: 'Conjunto 1', spend: '6000', actions: conv(1) },
          { ad_id: 'a3', ad_name: 'Sin nada', adset_name: 'Conjunto 1', spend: '4000' },
        ];
      }
      if (level === 'adset') return [{ adset_id: 's1', adset_name: 'Conjunto 1', campaign_name: 'C', spend: '12000', actions: conv(3) }];
      // cuenta: el período anterior (termina antes de hoy) gastó más y trajo menos
      return [until < artDate() ? { spend: '15000', impressions: '9000', actions: conv(2) } : { spend: '12000', impressions: '10000', reach: '5000', actions: conv(4) }];
    },
  };
}

describe('cálculos del reporte', () => {
  it('ranking: los más baratos arriba y los que gastan sin rendir abajo', () => {
    const items = [
      { id: '1', spend: 2000, conversations: 2, costPerConversation: 1000 },
      { id: '2', spend: 6000, conversations: 1, costPerConversation: 6000 },
      { id: '3', spend: 4000, conversations: 0, costPerConversation: null },
      { id: '4', spend: 500, conversations: 0, costPerConversation: null },
    ];
    const { best, worst } = rank(items, 3000, 1);
    expect(best.map((i) => i.id)).toEqual(['1']);
    // el que gastó $500 todavía no alcanza para juzgarlo
    expect(rank(items, 3000).worst.map((i) => i.id)).toEqual(['3', '2']);
    expect(worst.map((i) => i.id)).toEqual(['3']);
  });

  it('agrupa los desgloses con etiquetas legibles', () => {
    const rows = [
      { publisher_platform: 'instagram', platform_position: 'instagram_reels', spend: '3000', actions: conv(2) },
      { publisher_platform: 'instagram', platform_position: 'reels', spend: '1000', actions: conv(1) },
      { publisher_platform: 'facebook', platform_position: 'feed', spend: '500' },
    ];
    expect(groupBreakdown('placement', rows)).toEqual([
      { label: 'Instagram · reels', spend: 4000, impressions: 0, clicks: 0, conversations: 3, costPerConversation: 1333 },
      { label: 'Facebook · feed', spend: 500, impressions: 0, clicks: 0, conversations: 0, costPerConversation: null },
    ]);
    expect(groupBreakdown('hour', [{ hourly_stats_aggregated_by_advertiser_time_zone: '09:00:00 - 09:59:59', spend: '10' }])[0].label).toBe('09 h');
  });

  it('mide el antes y después de una acción en su conjunto', () => {
    const days = (spend, conversations) => Array.from({ length: 21 }, (_, i) => ({ date: addDays('2026-10-01', i), spend, conversations }));
    const series = days(1000, 1).map((d) => (d.date > '2026-10-10' ? { ...d, conversations: 2 } : d));
    const [impact] = decisionImpact(
      [{ id: 'd1', title: 'Subir presupuesto', tool: 'propose_budget_change', run_id: 'r1', input: { object_id: 's1' }, decided_at: '2026-10-10T15:00:00Z' }],
      { accountDays: days(5000, 1), adsetSeries: new Map([['s1', series]]), adsetNames: new Map([['s1', 'Conjunto 1']]), today: '2026-10-21' },
    );
    expect(impact).toMatchObject({
      date: '2026-10-10', byAgent: true, scope: 'Conjunto Conjunto 1',
      before: { days: 7, spend: 7000, conversations: 7, costPerConversation: 1000 },
      after: { days: 6, spend: 6000, conversations: 12, costPerConversation: 500 },
    });
  });

  it('arma el reporte con el período anterior, el día a día y el ranking', async () => {
    const meta = reportMeta({ failBreakdown: 'region' });
    const since = daysAgo(6);
    const until = artDate();
    const r = await buildReport(meta, { since, until });
    expect(r.range.days).toBe(7);
    expect(r.previousRange).toEqual({ since: daysAgo(13), until: daysAgo(7) });
    expect(r.totals.current).toMatchObject({ spend: 12000, conversations: 4, costPerConversation: 3000 });
    expect(r.totals.previous).toMatchObject({ spend: 15000, conversations: 2, costPerConversation: 7500 });
    expect(r.daily).toHaveLength(7);
    expect(r.ads.best[0]).toMatchObject({ name: 'Barato', thumbnail: 'https://t/a1.jpg', costPerConversation: 1000 });
    expect(r.ads.worst.map((a) => a.name)).toEqual(['Sin nada', 'Caro']);
    expect(r.breakdowns.placement[0].label).toBe('Instagram · reels');
    expect(r.breakdowns.age.map((a) => a.label)).toEqual(['25-34', '35-44']);
    // un desglose que falla no rompe el resto
    expect(r.breakdowns.region.error).toMatch(/no soportado/);
    expect(r.actions).toEqual([]);
  });
});

describe('rutas del reporte', () => {
  let ctx, admin, equipo, meta;
  beforeAll(async () => {
    meta = reportMeta();
    const anthropic = fakeAnthropic([{ stop_reason: 'end_turn', content: [{ type: 'text', text: '**Cómo nos fue** bien' }] }]);
    ctx = await createTestContext({ ads: { meta, anthropic, config } });
    admin = (await ctx.asUser({ template: 'admin' })).agent;
    equipo = (await ctx.asUser({ template: 'equipo', permissions: { ads: 'view' } })).agent;
  });
  afterAll(() => ctx.close());

  const q = () => `since=${daysAgo(6)}&until=${artDate()}`;

  it('devuelve el reporte y mide las acciones ejecutadas en el período', async () => {
    const { createAdsRepo } = await import('../src/repo/ads.js');
    await createAdsRepo(ctx.db).addDecision({ runId: null, tool: 'set_status', input: { object_id: 's1', level: 'adset', status: 'ACTIVE' }, title: 'Activar conjunto', status: 'executed' });
    const { status, body } = await equipo.get(`/api/ads/report?${q()}`);
    expect(status).toBe(200);
    expect(body.report.totals.current.conversations).toBe(4);
    expect(body.report.actions[0]).toMatchObject({ title: 'Activar conjunto', scope: 'Conjunto Conjunto 1', after: null, byAgent: false });
    expect(body.report.actions[0].before).toMatchObject({ days: 7, conversations: 7 });
    expect(body.analysis).toBeNull();
    expect(body.canAnalyze).toBe(true);
  });

  it('cachea el reporte por período', async () => {
    const before = meta.calls.length;
    await equipo.get(`/api/ads/report?${q()}`);
    expect(meta.calls.length).toBe(before);
  });

  it('valida el período', async () => {
    expect((await admin.get(`/api/ads/report?since=${artDate()}&until=${daysAgo(3)}`)).status).toBe(400);
    expect((await admin.get(`/api/ads/report?since=${daysAgo(1)}&until=${addDays(artDate(), 2)}`)).status).toBe(400);
    expect((await admin.get(`/api/ads/report?since=${daysAgo(120)}&until=${artDate()}`)).status).toBe(400);
    expect((await admin.get('/api/ads/report?since=ayer&until=hoy')).status).toBe(400);
  });

  it('el agente lee el período con los números del reporte y queda guardado', async () => {
    expect((await equipo.post('/api/ads/report/analysis').send({ since: daysAgo(6), until: artDate() })).status).toBe(403);
    const { status, body } = await admin.post('/api/ads/report/analysis').send({ since: daysAgo(6), until: artDate() });
    expect(status).toBe(200);
    expect(body.analysis.text).toBe('**Cómo nos fue** bien');
    const sent = fakeAnthropic.lastParams.messages[0].content;
    expect(sent).toContain('"costPerConversation":3000');
    expect(sent).not.toContain('thumbnail');
    expect((await equipo.get(`/api/ads/report?${q()}`)).body.analysis.text).toBe('**Cómo nos fue** bien');
  });
});
