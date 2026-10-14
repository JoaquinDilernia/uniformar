import { CONVERSATION } from '../../src/ads/metrics.js';

export const config = { accountId: 'act_1', pageId: '111', igUserId: '222', pageBackedIgId: '333', whatsappNumber: '5491100000000' };

export function fakeMeta() {
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

// Simula a Claude: devuelve los turnos del guion en orden; después, un informe "fin"
export function fakeAnthropic(script) {
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

export const toolTurn = (...blocks) => ({ stop_reason: 'tool_use', content: blocks.map(([name, input], i) => ({ type: 'tool_use', id: `t${i}`, name, input })) });

// El contexto del agente es "## nombre\n{json}" por sección
export function contextSection(text, name) {
  const m = text.match(new RegExp(`## ${name}\\n(.*)`));
  if (!m) throw new Error(`no está la sección ${name}`);
  return JSON.parse(m[1]);
}
