import { Home, Lightbulb, CalendarDays, FolderKanban, Megaphone, Globe, Users, Settings2, UserCircle } from 'lucide-react';
import { can } from '../../lib/permissions.js';

export const NAV_ITEMS = [
  { to: '/', label: 'Inicio', icon: Home, section: 'home', primary: true },
  { to: '/ideas', label: 'Ideas', icon: Lightbulb, section: 'ideas', primary: true },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays, section: 'calendar', primary: true },
  { to: '/proyectos', label: 'Proyectos', icon: FolderKanban, section: 'projects', primary: true },
  { to: '/pauta', label: 'Agente de pauta', icon: Megaphone, section: 'ads', soon: true },
  { to: '/web', label: 'Admin web', icon: Globe, section: 'web', soon: true },
  { to: '/usuarios', label: 'Usuarios', icon: Users, flag: 'manage_users' },
  { to: '/ajustes', label: 'Ajustes', icon: Settings2, section: 'calendar', level: 'edit' },
  { to: '/cuenta', label: 'Mi cuenta', icon: UserCircle },
];

function allowed(user, item) {
  if (item.flag) return Boolean(user?.[item.flag]);
  if (item.section) return can(user, item.section, item.level ?? 'view');
  return true;
}

export function visibleNav(user) {
  const items = NAV_ITEMS.filter((i) => allowed(user, i));
  return { primary: items.filter((i) => i.primary), more: items.filter((i) => !i.primary), all: items };
}
