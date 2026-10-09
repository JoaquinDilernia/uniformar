const s = (description) => ({ type: 'string', description });
const n = (description) => ({ type: 'number', description });
const why = {
  title: s('Título corto de la recomendación, en lenguaje simple (ej. "Pausar el anuncio de pisos alemanes")'),
  reason: s('Por qué, con los números que lo justifican'),
  expected_impact: s('Qué esperás que pase y cuándo se va a poder medir'),
};
const whyReq = ['title', 'reason', 'expected_impact'];

// Las acciones sobre Meta (pausar, activar, presupuesto, conjuntos, anuncios) quedan como
// recomendaciones pendientes de aprobación en el panel, salvo que el modo autónomo esté
// prendido: ahí pausar un anuncio se ejecuta solo.
export const TOOL_DEFINITIONS = [
  {
    name: 'pause_ad',
    description: 'Pausar un anuncio. Usalo con anuncios que gastaron de verdad sin generar conversaciones, o con fatiga clara. Nunca dejes un conjunto activo sin anuncios.',
    input_schema: { type: 'object', properties: { ad_id: s('ID del anuncio'), ad_name: s('Nombre del anuncio'), ...why }, required: ['ad_id', ...whyReq] },
  },
  {
    name: 'set_status',
    description: 'Proponer pausar o activar una campaña o un conjunto. Activar algo empieza a gastar plata: siempre queda pendiente de aprobación.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['campaign', 'adset', 'ad'] },
        object_id: s('ID del objeto'), object_name: s('Nombre del objeto'),
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
        ...why,
      },
      required: ['level', 'object_id', 'status', ...whyReq],
    },
  },
  {
    name: 'propose_budget_change',
    description: 'Proponer cambiar el presupuesto diario de una campaña (CBO) o de un conjunto. En PESOS. Respetá el tope mensual.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['campaign', 'adset'] }, object_id: s('ID'), object_name: s('Nombre'),
        current_budget_ars: n('Presupuesto diario actual en pesos'), proposed_budget_ars: n('Presupuesto diario propuesto en pesos'),
        ...why,
      },
      required: ['level', 'object_id', 'current_budget_ars', 'proposed_budget_ars', ...whyReq],
    },
  },
  {
    name: 'propose_adset',
    description: 'Proponer un conjunto nuevo dentro de una campaña existente (por ejemplo para probar otro público). Buscá antes los intereses reales con search_interest — nunca inventes IDs. El conjunto se crea PAUSADO, optimizando conversaciones de WhatsApp al número de la cuenta; sin presupuesto propio si la campaña es CBO.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: s('ID de la campaña'),
        name: s('Nombre del conjunto, en MAYÚSCULAS con guiones bajos (ej. WPP_GASTRONOMIA_AMBA)'),
        targeting: { type: 'object', description: 'Targeting de Graph API: geo_locations, age_min, age_max, flexible_spec con intereses, targeting_automation.advantage_audience (0 o 1)' },
        daily_budget_ars: n('Solo si la campaña NO es CBO: presupuesto diario del conjunto en pesos'),
        creative_id: s('Opcional: id de una pieza sin usar para crear el anuncio en el mismo paso'),
        ...why,
      },
      required: ['campaign_id', 'name', 'targeting', ...whyReq],
    },
  },
  {
    name: 'create_ad',
    description: 'Proponer publicar una pieza subida al panel (de la lista unusedCreatives) como anuncio en un conjunto. El anuncio nace ACTIVO dentro del conjunto (si el conjunto está pausado no gasta).',
    input_schema: { type: 'object', properties: { creative_id: s('id de la pieza en el panel'), adset_id: s('ID del conjunto destino'), adset_name: s('Nombre del conjunto'), ...why }, required: ['creative_id', 'adset_id', ...whyReq] },
  },
  {
    name: 'search_interest',
    description: 'Buscar intereses reales de Meta (con tamaño de público) para armar segmentaciones. Solo lectura.',
    input_schema: { type: 'object', properties: { query: s('Término, ej. "gastronomía", "construcción"') }, required: ['query'] },
  },
  {
    name: 'request_creative',
    description: 'Pedirle al equipo de marketing una pieza nueva cuando hace falta (no hay piezas sin usar, fatiga, ángulo sin probar). Sé concreto: formato, qué se ve, qué dice, por qué.',
    input_schema: {
      type: 'object',
      properties: { concept: s('Idea de la pieza en una línea'), style_notes: s('Formato (feed 4:5 y/o historia 9:16), qué mostrar, texto, tono, referencias'), reason: s('Por qué hace falta ahora') },
      required: ['concept', 'style_notes', 'reason'],
    },
  },
  {
    name: 'save_learning',
    description: 'Guardar o actualizar un aprendizaje con evidencia repetida (mínimo 2-3 observaciones consistentes, nunca de una sola muestra). Pasá learning_id para actualizar o marcarlo obsolete.',
    input_schema: { type: 'object', properties: { learning_id: s('ID existente (omitir para crear)'), text: s('El aprendizaje, corto y accionable'), evidence: s('Evidencia con fechas y números'), status: { type: 'string', enum: ['active', 'obsolete'] } }, required: ['text', 'evidence'] },
  },
  {
    name: 'record_outcome',
    description: 'Registrar qué pasó realmente después de una decisión ejecutada (lista decisionsToEvaluate), con números.',
    input_schema: { type: 'object', properties: { decision_id: s('ID de la decisión'), outcome: s('Resultado medido') }, required: ['decision_id', 'outcome'] },
  },
];

export const READ_ONLY_TOOLS = new Set(['search_interest']);
export const META_ACTIONS = new Set(['pause_ad', 'set_status', 'propose_budget_change', 'propose_adset', 'create_ad']);
