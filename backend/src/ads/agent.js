import { TOOL_DEFINITIONS, READ_ONLY_TOOLS, META_ACTIONS } from './tools.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { buildSnapshot } from './snapshot.js';
import { buildAdName, buildWhatsappCreativeSpec } from './creativeSpec.js';
import { artDate } from './metrics.js';
import { conflict } from '../lib/errors.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_TURNS = 12;

// Config fija de la cuenta de Uniform.ar (sobrescribible por env en index.js)
export function adsConfigFromEnv(env = process.env) {
  return {
    accountId: env.META_AD_ACCOUNT_ID || 'act_1385921086504906',
    pageId: env.META_PAGE_ID || '1297559076766655',
    igUserId: env.META_IG_USER_ID || '17841446936578488',
    whatsappNumber: env.META_WHATSAPP_NUMBER || '5491130430035',
  };
}

// Ejecuta una acción sobre Meta (al aprobarla en el panel, o sola en modo autónomo)
export function createExecutor({ meta, repo, files, config }) {
  async function publishCreative({ creative_id: creativeId, adset_id: adsetId, adset_name: adsetName }) {
    const creative = await repo.getCreative(creativeId);
    if (creative.status === 'used') throw new Error(`La pieza "${creative.name}" ya se publicó (anuncio ${creative.meta_ad_id}).`);
    const imgs = await files.listFor(['ad_feed', 'ad_story'], [creativeId]);
    const feed = imgs.find((f) => f.owner_type === 'ad_feed');
    const story = imgs.find((f) => f.owner_type === 'ad_story');
    if (!feed) throw new Error(`La pieza "${creative.name}" no tiene imagen de feed.`);
    const feedHash = await meta.uploadImage(await files.read(await files.get(feed.id)));
    const storyHash = story ? await meta.uploadImage(await files.read(await files.get(story.id))) : null;
    const name = buildAdName({ adsetName: adsetName || adsetId, creativeName: creative.name, date: artDate() });
    const publish = async (igUserId) => {
      const spec = buildWhatsappCreativeSpec({
        name, pageId: config.pageId, igUserId, message: creative.copy, headline: creative.headline,
        feedImageHash: feedHash, storyImageHash: storyHash,
      });
      const { id: metaCreativeId } = await meta.createCreative(spec);
      return meta.createAd({ name, adsetId, creativeId: metaCreativeId, status: 'ACTIVE' });
    };
    let ad;
    try {
      ad = await publish(config.igUserId);
    } catch (err) {
      // Si la cuenta publicitaria no tiene acceso al Instagram, se publica con la identidad de la página
      // (en Instagram aparece igual, como cuenta asociada a la página)
      if (!config.igUserId || !/instagram/i.test(err.message)) throw err;
      console.warn('[ads] sin acceso a la cuenta de Instagram, publico sin instagram_user_id:', err.message);
      ad = await publish(null);
    }
    await repo.markCreativeUsed(creativeId, ad.id, adsetId);
    return { ad_id: ad.id, name };
  }

  return async function execute(tool, input) {
    switch (tool) {
      case 'pause_ad':
        await meta.setStatus(input.ad_id, 'PAUSED');
        return { paused: input.ad_id };
      case 'set_status':
        await meta.setStatus(input.object_id, input.status);
        return { [input.object_id]: input.status };
      case 'propose_budget_change':
        await meta.updateDailyBudget(input.object_id, Math.round(input.proposed_budget_ars * 100));
        return { [input.object_id]: input.proposed_budget_ars };
      case 'propose_adset': {
        const targeting = { ...input.targeting };
        if (!targeting.targeting_automation) targeting.targeting_automation = { advantage_audience: 0 };
        const adset = await meta.createAdset({
          campaign_id: input.campaign_id, name: input.name, status: 'PAUSED', targeting,
          billing_event: 'IMPRESSIONS', optimization_goal: 'CONVERSATIONS', destination_type: 'WHATSAPP',
          promoted_object: { page_id: config.pageId, whatsapp_phone_number: config.whatsappNumber },
          ...(input.daily_budget_ars ? { daily_budget: Math.round(input.daily_budget_ars * 100) } : {}),
        });
        if (!input.creative_id) return { adset_id: adset.id };
        const ad = await publishCreative({ creative_id: input.creative_id, adset_id: adset.id, adset_name: input.name });
        return { adset_id: adset.id, ...ad };
      }
      case 'create_ad':
        return publishCreative(input);
      default:
        throw new Error(`Acción desconocida: ${tool}`);
    }
  };
}

