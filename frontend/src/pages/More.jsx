import { Link } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../state/auth.jsx';
import { visibleNav } from '../components/shell/nav.js';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import s from './pages.module.css';

export function MorePage() {
  const { user, logout } = useAuth();
  const { more } = visibleNav(user);
  return (
    <>
      <PageHeader title="Más" subtitle={user.name} />
      <div className={s.page}>
        <div className={s.list}>
          {more.map(({ to, label, icon: Icon, soon }) => (
            <Link key={to} to={to} className={s.listItem}>
              <Icon size={20} aria-hidden />
              <span className={s.grow}>{label}</span>
              {soon && <span className="muted" style={{ fontSize: 'var(--fs-s)' }}>Próximamente</span>}
              <ChevronRight size={18} aria-hidden className="muted" />
            </Link>
          ))}
          <button type="button" className={s.listItem} onClick={logout} style={{ border: 0, background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
            <LogOut size={20} aria-hidden />
            <span className={s.grow}>Salir</span>
          </button>
        </div>
      </div>
    </>
  );
}
