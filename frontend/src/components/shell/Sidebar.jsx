import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { visibleNav } from './nav.js';
import s from './AppShell.module.css';

export function Sidebar() {
  const { user, logout } = useAuth();
  const { all } = visibleNav(user);
  return (
    <aside className={s.sidebar}>
      <img src="/logo-ciruela.png" alt="Uniform.ar" className={s.sideLogo} />
      <nav className={s.sideNav} aria-label="Secciones">
        {all.map(({ to, label, icon: Icon, soon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `${s.sideLink} ${isActive ? s.active : ''}`}>
            <Icon size={20} aria-hidden />
            <span>{label}</span>
            {soon && <span className={s.soon}>Pronto</span>}
          </NavLink>
        ))}
      </nav>
      <div className={s.me}>
        <span className={s.meAvatar} style={{ background: user.avatar_color }} aria-hidden>{user.name[0]}</span>
        <span className={s.meName}>{user.name}</span>
        <button type="button" className={s.logout} onClick={logout} aria-label="Salir" title="Salir"><LogOut size={18} /></button>
      </div>
    </aside>
  );
}
