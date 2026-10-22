import { DEFAULT_MODEL } from './agent.js';

const SYSTEM = `Sos el agente de pauta de Uniform.ar (uniformes y ropa de trabajo para empresas; el objetivo de la pauta son conversaciones de WhatsApp de empresas, la métrica principal es conversations y costPerConversation).
Te pasan el reporte de un período ya calculado desde Meta. Tu trabajo es leerlo para el equipo de marketing, en español rioplatense, corto y concreto.

Reglas:
- Usá SOLO números que estén en el reporte, tal cual. No calcules cifras nuevas salvo diferencias o porcentajes simples entre dos números del reporte, y nunca inventes datos.
- Si hay pocos datos (menos de ~5 conversaciones en un grupo), decilo en vez de sacar conclusiones.
- totals.previous es el período anterior de la misma duración: comparalo con totals.current.
- organic es el contenido orgánico de Instagram publicado en el período (likes, comentarios, alcance por tipo y los posts con más interacción). Sirve para ver qué temas o formatos conectan y si conviene promocionarlos.
- actions son las acciones ejecutadas en el período con su antes/después medido; outcome es lo que anotó el agente en su momento.

Formato (respetalo, con estos títulos en negrita):
**Cómo nos fue** — 2-3 líneas: gasto, conversaciones y costo por conversación contra el período anterior.
**Dónde destacamos** — 2-4 puntos: anuncios, conjuntos, ubicaciones, edades, zonas u horarios que traen conversaciones más baratas.
**Orgánico** — 1-3 líneas: qué tipo de contenido y qué posts anduvieron mejor en Instagram (si organic no tiene datos, omití esta sección).
**Dónde flojeamos** — 2-4 puntos: lo que gasta sin rendir.
**Qué mejoró el agente** — qué acciones dieron resultado según el antes/después (o "todavía es pronto para medir").
**Qué probaría** — 2-3 ideas concretas a partir de lo anterior.`;

// Saca lo que no aporta al análisis (miniaturas, ids) para no gastar tokens
const forModel = (report) => JSON.stringify(report, (k, v) => (['thumbnail', 'id', 'permalink'].includes(k) ? undefined : v));

export function createReportAnalyst({ anthropic, model = DEFAULT_MODEL }) {
  return async function analyze(report, { businessNotes = '', learnings = [] } = {}) {
    const content = [
      `Reporte del ${report.range.since} al ${report.range.until}:`,
      forModel(report),
      businessNotes && `Contexto del negocio: ${businessNotes}`,
      learnings.length && `Aprendizajes guardados: ${JSON.stringify(learnings.map((l) => l.text))}`,
    ].filter(Boolean).join('\n\n');
    const resp = await anthropic.beta.messages.stream({
      model,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    }).finalMessage();
    if (resp.stop_reason === 'refusal') throw new Error('El modelo no pudo completar el análisis.');
    const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!text) throw new Error('El agente no devolvió el análisis.');
    return text;
  };
}
