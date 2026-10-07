import { WEEK_HEADERS, formatLong, monthOf, todayART } from '../../lib/dates.js';
import s from './calendar.module.css';

export function MonthGrid({ weeks, month, byDate, rulesFor, onOpen }) {
  const today = todayART();
  return (
    <div className={s.grid}>
      <div className={s.gridHead}>{WEEK_HEADERS.map((h) => <span key={h}>{h}</span>)}</div>
      {weeks.map((w) => (
        <div key={w[0]} className={s.gridRow}>
          {w.map((d) => {
            const items = byDate[d] ?? [];
            const rules = rulesFor(d);
            const cls = [s.cell, monthOf(d) !== month && s.out, d === today && s.today, rules.length && s.hasRule].filter(Boolean).join(' ');
            return (
              <button key={d} type="button" className={cls} onClick={() => onOpen(d)}
                aria-label={`${formatLong(d)}${rules.length ? `, ${rules[0].theme}` : ''}, ${items.length} piezas`}>
                <span className={s.dayNum}>{Number(d.slice(8))}</span>
                {rules.map((r) => <span key={r.theme} className={s.rule}>{r.theme}</span>)}
                {items.slice(0, 3).map((i) => <span key={i.id} className={`${s.pill} ${s[i.status]}`}>{i.title || 'Sin título'}</span>)}
                {items.length > 3 && <span className={s.moreItems}>+{items.length - 3} más</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
