// Única fuente del estado de una idea (espejada en frontend/src/lib/ideaStatus.js)
export const IDEA_STATUS_LABELS = {
  si_o_si: 'Sí o sí', por_decidir: 'Por decidir', por_hacer: 'Por hacer', realizada: 'Realizada', no_se_hace: 'No se hace',
};

export function deriveIdeaStatus({ kind, decision, done_at }) {
  if (decision === 'no') return 'no_se_hace';
  if (done_at) return 'realizada';
  if (kind === 'must') return 'si_o_si';
  if (decision === 'yes') return 'por_hacer';
  return 'por_decidir';
}
