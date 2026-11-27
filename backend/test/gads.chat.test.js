import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeMeta, toolTurn, contextSection } from './helpers/adsFakes.js';
import { createAdsRepo } from '../src/repo/ads.js';
import { buildGoogleContext } from '../src/gads/agent.js';

// Claude falso con cola de respuestas; vacía, contesta "listo"
const queue = [];
const calls = [];
const anthropic = {
  beta: {
    messages: {
      stream: (params) => ({
        finalMessage: async () => {
          calls.push(structuredClone(params));
          const next = queue.shift() ?? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'listo' }] };
          if (next instanceof Error) throw next;
          return next;
        },
      }),
    },
  },
};
const say = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

// Cuenta de Google con una campaña activa de $1.000 por día
function fakeGads() {
  const calls = [];
  return {
    calls,
    customerId: '4593693295',
    async search(q) {
      calls.push({ search: q });
      if (q.includes('FROM campaign WHERE campaign.status')) {
        return [{ campaign: { id: '11', name: 'UNIFORMAR | SEARCH', status: 'ENABLED', advertisingChannelType: 'SEARCH', biddingStrategyType: 'TARGET_SPEND', campaignBudget: 'customers/4593693295/campaignBudgets/7' }, campaignBudget: { amountMicros: '1000000000' } }];
      }
      return [];
    },
    async mutateAll(ops, opts = {}) {
      calls.push({ ops, validateOnly: Boolean(opts.validateOnly) });
      return opts.validateOnly ? [] : ops.map((_, i) => ({ r: { resourceName: `customers/4593693295/x/${i}` } }));
    },
    suggestLocations: async () => [],
  };
}

