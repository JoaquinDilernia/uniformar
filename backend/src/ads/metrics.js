// Lectura de las métricas de Meta en términos del negocio: el resultado que importa es
// la conversación de WhatsApp iniciada (consulta), no el clic ni el "me gusta".
export const CONVERSATION = 'onsite_conversion.messaging_conversation_started_7d';
const REPLIED = 'onsite_conversion.messaging_conversation_replied_7d';

const num = (v) => (v == null || v === '' ? 0 : Number(v));
const action = (row, type) => num(row.actions?.find((a) => a.action_type === type)?.value);

export function summarizeRow(row) {
  const spend = num(row.spend);
  const conversations = action(row, CONVERSATION);
  return {
    spend: Math.round(spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    frequency: row.frequency != null ? Number(num(row.frequency).toFixed(2)) : null,
    clicks: num(row.clicks),
    ctr: row.ctr != null ? Number(num(row.ctr).toFixed(2)) : null,
    cpm: row.cpm != null ? Math.round(num(row.cpm)) : null,
    conversations,
    replied: action(row, REPLIED),
    costPerConversation: conversations > 0 ? Math.round(spend / conversations) : null,
  };
}

export function totals(rows) {
  const sum = rows.reduce((acc, r) => {
    const s = summarizeRow(r);
    acc.spend += s.spend;
    acc.impressions += s.impressions;
    acc.clicks += s.clicks;
    acc.conversations += s.conversations;
    acc.replied += s.replied;
    return acc;
  }, { spend: 0, impressions: 0, clicks: 0, conversations: 0, replied: 0 });
  return { ...sum, costPerConversation: sum.conversations > 0 ? Math.round(sum.spend / sum.conversations) : null };
}

// Fecha YYYY-MM-DD en hora argentina (la cuenta publicitaria también está en ART)
export function artDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
}

export function daysAgo(n, from = new Date()) {
  return artDate(new Date(from.getTime() - n * 86400_000));
}

export const monthStart = (from = new Date()) => `${artDate(from).slice(0, 8)}01`;

// Presupuestos de Meta en la moneda de la cuenta (ARS) vienen en centavos
export const centsToArs = (v) => (v == null ? null : Math.round(Number(v) / 100));
