import { IDEA_STATUS_ORDER } from './ideaStatus.js';

export const FORMAT_FILTERS = [{ value: 'all', label: 'Todo' }, { value: 'video', label: 'Videos' }, { value: 'photo', label: 'Fotos' }];
export const TYPE_FILTERS = [
  { value: 'all', label: 'Todos' }, { value: 'domingo', label: 'Domingo' }, { value: 'viernes', label: 'Viernes' },
  { value: 'producto', label: 'Producto' }, { value: 'otra', label: 'Otros' },
];
export const STATUS_FILTERS = [
  { value: 'all', label: 'Todas' }, { value: 'si_o_si', label: 'Sí o sí' }, { value: 'por_decidir', label: 'Por decidir' },
  { value: 'por_hacer', label: 'Por hacer' }, { value: 'realizada', label: 'Realizadas' }, { value: 'no_se_hace', label: 'No se hacen' },
];

const SUMMARY_WORDS = {
  si_o_si: ['sí o sí', 'sí o sí'], por_decidir: ['por decidir', 'por decidir'], por_hacer: ['por hacer', 'por hacer'],
  realizada: ['realizada', 'realizadas'], no_se_hace: ['no se hace', 'no se hacen'],
};

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterIdeas(ideas, { format = 'all', category = 'all', status = 'all', q = '' } = {}) {
  const needle = norm(q.trim());
  return ideas.filter((i) => (format === 'all' || i.format === format)
    && (category === 'all' || i.category === category)
    && (status === 'all' || i.status === status)
    && (!needle || norm([i.text, i.client_name, i.note_santi, i.note_sofi].filter(Boolean).join(' ')).includes(needle)));
}

export function countByStatus(ideas) {
  const c = Object.fromEntries(IDEA_STATUS_ORDER.map((s) => [s, 0]));
  for (const i of ideas) c[i.status]++;
  return c;
}

export function summarize(ideas) {
  const c = countByStatus(ideas);
  return IDEA_STATUS_ORDER.filter((s) => c[s]).map((s) => `${c[s]} ${SUMMARY_WORDS[s][c[s] === 1 ? 0 : 1]}`).join(' · ');
}

const byStatusThenNewest = (a, b) => IDEA_STATUS_ORDER.indexOf(a.status) - IDEA_STATUS_ORDER.indexOf(b.status)
  || new Date(b.created_at) - new Date(a.created_at);

export function groupIdeas(ideas) {
  const groups = [];
  const push = (key, title, list) => {
    if (list.length) groups.push({ key, title, ideas: [...list].sort(byStatusThenNewest), summary: summarize(list) });
  };
  push('must', '📌 Sí o sí', ideas.filter((i) => i.kind === 'must'));
  const rest = ideas.filter((i) => i.kind !== 'must');
  push('domingo', 'Domingo · humor', rest.filter((i) => i.category === 'domingo'));
  const viernes = rest.filter((i) => i.category === 'viernes');
  const clients = [...new Set(viernes.map((i) => i.client_name ?? ''))]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')));
  for (const c of clients) push(`viernes:${c}`, c ? `Viernes · ${c}` : 'Viernes · sin cliente', viernes.filter((i) => (i.client_name ?? '') === c));
  push('producto', 'Producto · catálogo', rest.filter((i) => i.category === 'producto'));
  push('otra', 'Otros', rest.filter((i) => i.category === 'otra'));
  return groups;
}
