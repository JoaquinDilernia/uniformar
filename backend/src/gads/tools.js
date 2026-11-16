const s = (description) => ({ type: 'string', description });
const n = (description) => ({ type: 'number', description });
const why = {
  title: s('Título corto de la recomendación, en lenguaje simple (ej. "Lanzar la campaña de búsqueda de uniformes para empresas")'),
  reason: s('Por qué, con los números que lo justifican (o, si todavía no hay datos, el razonamiento)'),
  expected_impact: s('Qué esperás que pase y cuándo se va a poder medir'),
};
const whyReq = ['title', 'reason', 'expected_impact'];
const strings = (description, extra = {}) => ({ type: 'array', items: { type: 'string' }, description, ...extra });

const KEYWORD = {
  type: 'object',
  properties: { text: s('La palabra clave, en minúsculas, hasta 80 caracteres y 10 palabras'), match_type: { type: 'string', enum: ['EXACT', 'PHRASE', 'BROAD'] } },
  required: ['text', 'match_type'],
};
const AD_TEXTS = {
  headlines: strings('Títulos del anuncio: entre 3 y 15, cada uno de hasta 30 caracteres (contá bien: Google rechaza el anuncio si uno se pasa)', { minItems: 3, maxItems: 15 }),
  descriptions: strings('Descripciones: entre 2 y 4, cada una de hasta 90 caracteres', { minItems: 2, maxItems: 4 }),
  final_url: s('Página de destino: https://uniformar.ar/ (o una sección, ej. https://uniformar.ar/#rubros)'),
};

