import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { PNG_1x1 } from './helpers/fixtures.js';
import { buildWhatsappCreativeSpec, buildAdName } from '../src/ads/creativeSpec.js';
import { summarizeRow, totals, CONVERSATION } from '../src/ads/metrics.js';

const config = { accountId: 'act_1', pageId: '111', igUserId: '222', pageBackedIgId: '333', whatsappNumber: '5491100000000' };

function fakeMeta() {
  const calls = [];
  const log = (name) => (...args) => { calls.push([name, ...args]); };
  return {
    calls,
    getCampaigns: async () => [{ id: '900', name: 'UNIFORMAR | MENSAJES WPP', objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', effective_status: 'PAUSED', daily_budget: '650000' }],
    getAdsets: async () => [{ id: '901', name: 'WPP_INTERESES_AMBA_20261009', campaign_id: '900', status: 'ACTIVE', effective_status: 'CAMPAIGN_PAUSED', optimization_goal: 'CONVERSATIONS' }],
    getAds: async () => [{ id: '902', name: 'AD1', adset_id: '901', campaign_id: '900', status: 'ACTIVE', effective_status: 'ACTIVE' }],
    getInsights: async (level) => (level === 'ad'
      ? [{ ad_id: '902', spend: '9000', impressions: '1000', actions: [{ action_type: CONVERSATION, value: '3' }] }]
      : [{ adset_id: '901', date_start: '2026-10-09', spend: '9000', actions: [{ action_type: CONVERSATION, value: '3' }] }]),
    setStatus: async (...a) => { log('setStatus')(...a); return { success: true }; },
    updateDailyBudget: async (...a) => { log('updateDailyBudget')(...a); return { success: true }; },
    createAdset: async (p) => { log('createAdset')(p); return { id: '903' }; },
    uploadImage: async () => { log('uploadImage')(); return `hash${calls.filter((c) => c[0] === 'uploadImage').length}`; },
    createCreative: async (spec) => { log('createCreative')(spec); return { id: '904' }; },
    createAd: async (a) => { log('createAd')(a); return { id: '905' }; },
    searchInterests: async () => [{ id: '6003436950375', name: 'Restaurantes' }],
  };
}

// Simula a Claude: en el primer turno pide pausar un anuncio y pedir una pieza; después escribe el informe
function fakeAnthropic(script) {
  let turn = 0;
  return {
    beta: {
      messages: {
        stream: (params) => ({
          finalMessage: async () => {
            fakeAnthropic.lastParams = params;
            return script[turn++] ?? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'fin' }] };
          },
        }),
      },
    },
  };
}
const toolTurn = (...blocks) => ({ stop_reason: 'tool_use', content: blocks.map(([name, input], i) => ({ type: 'tool_use', id: `t${i}`, name, input })) });

let ctx, meta, admin, equipo;
beforeAll(async () => {
  meta = fakeMeta();
  const anthropic = fakeAnthropic([
    toolTurn(
      ['pause_ad', { ad_id: '902', title: 'Pausar AD1', reason: 'gastó sin resultados', expected_impact: 'menos gasto' }],
      ['request_creative', { concept: 'Equipo de panadería uniformado', style_notes: 'feed 4:5', reason: 'no hay piezas' }],
    ),
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '**Cómo vamos** todo en orden' }] },
  ]);
  ctx = await createTestContext({ ads: { meta, anthropic, config } });
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo' })).agent;
});
afterAll(() => ctx.close());
beforeEach(() => { meta.calls.length = 0; });

