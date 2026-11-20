import { GOOGLE_TOOLS, GOOGLE_ACTIONS, GOOGLE_VALIDATED } from './tools.js';
import { GOOGLE_SYSTEM_PROMPT } from './systemPrompt.js';
import { buildGoogleSnapshot } from './snapshot.js';
import { DEFAULT_MODEL } from '../ads/agent.js';
import { conflict } from '../lib/errors.js';

const MAX_TURNS = 12;

// Días que quedan del mes contando hoy (fecha YYYY-MM-DD de la cuenta)
export function daysLeftInMonth(today) {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
}

// Proyección del mes si se suma `extraDaily` pesos por día a lo que ya está activo
export function projectMonth(snapshot, extraDaily = 0) {
  const active = snapshot.campaigns.filter((c) => c.status === 'ENABLED').reduce((s, c) => s + (c.dailyBudgetArs ?? 0), 0);
  const left = daysLeftInMonth(snapshot.today);
  // Lo de hoy ya gastado cuenta en month.spend: hoy se proyecta solo lo que falta del presupuesto
  return Math.round(snapshot.month.spend + Math.max(0, left - 1) * (active + extraDaily) + Math.max(0, active + extraDaily - snapshot.spendToday));
}

// Control duro del tope: el modelo no puede dejar pendiente algo que lo pase
export function capCheck(tool, input, { snapshot, settings }) {
  if (!snapshot || !settings?.monthly_cap_ars) return null;
  let extra = 0;
  if (tool === 'propose_search_campaign') extra = Number(input.daily_budget_ars) || 0;
  else if (tool === 'propose_budget_change') extra = (Number(input.proposed_budget_ars) || 0) - (Number(input.current_budget_ars) || 0);
  else if (tool === 'set_status' && input.level === 'campaign' && input.status === 'ENABLED') {
    extra = snapshot.campaigns.find((c) => c.id === String(input.object_id))?.dailyBudgetArs ?? 0;
  } else return null;
  if (extra <= 0) return null;
  const projected = projectMonth(snapshot, extra);
  if (projected <= settings.monthly_cap_ars) return null;
  return `Con esto el mes cerraría en ~$${projected.toLocaleString('es-AR')} y el tope es $${settings.monthly_cap_ars.toLocaleString('es-AR')} (gastado: $${snapshot.month.spend.toLocaleString('es-AR')}, quedan ${daysLeftInMonth(snapshot.today)} días). Bajá el presupuesto.`;
}

export function createGoogleDispatcher({ gads, repo, execute, images }) {
  return async function dispatch(name, input, { runId, settings, snapshot }) {
    const base = { runId, tool: name, input, title: input.title ?? '', reason: input.reason ?? '', expectedImpact: input.expected_impact ?? '' };
    try {
      if (name === 'find_locations') return { results: await gads.suggestLocations((input.names ?? []).slice(0, 10).map(String)) };
      if (name === 'import_meta_images') {
        if (!images) return { error: 'La biblioteca de imágenes no está disponible.' };
        const allowed = new Map((await images.metaCandidates()).map((c) => [c.id, c]));
        const done = [];
        const errors = [];
        for (const id of [...new Set((input.creative_ids ?? []).map(String))].slice(0, 6)) {
          if (!allowed.has(id)) { errors.push(`${id}: no es una pieza de Meta con foto`); continue; }
          try {
            const img = await images.importFromCreative(id, null);
            done.push({ image_id: img.id, name: allowed.get(id).name });
          } catch (err) {
            errors.push(`${allowed.get(id).name}: ${err.message}`);
          }
        }
        return { imported: done, ...(errors.length ? { errors } : {}), note: 'Quedaron en Pauta → Google → Imágenes. Proponé las mejores para la campaña con add_campaign_images.' };
      }
      if (name === 'save_learning') return { ok: true, learning_id: (await repo.upsertLearning(input)).id };
      if (name === 'record_outcome') {
        await repo.recordOutcome(input.decision_id, input.outcome);
        return { ok: true };
      }
      if (name === 'ask_team') {
        const question = String(input.question ?? '').trim();
        if (!question) return { error: 'Falta la pregunta.' };
        const quickAnswers = (Array.isArray(input.quick_answers) ? input.quick_answers : [])
          .filter((a) => typeof a === 'string' && a.trim()).slice(0, 4).map((a) => a.trim().slice(0, 80));
        const q = await repo.addQuestion({ runId, question, why: String(input.why ?? ''), quickAnswers });
        return { ok: true, question_id: q.id, note: 'La pregunta quedó en el panel.' };
      }
      if (!GOOGLE_ACTIONS.has(name)) return { error: `Herramienta desconocida: ${name}` };

      const overCap = capCheck(name, input, { snapshot, settings });
      if (overCap) return { error: overCap };
      // Lo que crea cosas se prueba en Google antes de dejarlo pendiente: el equipo solo ve propuestas que funcionan
      if (GOOGLE_VALIDATED.has(name)) await execute.validate(name, input);
      const d = await repo.addDecision({ ...base, status: 'pending' });
      return { queued: true, decision_id: d.id, note: 'Validada en Google. Quedó pendiente de aprobación en el panel.' };
    } catch (err) {
      // Un error de validación vuelve al modelo para que corrija; no se guarda como decisión fallida
      return { error: String(err.message || err) };
    }
  };
}

