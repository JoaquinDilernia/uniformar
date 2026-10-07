import { usePersistentState } from '../../hooks/usePersistentState.js';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { WEEKDAY_SHORT, formatShort, monthOf, todayART, weekdayOf } from '../../lib/dates.js';
import { dayState } from '../../lib/dayState.js';
import s from './calendar.module.css';

export function WeekList({ weeks, month, byDate, rulesFor, onOpen }) {
  const [showAll, setShowAll] = usePersistentState('cal-show-all', false);
  const today = todayART();
  return (
    <div className={s.weeks}>
      <label className={s.toggle}>
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Mostrar también los días sin publicación fija
      </label>
      {weeks.map((w) => {
        const days = w.filter((d) => monthOf(d) === month && (showAll || rulesFor(d).length || byDate[d]?.length));
        if (!days.length) return null;
        return (
          <section key={w[0]}>
            <h2 className={s.weekTitle}>Semana del {formatShort(w[0])} al {formatShort(w[6])}</h2>
            <div className={s.dayList}>
              {days.map((d) => {
                const items = byDate[d] ?? [];
                const rules = rulesFor(d);
                return (
                  <button key={d} type="button" className={`${s.dayRow} ${d === today ? s.todayRow : ''}`} onClick={() => onOpen(d)}>
                    <span className={s.dayBadge}><span>{WEEKDAY_SHORT[weekdayOf(d)]}</span><strong>{Number(d.slice(8))}</strong></span>
                    <span className={s.dayMain}>
                      <span className={s.dayTheme}>{rules.map((r) => r.theme).join(' · ') || 'Día libre'}</span>
                      <span className={s.dayItems}>{items.length ? items.map((i) => i.title || 'Sin título').join(' · ') : 'Sin cargar'}</span>
                    </span>
                    <StatusBadge kind="day" status={dayState(items)} />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