let ctx, gads, repo, admin, equipo;
beforeAll(async () => {
  gads = fakeGads();
  ctx = await createTestContext({ ads: { meta: fakeMeta(), anthropic, gads, config } });
  repo = createAdsRepo(ctx.db, { platform: 'google' });
  admin = (await ctx.asUser({ template: 'admin', name: 'Joaquín' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo', name: 'Marketing' })).agent;
});
afterAll(() => ctx.close());
beforeEach(() => { queue.length = 0; calls.length = 0; gads.calls.length = 0; });

const mutations = () => gads.calls.filter((c) => c.ops);

describe('chat con el agente de Google', () => {
  it('quien solo ve la pauta consulta con los datos de Google, y la charla no se mezcla con las de Meta', async () => {
    queue.push(say('La campaña gasta $1.000 por día y todavía no trajo consultas.'));
    const res = await equipo.post('/api/gads/chats').send({ message: '¿Cómo viene la campaña de búsqueda?' });
    expect(res.status).toBe(201);
    expect(res.body.chat).toMatchObject({ title: '¿Cómo viene la campaña de búsqueda?', platform: 'google', created_by_name: 'Marketing' });
    expect(res.body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const p = calls[0];
    expect(p.system[0].text).toContain('agente de Google Ads');
    expect(p.system[1].text).toContain('## searchTerms');
    expect(p.system[1].cache_control).toEqual({ type: 'ephemeral' });
    const tools = p.tools.map((t) => t.name);
    expect(tools).toContain('add_negative_keywords');
    expect(tools).not.toContain('ask_team');
    expect(tools).not.toContain('record_outcome');

    const google = (await equipo.get('/api/gads/chats')).body.chats.map((c) => c.id);
    const meta = (await equipo.get('/api/ads/chats')).body.chats.map((c) => c.id);
    expect(google).toContain(res.body.chat.id);
    expect(meta).not.toContain(res.body.chat.id);
    expect((await equipo.get(`/api/ads/chats/${res.body.chat.id}`)).status).toBe(404);
  });

  it('no ejecuta nada en Google: lo valida y lo deja como recomendación pendiente del chat', async () => {
    queue.push(
      toolTurn(['add_negative_keywords', { level: 'campaign', target_id: '11', target_name: 'UNIFORMAR | SEARCH', keywords: ['empleo'], match_type: 'PHRASE', title: 'Negativa empleo', reason: 'gastó en búsquedas de empleo', expected_impact: 'menos clics inútiles' }]),
      say('Te dejé en Recomendaciones agregar "empleo" como negativa.'),
    );
    const res = await equipo.post('/api/gads/chats').send({ message: '¿Hay búsquedas que no nos sirven?' });
    expect(res.status).toBe(201);
    expect(mutations().map((c) => c.validateOnly)).toEqual([true]);
    const answer = res.body.messages.at(-1);
    expect(answer.actions).toEqual([{ type: 'recommendation', id: expect.any(String), title: 'Negativa empleo' }]);
    const d = await repo.getDecision(answer.actions[0].id);
    expect(d).toMatchObject({ status: 'pending', tool: 'add_negative_keywords', chat_id: res.body.chat.id, run_id: null });
    // Aparece en las recomendaciones de Google, no en las de Meta
    expect((await equipo.get('/api/gads/decisions?status=pending')).body.decisions.map((x) => x.id)).toContain(d.id);
    expect((await equipo.get('/api/ads/decisions?status=pending')).body.decisions.map((x) => x.id)).not.toContain(d.id);
  });

  it('respeta el tope: un presupuesto que lo pasa vuelve como error al agente y no queda pendiente', async () => {
    queue.push(
      toolTurn(['propose_budget_change', { campaign_id: '11', campaign_name: 'UNIFORMAR | SEARCH', current_budget_ars: 1000, proposed_budget_ars: 500000, title: 'Subir', reason: 'r', expected_impact: 'e' }]),
      say('No se puede: pasa el tope.'),
    );
    const before = (await repo.listDecisions({ status: 'pending' })).length;
    const res = await equipo.post('/api/gads/chats').send({ message: 'Subí el presupuesto a $500.000 por día' });
    const toolResult = calls[1].messages.at(-1).content[0];
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toMatch(/tope/);
    expect(res.body.messages.at(-1).actions).toEqual([]);
    expect((await repo.listDecisions({ status: 'pending' })).length).toBe(before);
  });

  it('si falla se reintenta, y solo quien edita la pauta borra', async () => {
    queue.push(new Error('se cortó'));
    const res = await equipo.post('/api/gads/chats').send({ message: '¿Cuánto llevamos gastado?' });
    expect(res.status).toBe(502);
    const chat = (await equipo.get('/api/gads/chats')).body.chats.find((c) => c.title === '¿Cuánto llevamos gastado?');
    queue.push(say('Llevamos $0 este mes.'));
    const retry = await equipo.post(`/api/gads/chats/${chat.id}/reply`);
    expect(retry.body.messages.map((m) => m.content)).toEqual(['¿Cuánto llevamos gastado?', 'Llevamos $0 este mes.']);
    expect((await equipo.delete(`/api/gads/chats/${chat.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/ads/chats/${chat.id}`)).status).toBe(404);
    expect((await admin.delete(`/api/gads/chats/${chat.id}`)).status).toBe(200);
  });

  it('la corrida diaria de Google ve lo que el equipo escribió en su chat (y no lo del chat de Meta)', async () => {
    await ctx.db.query("DELETE FROM ad_runs WHERE platform = 'google'");
    const run = await repo.startRun('daily', null);
    await repo.finishRun(run.id, { status: 'done', report: 'x' });
    queue.push(say('ok'), say('ok'));
    await equipo.post('/api/gads/chats').send({ message: 'Las búsquedas de "ambos médicos" son de particulares' });
    await equipo.post('/api/ads/chats').send({ message: 'Esto es de Meta' });
    const { text } = await buildGoogleContext({ gads, repo });
    expect(contextSection(text, 'teamChat')).toEqual([expect.objectContaining({ said: 'Las búsquedas de "ambos médicos" son de particulares', by: 'Marketing' })]);
  });
});