// Todas las acciones sobre Google Ads quedan como recomendaciones pendientes de aprobación en el panel.
// Las que crean cosas se validan en Google antes de quedar pendientes: si algo no pasa, el error vuelve al agente.
export const GOOGLE_TOOLS = [
  {
    name: 'find_locations',
    description: 'Buscar el id de Google de provincias o ciudades de Argentina para segmentar (ej. ["Córdoba", "Rosario"]). Solo lectura. Argentina entera es 2032.',
    input_schema: { type: 'object', properties: { names: strings('Nombres a buscar', { minItems: 1, maxItems: 10 }) }, required: ['names'] },
  },
  {
    name: 'propose_search_campaign',
    description: 'Proponer una campaña de búsqueda nueva completa: presupuesto, ubicaciones, palabras negativas y grupos de anuncios (cada uno con sus palabras clave y su anuncio). Solo red de búsqueda de Google, en español. Al aprobarla se crea entera y ARRANCA ACTIVA (aprobar = lanzar). Antes de dejarla pendiente se valida en Google: si vuelve un error, corregilo y volvé a proponer.',
    input_schema: {
      type: 'object',
      properties: {
        name: s('Nombre de la campaña (ej. "UNIFORMAR | SEARCH | UNIFORMES EMPRESAS")'),
        daily_budget_ars: n('Presupuesto diario en pesos. Google puede gastar hasta el doble un día, pero en el mes promedia el diario × 30,4'),
        bidding: {
          type: 'object',
          description: 'Estrategia de puja. Sin conversiones registradas todavía, empezá con MAXIMIZE_CLICKS y un tope de CPC; pasá a MAXIMIZE_CONVERSIONS cuando haya ~15-30 consultas en 30 días.',
          properties: { strategy: { type: 'string', enum: ['MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS'] }, max_cpc_ars: n('Tope de costo por clic en pesos (solo MAXIMIZE_CLICKS)') },
          required: ['strategy'],
        },
        location_ids: strings('Ids de ubicación (find_locations). Si no lo pasás, Argentina entera (2032). Envío gratis a todo el país.', { maxItems: 20 }),
        negative_keywords: strings('Palabras negativas a nivel campaña (concordancia amplia): búsquedas que no son de empresas (ej. "gratis", "usados", "disfraz", "trabajo", "empleo")', { maxItems: 50 }),
        ad_groups: {
          type: 'array', minItems: 1, maxItems: 6,
          description: 'Grupos de anuncios, uno por tema de búsqueda (ej. uniformes gastronómicos, ropa de trabajo con logo, uniformes de construcción). Cada uno con 5-20 palabras clave muy relacionadas y su anuncio.',
          items: {
            type: 'object',
            properties: { name: s('Nombre del grupo'), keywords: { type: 'array', items: KEYWORD, minItems: 1, maxItems: 30 }, ...AD_TEXTS },
            required: ['name', 'keywords', 'headlines', 'descriptions', 'final_url'],
          },
        },
        ...why,
      },
      required: ['name', 'daily_budget_ars', 'bidding', 'ad_groups', ...whyReq],
    },
  },
  {
    name: 'set_status',
    description: 'Pausar o activar una campaña, un grupo de anuncios o una palabra clave. Activar empieza a gastar.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['campaign', 'ad_group', 'keyword'] },
        object_id: s('Id del objeto. Palabra clave: el id compuesto "<adGroupId>~<criterionId>" tal como viene en keywords[].id'),
        object_name: s('Nombre o texto'),
        status: { type: 'string', enum: ['ENABLED', 'PAUSED'] },
        ...why,
      },
      required: ['level', 'object_id', 'status', ...whyReq],
    },
  },
  {
    name: 'propose_budget_change',
    description: 'Proponer cambiar el presupuesto diario de una campaña, en PESOS. Cambios de hasta ±30% por vez para no reiniciar el aprendizaje, y respetando el tope mensual.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: s('Id de la campaña'), campaign_name: s('Nombre'),
        current_budget_ars: n('Presupuesto diario actual (campaigns[].dailyBudgetArs)'), proposed_budget_ars: n('Presupuesto diario propuesto'),
        ...why,
      },
      required: ['campaign_id', 'current_budget_ars', 'proposed_budget_ars', ...whyReq],
    },
  },
  {
    name: 'add_negative_keywords',
    description: 'Proponer palabras negativas a nivel campaña o grupo, a partir de términos de búsqueda (searchTerms) que gastaron y no son de empresas que buscan uniformes (empleo, particulares, otros productos).',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['campaign', 'ad_group'] }, target_id: s('Id de la campaña o del grupo'), target_name: s('Nombre'),
        keywords: strings('Hasta 20 palabras negativas', { minItems: 1, maxItems: 20 }),
        match_type: { type: 'string', enum: ['EXACT', 'PHRASE', 'BROAD'] },
        ...why,
      },
      required: ['level', 'target_id', 'keywords', 'match_type', ...whyReq],
    },
  },
  {
    name: 'add_keywords',
    description: 'Proponer palabras clave nuevas para un grupo existente (por ejemplo términos de búsqueda que trajeron consultas y todavía no son palabra clave).',
    input_schema: {
      type: 'object',
      properties: { ad_group_id: s('Id del grupo'), ad_group_name: s('Nombre del grupo'), keywords: { type: 'array', items: KEYWORD, minItems: 1, maxItems: 20 }, ...why },
      required: ['ad_group_id', 'keywords', ...whyReq],
    },
  },
  {
    name: 'propose_search_ad',
    description: 'Proponer un anuncio de búsqueda nuevo (títulos y descripciones) en un grupo existente, para probar otro mensaje.',
    input_schema: {
      type: 'object',
      properties: { ad_group_id: s('Id del grupo'), ad_group_name: s('Nombre del grupo'), ...AD_TEXTS, ...why },
      required: ['ad_group_id', 'headlines', 'descriptions', 'final_url', ...whyReq],
    },
  },
  {
    name: 'propose_assets',
    description: 'Proponer recursos para una campaña de búsqueda: vínculos a secciones de la web, textos destacados y fragmento estructurado. No cuestan más (se paga el clic) y agrandan el anuncio. Se validan en Google antes de quedar pendientes. Las imágenes NO se pueden agregar por API: si conviene sumarlas, recomendá en el informe cuáles de la biblioteca (images) cargar a mano en Google Ads.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: s('Id de la campaña'), campaign_name: s('Nombre'),
        sitelinks: {
          type: 'array', maxItems: 8,
          description: 'Vínculos a secciones (mínimo 2 para que se muestren, ideal 4). Texto hasta 25 caracteres; las dos descripciones hasta 35 cada una (las dos o ninguna). Secciones de la web: https://uniformar.ar/#rubros, #catalogo, #servicio, #franquicias, #resenas, #cotiza.',
          items: { type: 'object', properties: { text: s('Texto del vínculo, hasta 25 caracteres'), description1: s('Hasta 35'), description2: s('Hasta 35'), url: s('URL de uniformar.ar') }, required: ['text', 'url'] },
        },
        callouts: strings('Textos destacados de hasta 25 caracteres (ej. "Envío gratis al país", "Desde 30 prendas", "Logo bordado o estampado")', { maxItems: 10 }),
        structured_snippet: {
          type: 'object',
          description: 'Fragmento estructurado: un encabezado y 3 a 10 valores de hasta 25 caracteres (ej. Tipos: Camisas, Chombas, Camperas…).',
          properties: { header: { type: 'string', enum: ['Tipos', 'Servicios', 'Estilos', 'Marcas'] }, values: strings('Valores', { minItems: 3, maxItems: 10 }) },
          required: ['header', 'values'],
        },
        ...why,
      },
      required: ['campaign_id', ...whyReq],
    },
  },
  {
    name: 'import_meta_images',
    description: 'Traer a la biblioteca de Google (images) fotos de piezas de Meta (metaImagePieces). Se hace en el momento, sin aprobación: no gasta ni toca Google Ads. Después recomendá en el informe cuáles cargar a mano en la campaña. No ves las fotos: elegí por nombre y título (prendas con logo, rubros que buscamos) y priorizá las que ya se usaron en Meta (usedInMeta); no traigas las que ya tienen inGoogle.',
    input_schema: { type: 'object', properties: { creative_ids: strings('Ids de piezas de Meta (metaImagePieces[].id), hasta 6', { minItems: 1, maxItems: 6 }) }, required: ['creative_ids'] },
  },
  {
    name: 'save_learning',
    description: 'Guardar o actualizar un aprendizaje con evidencia repetida (nunca de una sola muestra). Pasá learning_id para actualizar o marcarlo obsolete.',
    input_schema: { type: 'object', properties: { learning_id: s('ID existente (omitir para crear)'), text: s('El aprendizaje, corto y accionable'), evidence: s('Evidencia con fechas y números'), status: { type: 'string', enum: ['active', 'obsolete'] } }, required: ['text', 'evidence'] },
  },
  {
    name: 'record_outcome',
    description: 'Registrar qué pasó realmente después de una decisión ejecutada (lista decisionsToEvaluate), con números.',
    input_schema: { type: 'object', properties: { decision_id: s('ID de la decisión'), outcome: s('Resultado medido') }, required: ['decision_id', 'outcome'] },
  },
  {
    name: 'ask_team',
    description: 'Hacerle una pregunta al equipo cuando te falta un dato que solo ellos tienen (si las consultas que llegan de Google son empresas reales, qué rubros cierran más, zonas). Una pregunta concreta por llamada. No repitas las que siguen en openQuestions.',
    input_schema: {
      type: 'object',
      properties: {
        question: s('La pregunta, concreta'), why: s('Qué decisión destraba la respuesta'),
        quick_answers: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Opcional: hasta 4 respuestas típicas cortas' },
      },
      required: ['question', 'why'],
    },
  },
];

export const GOOGLE_READ_ONLY = new Set(['find_locations']);
export const GOOGLE_ACTIONS = new Set(['propose_assets', 'propose_search_campaign', 'set_status', 'propose_budget_change', 'add_negative_keywords', 'add_keywords', 'propose_search_ad']);
// Las que crean cosas en Google se validan (validateOnly) antes de quedar pendientes
export const GOOGLE_VALIDATED = new Set(['propose_assets', 'propose_search_campaign', 'add_negative_keywords', 'add_keywords', 'propose_search_ad']);