export async function buildGoogleContext({ gads, repo, images }) {
  const [snapshot, settings, learnings, pending, recent, toEvaluate, openQuestions, answeredQuestions, library, metaPieces] = await Promise.all([
    buildGoogleSnapshot(gads),
    repo.getSettings(),
    repo.listLearnings({ activeOnly: true }),
    repo.listDecisions({ status: 'pending', limit: 30 }),
    repo.listDecisions({ limit: 30 }),
    repo.executedWithoutOutcome(72),
    repo.listQuestions({ status: 'open', limit: 30 }),
    repo.answeredSinceLastRun(),
    images ? images.list() : [],
    images ? images.metaCandidates() : [],
  ]);
  const sections = {
    today: snapshot.today,
    daysLeftInMonth: daysLeftInMonth(snapshot.today),
    settings: { monthly_cap_ars: settings.monthly_cap_ars, business_notes: settings.business_notes },
    account: { spendToday: snapshot.spendToday, month: snapshot.month, last7d: snapshot.last7d, projectedMonth: projectMonth(snapshot) },
    conversionActions: snapshot.conversionActions,
    campaigns: snapshot.campaigns,
    adGroups: snapshot.adGroups,
    keywords: snapshot.keywords,
    ads: snapshot.ads,
    campaignAssets: snapshot.assets,
    metaImagePieces: metaPieces.map((c) => ({ id: c.id, name: c.name, headline: c.headline || undefined, usedInMeta: c.status === 'used', inGoogle: c.in_google })),
    images: library.map((i) => ({ id: i.id, name: i.name, from: i.source_name ? `pieza de Meta "${i.source_name}"` : 'cargada para Google', size: i.file ? `${i.file.width}x${i.file.height}` : null })),
    searchTerms: snapshot.searchTerms,
    activeLearnings: learnings.map((l) => ({ id: l.id, text: l.text, evidence: l.evidence })),
    pendingRecommendations: pending.map((d) => ({ id: d.id, tool: d.tool, title: d.title, created_at: d.created_at })),
    recentDecisions: recent.filter((d) => d.status !== 'pending').map((d) => ({ id: d.id, tool: d.tool, title: d.title, status: d.status, error: d.error, outcome: d.outcome, created_at: d.created_at })),
    decisionsToEvaluate: toEvaluate,
    openQuestions: openQuestions.map((q) => ({ id: q.id, question: q.question, created_at: q.created_at })),
    answeredQuestions: answeredQuestions.map((q) => ({ question: q.question, answer: q.answer, answered_by: q.answered_by_name, answered_at: q.answered_at })),
  };
  return { snapshot, settings, text: Object.entries(sections).map(([k, v]) => `## ${k}\n${JSON.stringify(v)}`).join('\n\n') };
}

export function createGoogleAgentRunner({ anthropic, gads, repo, execute, images, model = DEFAULT_MODEL }) {
  const dispatch = createGoogleDispatcher({ gads, repo, execute, images });

  async function process(runRow) {
    try {
      const { snapshot, settings, text } = await buildGoogleContext({ gads, repo, images });
      const messages = [{ role: 'user', content: `Análisis ${runRow.kind === 'daily' ? 'diario' : 'pedido desde el panel'} de la cuenta de Google Ads. Datos actuales:\n\n${text}` }];
      let report = '';
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const stream = anthropic.beta.messages.stream({
          model,
          max_tokens: 32000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'high' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: GOOGLE_SYSTEM_PROMPT,
          tools: GOOGLE_TOOLS,
          messages,
        });
        const resp = await stream.finalMessage();
        if (resp.stop_reason === 'refusal') throw new Error('El modelo no pudo completar el análisis (refusal).');
        messages.push({ role: 'assistant', content: resp.content });
        const out = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (out) report = out;
        if (resp.stop_reason !== 'tool_use') break;
        const results = [];
        for (const block of resp.content.filter((b) => b.type === 'tool_use')) {
          const result = await dispatch(block.name, block.input ?? {}, { runId: runRow.id, settings, snapshot });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result), ...(result.error ? { is_error: true } : {}) });
        }
        messages.push({ role: 'user', content: results });
      }
      return await repo.finishRun(runRow.id, { status: 'done', report: report || 'El agente terminó sin dejar informe.' });
    } catch (err) {
      console.error('[gads] corrida falló:', err);
      return repo.finishRun(runRow.id, { status: 'failed', error: String(err.message || err) });
    }
  }

  return async function start(kind, userId) {
    const settings = await repo.getSettings();
    if (!settings.agent_enabled && kind === 'daily') {
      const r = await repo.startRun(kind, userId);
      const run = await repo.finishRun(r.id, { status: 'skipped', report: 'El agente de Google está apagado en Ajustes.' });
      return { run, done: Promise.resolve(run) };
    }
    if (await repo.runningRun()) throw conflict('Ya hay un análisis de Google corriendo. Esperá unos minutos.');
    const run = await repo.startRun(kind, userId);
    return { run, done: process(run) };
  };
}

