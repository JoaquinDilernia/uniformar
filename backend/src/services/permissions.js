import { forbidden } from '../lib/errors.js';

export const SECTIONS = ['home', 'ideas', 'calendar', 'projects', 'ads', 'web'];
export const LEVELS = ['none', 'view', 'edit'];
const RANK = { none: 0, view: 1, edit: 2 };

export const SECTION_LABELS = {
  home: 'Inicio', ideas: 'Ideas', calendar: 'Calendario', projects: 'Proyectos', ads: 'Agente de pauta', web: 'Admin web',
};

const all = (level) => Object.fromEntries(SECTIONS.map((s) => [s, level]));

export const TEMPLATES = {
  admin: { permissions: all('edit'), can_delete: true, manage_users: true },
  equipo: {
    permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' },
    can_delete: false,
    manage_users: false,
  },
  lectura: { permissions: all('view'), can_delete: false, manage_users: false },
};

export function hasLevel(user, section, level) {
  return RANK[user?.permissions?.[section] ?? 'none'] >= RANK[level];
}

export const requirePermission = (section, level) => (req, _res, next) => {
  if (!hasLevel(req.user, section, level)) {
    throw forbidden(level === 'edit'
      ? `No tenés permiso para editar ${SECTION_LABELS[section]}`
      : `No tenés acceso a ${SECTION_LABELS[section]}`);
  }
  next();
};

export const requireFlag = (flag) => (req, _res, next) => {
  if (!req.user?.[flag]) {
    throw forbidden(flag === 'can_delete' ? 'No tenés permiso para borrar' : 'No tenés permiso para gestionar usuarios');
  }
  next();
};
