import { Clapperboard, Camera, Image as ImageIcon, CalendarClock } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { formatShort, todayART } from '../../lib/dates.js';
import s from './ideas.module.css';

const firstLine = (text) => text.split('\n')[0];

export function IdeaRow({ idea, onOpen }) {
  const Icon = idea.format === 'video' ? Clapperboard : Camera;
  const overdue = idea.due_date && idea.due_date < todayART() && idea.status !== 'realizada';
  return (
    <button type="button" className={s.row} onClick={onOpen}>
      <span className={`${s.formatIcon} ${s[idea.format]}`} title={idea.format === 'video' ? 'Video' : 'Foto'}><Icon size={18} aria-hidden /></span>
      <span className={s.rowMain}>
        <span className={s.rowTitle}>{firstLine(idea.text)}</span>
        {(idea.due_date || idea.ref_count > 0 || idea.assignee_name) && (
          <span className={s.rowMeta}>
            {idea.due_date && <span className={overdue ? s.overdue : ''}><CalendarClock size={12} aria-hidden /> {overdue ? 'Vencida' : 'Hasta'} {formatShort(idea.due_date)}</span>}
            {idea.ref_count > 0 && <span><ImageIcon size={12} aria-hidden /> {idea.ref_count}</span>}
            {idea.assignee_name && <span>{idea.assignee_name}</span>}
          </span>
        )}
      </span>
      <StatusBadge kind="idea" status={idea.status} />
    </button>
  );
}
