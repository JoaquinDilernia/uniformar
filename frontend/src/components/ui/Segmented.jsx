import { useId } from 'react';
import s from './Chip.module.css';

export function Segmented({ options, value, onChange, label, disabled }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={s.group}>
      {options.map((o) => (
        <label key={o.value} className={`${s.chip} ${value === o.value ? s.selected : ''}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={disabled}
            onChange={() => onChange(o.value)} className="visually-hidden" />
          {o.label}
        </label>
      ))}
    </div>
  );
}
