import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import s from './Collapsible.module.css';

export function Collapsible({ title, summary, count, defaultOpen = false, open: openProp, onToggle, children }) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const id = useId();
  const toggle = () => (onToggle ? onToggle(!open) : setInner(!open));
  return (
    <section className={s.box}>
      <button type="button" className={s.head} aria-expanded={open} aria-controls={id} onClick={toggle}>
        <span className={s.titles}>
          <span className={s.title}>{title}{count != null && <span className={s.count}>{count}</span>}</span>
          {summary && <span className={s.summary}>{summary}</span>}
        </span>
        <ChevronDown size={20} className={`${s.chev} ${open ? s.open : ''}`} aria-hidden />
      </button>
      {open && <div id={id} className={s.body}>{children}</div>}
    </section>
  );
}
