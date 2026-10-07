import { NavLink } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { visibleNav } from './nav.js';
import s from './AppShell.module.css';

export function BottomNav() {
  const { user } = useAuth();
  const { primary } = visibleNav(user);
  return (
    <nav className={s.bottom} aria-label="Secciones">
      {[...primary, { to: '/mas', label: 'Más', icon: MoreHorizontal }].map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}>
          <Icon size={22} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
