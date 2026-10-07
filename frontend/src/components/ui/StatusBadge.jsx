import { IDEA_STATUS_LABELS, CALENDAR_STATUS_LABELS } from '../../lib/ideaStatus.js';
import s from './StatusBadge.module.css';

const TONE = {
  idea: { si_o_si: 'accent', por_decidir: 'warn', por_hacer: 'info', realizada: 'success', no_se_hace: 'neutral' },
  calendar: { draft: 'warn', ready: 'info', published: 'success' },
  day: { empty: 'neutral', planned: 'warn', ready: 'info', published: 'success' },
  project: { active: 'accent', proposal: 'warn', upcoming: 'info', done: 'success' },
};
const LABELS = {
  idea: IDEA_STATUS_LABELS,
  calendar: CALENDAR_STATUS_LABELS,
  day: { empty: 'Sin cargar', planned: 'Planificado', ready: 'Pieza lista', published: 'Publicado' },
  project: { active: 'Activo', proposal: 'Propuesta', upcoming: 'Próximo', done: 'Terminado' },
};

export function StatusBadge({ kind, status }) {
  return <span className={`${s.badge} ${s[TONE[kind][status]]}`}>{LABELS[kind][status]}</span>;
}