async function waitRun(id) {
  for (let i = 0; i < 50; i++) {
    const { body } = await admin.get('/api/ads/runs');
    const run = body.runs.find((r) => r.id === id);
    if (run.status !== 'running') return run;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('la corrida no terminó');
}

describe('métricas y piezas', () => {
  it('cuenta conversaciones de WhatsApp y costo por conversación', () => {
    const row = { spend: '9000', actions: [{ action_type: CONVERSATION, value: '3' }] };
    expect(summarizeRow(row)).toMatchObject({ spend: 9000, conversations: 3, costPerConversation: 3000 });
    expect(totals([row, { spend: '1000' }])).toMatchObject({ spend: 10000, conversations: 3, costPerConversation: 3333 });
  });

  it('arma el creative de WhatsApp simple o por ubicación', () => {
    const simple = buildWhatsappCreativeSpec({ name: 'X', pageId: '1', igUserId: '2', message: 'hola', feedImageHash: 'h1' });
    expect(simple.object_story_spec.link_data.call_to_action.type).toBe('WHATSAPP_MESSAGE');
    const placed = buildWhatsappCreativeSpec({ name: 'X', pageId: '1', igUserId: '2', message: 'hola', feedImageHash: 'h1', storyImageHash: 'h2' });
    expect(placed.asset_feed_spec.call_to_action_types).toEqual(['WHATSAPP_MESSAGE']);
    expect(placed.asset_feed_spec.asset_customization_rules[1].image_label).toEqual({ name: 'story' });
    expect(buildAdName({ adsetName: 'WPP_INTERESES_AMBA_20261009', creativeName: 'Panadería Maná', date: '2026-10-09' }))
      .toBe('WPPINTERESESAMBA_PANADERIAMANA_20261009');
  });
});

describe('pauta', () => {
  it('resumen con la foto de Meta en pesos', async () => {
    const res = await equipo.get('/api/ads/overview');
    expect(res.status).toBe(200);
    expect(res.body.configured).toEqual({ meta: true, agent: true });
    expect(res.body.snapshot.campaigns[0].dailyBudgetArs).toBe(6500);
    expect(res.body.snapshot.ads[0].last7d).toMatchObject({ conversations: 3, costPerConversation: 3000 });
  });

  it('el agente corre, deja recomendaciones pendientes, pedidos e informe', async () => {
    expect((await equipo.post('/api/ads/runs')).status).toBe(403);
    const res = await admin.post('/api/ads/runs');
    expect(res.status).toBe(202);
    const run = await waitRun(res.body.run.id);
    expect(run.status).toBe('done');
    expect(run.report).toContain('Cómo vamos');
    expect(fakeAnthropic.lastParams.model).toBe('claude-opus-5-5');
    const pending = (await admin.get('/api/ads/decisions?status=pending')).body.decisions;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ tool: 'pause_ad', title: 'Pausar AD1' });
    expect(meta.calls.find((c) => c[0] === 'setStatus')).toBeUndefined();
    const requests = (await admin.get('/api/ads/requests')).body.requests;
    expect(requests[0].concept).toBe('Equipo de panadería uniformado');
  });

  it('aprobar ejecuta en Meta; no se puede aprobar dos veces', async () => {
    const [d] = (await admin.get('/api/ads/decisions?status=pending')).body.decisions;
    expect((await equipo.post(`/api/ads/decisions/${d.id}/approve`)).status).toBe(403);
    const res = await admin.post(`/api/ads/decisions/${d.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.decision.status).toBe('executed');
    expect(meta.calls).toContainEqual(['setStatus', '902', 'PAUSED']);
    expect((await admin.post(`/api/ads/decisions/${d.id}/approve`)).status).toBe(409);
  });

  it('pieza: se crea, se le suben las imágenes y se publica en un conjunto', async () => {
    const created = await admin.post('/api/ads/creatives').send({ name: 'Panadería Maná', copy: 'Uniformes con tu logo 👇' });
    expect(created.status).toBe(201);
    const id = created.body.creative.id;
    const webp = await admin.post('/api/files').field('owner_type', 'ad_feed').field('owner_id', id)
      .attach('file', Buffer.from('RIFF0000WEBPVP8 '), 'x.webp');
    expect(webp.status).toBe(415);
    const up = await admin.post('/api/files').field('owner_type', 'ad_feed').field('owner_id', id).attach('file', PNG_1x1, 'feed.png');
    expect(up.status).toBe(201);
    const list = (await admin.get('/api/ads/creatives')).body.creatives;
    expect(list[0].feed_file_id).toBe(up.body.file.id);

    const pub = await admin.post(`/api/ads/creatives/${id}/publish`).send({ adset_id: '901', adset_name: 'WPP_INTERESES_AMBA_20261009' });
    expect(pub.status).toBe(200);
    expect(pub.body.ad_id).toBe('905');
    const spec = meta.calls.find((c) => c[0] === 'createCreative')[1];
    expect(spec.object_story_spec).toMatchObject({ page_id: '111', instagram_user_id: '222' });
    expect(meta.calls.find((c) => c[0] === 'createAd')[1]).toMatchObject({ adsetId: '901', creativeId: '904', status: 'ACTIVE' });
    expect((await admin.post(`/api/ads/creatives/${id}/publish`).send({ adset_id: '901' })).status).toBe(502);
  });

  it('si no hay acceso a la cuenta de Instagram, publica con la de la página', async () => {
    const created = await admin.post('/api/ads/creatives').send({ name: 'Sin IG', copy: 'texto' });
    const id = created.body.creative.id;
    await admin.post('/api/files').field('owner_type', 'ad_feed').field('owner_id', id).attach('file', PNG_1x1, 'feed.png');
    const original = meta.createCreative;
    meta.createCreative = async (spec) => {
      meta.calls.push(['createCreative', spec]);
      if (spec.object_story_spec.instagram_user_id === '222') throw new Error('Meta 200: Permissions error (La cuenta publicitaria no tiene acceso a esta cuenta de Instagram.)');
      return { id: '906' };
    };
    try {
      const pub = await admin.post(`/api/ads/creatives/${id}/publish`).send({ adset_id: '901' });
      expect(pub.status).toBe(200);
      const specs = meta.calls.filter((c) => c[0] === 'createCreative').map((c) => c[1]);
      expect(specs).toHaveLength(2);
      expect(specs[1].object_story_spec.instagram_user_id).toBe('333');
    } finally {
      meta.createCreative = original;
    }
  });

  it('activar o pausar a mano desde el panel queda en el historial', async () => {
    const res = await admin.post('/api/ads/objects/900/status').send({ level: 'campaign', status: 'ACTIVE', name: 'UNIFORMAR' });
    expect(res.status).toBe(200);
    expect(meta.calls).toContainEqual(['setStatus', '900', 'ACTIVE']);
    const all = (await admin.get('/api/ads/decisions')).body.decisions;
    expect(all[0]).toMatchObject({ tool: 'set_status', status: 'executed', title: 'Activar la campaña UNIFORMAR' });
  });

  it('ajustes', async () => {
    const res = await admin.put('/api/ads/settings').send({ monthly_cap_ars: 250000, autonomous: true });
    expect(res.body.settings).toMatchObject({ monthly_cap_ars: 250000, autonomous: true, agent_enabled: true });
    expect((await equipo.put('/api/ads/settings').send({ autonomous: false })).status).toBe(403);
  });
});

describe('pauta sin Meta configurado', () => {
  it('avisa qué falta', async () => {
    const bare = await createTestContext();
    const { agent } = await bare.asUser({ template: 'admin' });
    const res = await agent.get('/api/ads/overview');
    expect(res.body.configured).toEqual({ meta: false, agent: false });
    expect((await agent.post('/api/ads/runs')).status).toBe(503);
    await bare.close();
  });
});
