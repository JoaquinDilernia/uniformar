import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import s from './PageHeader.module.css';

export function PageHeader({ title, subtitle, actions, back }) {
  const navigate = useNavigate();
  return (
    <header className={s.header}>
      {back && (
        <button type="button" className={s.back} onClick={() => navigate(back)} aria-label="Volver">
          <ChevronLeft size={22} />
        </button>
      )}
      <div className={s.titles}>
        <h1 className={s.title}>{title}</h1>
        {subtitle && <p className={s.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}
