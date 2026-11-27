import { TOOL_DEFINITIONS } from './tools.js';
import { AGENT_KNOWLEDGE } from './systemPrompt.js';
import { buildContext, createDispatcher, DEFAULT_MODEL } from './agent.js';
import { conflict } from '../lib/errors.js';

const MAX_TURNS = 8;
const HISTORY = 20;
const CONTEXT_TTL_MS = 10 * 60_000;
// En el chat no se le pregunta al equipo (ya está hablando con él) ni se evalúan decisiones: eso es de la corrida diaria
const NOT_IN_CHAT = new Set(['ask_team', 'record_outcome']);
export const chatTools = (tools) => tools.filter((t) => !NOT_IN_CHAT.has(t.name));

const CHAT_TOOLS = chatTools(TOOL_DEFINITIONS);

export const CHAT_SYSTEM = `Sos el agente de pauta de Uniform.ar y su asesor de Meta Ads. Acá el equipo de marketing te hace consultas desde el panel, en un chat.

${AGENT_KNOWLEDGE}

# Cómo contestar
- Contestá lo que te preguntan, en español rioplatense, corto y con los números de los datos que tenés abajo (campañas, conjuntos, anuncios, métricas, posts de Instagram, aprendizajes). Si el dato no está, decilo; no lo inventes.
- Con pocos datos (menos de ~5 conversaciones), avisá que todavía no alcanza para concluir.
- No ejecutás nada en Meta. Si de la charla sale un cambio que conviene hacer (pausar, activar, presupuesto, conjunto nuevo, publicar o promocionar), proponelo con la herramienta que corresponde: queda en la sección Recomendaciones para que alguien lo apruebe. Mencioná en la respuesta qué dejaste ahí.
- Si el equipo te cuenta algo del negocio que vale para adelante (qué clientes cierran, qué conjunto trae consultas buenas, promos, stock), guardalo con save_learning y decí que lo anotaste.
- Si falta una pieza para probar algo, pedila con request_creative.
- Lo lee gente de marketing: nada de jerga innecesaria. Usá listas cortas cuando compares cosas.`;

// Chat con un agente de pauta (Meta o Google): contesta la última consulta del equipo con los datos de la cuenta.
// loadContext() → { text, ...lo que necesite dispatch }; dispatch(name, input, { chatId, context }) → resultado de la herramienta
export function createChatReplier({ anthropic, repo, model = DEFAULT_MODEL, system, tools, loadContext, dispatch }) {
  const contexts = new Map();
  const busy = new Set();

  // Los datos de la cuenta se arman una vez cada 10 minutos por conversación: las repreguntas usan la caché de prompts
  async function contextFor(chatId) {
    const hit = contexts.get(chatId);
    if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.context;
    const context = await loadContext();
    contexts.set(chatId, { context, at: Date.now() });
    return context;
  }

  // Contesta el último mensaje del equipo y guarda la respuesta con lo que hizo el agente
  return async function reply(chatId) {
    if (busy.has(chatId)) throw conflict('El agente todavía está contestando en esta conversación.');
    busy.add(chatId);
    try {
      const history = (await repo.listChatMessages(chatId)).slice(-HISTORY);
      if (history.at(-1)?.role !== 'user') throw conflict('No hay ninguna consulta para contestar.');
      const context = await contextFor(chatId);
      const messages = history.map((m) => ({ role: m.role, content: m.content }));
      while (messages[0]?.role === 'assistant') messages.shift();
      const actions = [];
      let answer = '';
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const resp = await anthropic.beta.messages.stream({
          model,
          max_tokens: 16000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [
            { type: 'text', text: system },
            { type: 'text', text: `Datos actuales de la cuenta:\n\n${context.text}`, cache_control: { type: 'ephemeral' } },
          ],
          tools,
          messages,
        }).finalMessage();
        if (resp.stop_reason === 'refusal') throw new Error('El agente no pudo contestar esta consulta.');
        messages.push({ role: 'assistant', content: resp.content });
        const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (text) answer = text;
        if (resp.stop_reason !== 'tool_use') break;
        const results = [];
        for (const block of resp.content.filter((b) => b.type === 'tool_use')) {
          const input = block.input ?? {};
          const result = NOT_IN_CHAT.has(block.name)
            ? { error: 'En el chat no se usa esta herramienta.' }
            : await dispatch(block.name, input, { chatId, context });
          if (result.queued) actions.push({ type: 'recommendation', id: result.decision_id, title: input.title || block.name });
          if (block.name === 'save_learning' && result.ok) actions.push({ type: 'learning', id: result.learning_id, title: input.text });
          if (block.name === 'request_creative' && result.ok) actions.push({ type: 'request', title: input.concept });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result), ...(result.error ? { is_error: true } : {}) });
        }
        messages.push({ role: 'user', content: results });
      }
      if (!answer) throw new Error('El agente no devolvió una respuesta.');
      return await repo.addChatMessage({ chatId, role: 'assistant', content: answer, actions });
    } finally {
      busy.delete(chatId);
    }
  };
}

export function createAdsChat({ anthropic, meta, repo, model = DEFAULT_MODEL, config }) {
  const dispatch = createDispatcher({ meta, repo, execute: null });
  return createChatReplier({
    anthropic, repo, model, system: CHAT_SYSTEM, tools: CHAT_TOOLS,
    loadContext: async () => ({ text: await buildContext({ meta, repo, config }) }),
    // autonomous: false siempre: desde el chat nada se ejecuta solo
    dispatch: (name, input, { chatId }) => dispatch(name, input, { runId: null, chatId, settings: { autonomous: false } }),
  });
}
