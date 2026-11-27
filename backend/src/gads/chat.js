import { GOOGLE_TOOLS } from './tools.js';
import { GOOGLE_KNOWLEDGE } from './systemPrompt.js';
import { buildGoogleContext, createGoogleDispatcher } from './agent.js';
import { chatTools, createChatReplier } from '../ads/chat.js';
import { DEFAULT_MODEL } from '../ads/agent.js';

export const GOOGLE_CHAT_SYSTEM = `Sos el agente de Google Ads de Uniform.ar (el de Meta es otro). Acá el equipo de marketing te hace consultas desde el panel, en un chat.

${GOOGLE_KNOWLEDGE}

# Cómo contestar
- Contestá lo que te preguntan, en español rioplatense, corto y con los números de los datos que tenés abajo (campañas, grupos, palabras clave, términos de búsqueda, anuncios, recursos, métricas, aprendizajes). Si el dato no está, decilo; no lo inventes.
- Con pocos datos (menos de ~5 consultas o pocos días de campaña), avisá que todavía no alcanza para concluir.
- No ejecutás nada en Google. Si de la charla sale un cambio que conviene hacer (palabras clave o negativas, pausar o activar, presupuesto, anuncio, recursos, imágenes, campaña nueva), proponelo con la herramienta que corresponde: se valida en Google y queda en Recomendaciones para que alguien lo apruebe. Si vuelve un error, corregilo y volvé a proponer. Mencioná en la respuesta qué dejaste ahí.
- Nunca propongas algo que pase el tope mensual: el sistema lo rechaza.
- Si el equipo te cuenta algo del negocio que vale para adelante (qué búsquedas traen clientes buenos, qué rubros cierran, promos, stock), guardalo con save_learning y decí que lo anotaste.
- Lo lee gente de marketing: nada de jerga innecesaria. Usá listas cortas cuando compares cosas.`;

const GOOGLE_CHAT_TOOLS = chatTools(GOOGLE_TOOLS);

export function createGoogleChat({ anthropic, gads, repo, execute, images, model = DEFAULT_MODEL }) {
  const dispatch = createGoogleDispatcher({ gads, repo, execute, images });
  return createChatReplier({
    anthropic, repo, model, system: GOOGLE_CHAT_SYSTEM, tools: GOOGLE_CHAT_TOOLS,
    // snapshot y settings van con el contexto: el control del tope los usa al proponer
    loadContext: () => buildGoogleContext({ gads, repo, images }),
    dispatch: (name, input, { chatId, context }) => dispatch(name, input, { runId: null, chatId, settings: context.settings, snapshot: context.snapshot }),
  });
}