// Atiende cada tool_use del modelo durante una corrida
export function createDispatcher({ meta, repo, execute }) {
  return async function dispatch(name, input, { runId, settings }) {
    const base = { runId, tool: name, input, title: input.title ?? '', reason: input.reason ?? '', expectedImpact: input.expected_impact ?? '' };
    try {
      if (name === 'search_interest') return { results: await meta.searchInterests(input.query) };
      if (name === 'request_creative') {
        await repo.addRequest({ concept: input.concept, styleNotes: input.style_notes, reason: input.reason });
        return { ok: true, note: 'Pedido cargado en el panel para el equipo.' };
      }
      if (name === 'save_learning') return { ok: true, learning_id: (await repo.upsertLearning(input)).id };
      if (name === 'record_outcome') {
        await repo.recordOutcome(input.decision_id, input.outcome);
        return { ok: true };
      }
      if (!META_ACTIONS.has(name)) return { error: `Herramienta desconocida: ${name}` };

      if (name === 'pause_ad' && settings.autonomous) {
        const result = await execute(name, input);
        await repo.addDecision({ ...base, status: 'executed', result });
        return { ok: true, executed: true, ...result };
      }
      const d = await repo.addDecision({ ...base, status: 'pending' });
      return { queued: true, decision_id: d.id, note: 'Quedó pendiente de aprobación en el panel.' };
    } catch (err) {
      if (!READ_ONLY_TOOLS.has(name)) await repo.addDecision({ ...base, status: 'failed', error: String(err.message || err) });
      return { error: String(err.message || err) };
    }
  };
}

export async function buildContext({ meta, repo }) {
  const [snapshot, settings, unusedCreatives, openRequests, learnings, pending, recent, toEvaluate] = await Promise.all([
    buildSnapshot(meta),
    repo.getSettings(),
    repo.listCreatives({ status: 'unused' }),
    repo.listRequests({ status: 'open' }),
    repo.listLearnings({ activeOnly: true }),
    repo.listDecisions({ status: 'pending', limit: 30 }),
    repo.listDecisions({ limit: 30 }),
    repo.executedWithoutOutcome(48),
  ]);
  const sections = {
    today: snapshot.today,
    settings: { monthly_cap_ars: settings.monthly_cap_ars, autonomous: settings.autonomous, business_notes: settings.business_notes },
    spendThisMonth: snapshot.month.spend,
    account: { spendToday: snapshot.spendToday, month: snapshot.month, last7d: snapshot.last7d },
    campaigns: snapshot.campaigns,
    adsets: snapshot.adsets,
    ads: snapshot.ads,
    unusedCreatives: unusedCreatives.map((c) => ({ id: c.id, name: c.name, copy: c.copy, headline: c.headline, notes: c.notes, hasStory: Boolean(c.story_file_id), hasFeed: Boolean(c.feed_file_id) })),
    openCreativeRequests: openRequests.map((r) => ({ concept: r.concept, created_at: r.created_at })),
    activeLearnings: learnings.map((l) => ({ id: l.id, text: l.text, evidence: l.evidence })),
    pendingRecommendations: pending.map((d) => ({ id: d.id, tool: d.tool, title: d.title, created_at: d.created_at })),
    recentDecisions: recent.filter((d) => d.status !== 'pending').map((d) => ({ id: d.id, tool: d.tool, title: d.title, status: d.status, outcome: d.outcome, created_at: d.created_at })),
    decisionsToEvaluate: toEvaluate,
  };
  return Object.entries(sections).map(([k, v]) => `## ${k}\n${JSON.stringify(v)}`).join('\n\n');
}

export function createAgentRunner({ anthropic, meta, repo, execute, model = DEFAULT_MODEL }) {
  const dispatch = createDispatcher({ meta, repo, execute });

  async function process(runRow, settings) {
    try {
      const context = await buildContext({ meta, repo });
      const messages = [{ role: 'user', content: `Análisis ${runRow.kind === 'daily' ? 'diario' : 'pedido desde el panel'} de la cuenta. Datos actuales:\n\n${context}` }];
      let report = '';
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const stream = anthropic.beta.messages.stream({
          model,
          max_tokens: 32000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'high' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          tools: TOOL_DEFINITIONS,
          messages,
        });
        const resp = await stream.finalMessage();
        if (resp.stop_reason === 'refusal') throw new Error('El modelo no pudo completar el análisis (refusal).');
        messages.push({ role: 'assistant', content: resp.content });
        const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (text) report = text;
        if (resp.stop_reason !== 'tool_use') break;
        const results = [];
        for (const block of resp.content.filter((b) => b.type === 'tool_use')) {
          const result = await dispatch(block.name, block.input ?? {}, { runId: runRow.id, settings });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result), ...(result.error ? { is_error: true } : {}) });
        }
        messages.push({ role: 'user', content: results });
      }
      return await repo.finishRun(runRow.id, { status: 'done', report: report || 'El agente terminó sin dejar informe.' });
    } catch (err) {
      console.error('[ads] corrida falló:', err);
      return repo.finishRun(runRow.id, { status: 'failed', error: String(err.message || err) });
    }
  }

  // Arranca una corrida y devuelve la fila enseguida; done se resuelve cuando termina
  // (el análisis tarda minutos: el panel muestra "analizando" y consulta de nuevo).
  return async function start(kind, userId) {
    const settings = await repo.getSettings();
    if (!settings.agent_enabled && kind === 'daily') {
      const r = await repo.startRun(kind, userId);
      const run = await repo.finishRun(r.id, { status: 'skipped', report: 'El agente está apagado en Ajustes.' });
      return { run, done: Promise.resolve(run) };
    }
    if (await repo.runningRun()) {
      throw conflict('Ya hay un análisis corriendo. Esperá unos minutos.');
    }
    const run = await repo.startRun(kind, userId);
    return { run, done: process(run, settings) };
  };
}
