import { useIdeaActivity } from './api.js';
import { relativeTime } from '../../lib/dates.js';
import { Spinner } from '../../components/ui/Spinner.jsx';
import s from './ideas.module.css';

const FIELD = { text: 'el texto', kind: 'el tipo', format: 'el formato', category: 'el tipo de contenido', client_id: 'el cliente', assignee_id: 'a quién está asignada', reference_url: 'el link de referencia', due_date: 'la fecha límite', note_santi: 'la nota de Santi', note_sofi: 'la nota de Sofi', decision: 'la decisión' };
const ACTION = { create: 'creó la idea', decide_yes: 'marcó "Sí, la hago"', decide_no: 'marcó "No la hago"', undecide: 'deshizo la decisión', complete: 'la marcó como realizada', reopen: 'la reabrió' };

function describe(a) {
  if (a.action !== 'update') return ACTION[a.action] ?? a.action;
  const fields = Object.keys(a.diff ?? {}).filter((f) => !f.endsWith('_by')).map((f) => FIELD[f] ?? f);
  return `cambió ${fields.join(', ')}`;
}

export function IdeaActivity({ id }) {
  const { data, isPending } = useIdeaActivity(id, true);
  if (isPending) return <div className={s.pad}><Spinner /></div>;
  return (
    <ul className={s.activity}>
      {data.map((a) => (
        <li key={a.id}><strong>{a.actor_name ?? 'Alguien'}</strong> {describe(a)} <span className="muted">· {relativeTime(a.created_at)}</span></li>
      ))}
    </ul>
  );
}
