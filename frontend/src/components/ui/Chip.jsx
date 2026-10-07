import s from './Chip.module.css';

export function Chip({ selected = false, count, children, ...rest }) {
  return (
    <button type="button" aria-pressed={selected} className={`${s.chip} ${selected ? s.selected : ''}`} {...rest}>
      {children}
      {count != null && <span className={s.count}>{count}</span>}
    </button>
  );
}

export function ChipGroup({ label, children }) {
  return (
    <div className={s.group} role="group" aria-label={label}>
      {children}
    </div>
  );
}
