import { forbidden } from '../lib/errors.js';

export const SECTIONS = ['home', 'ideas', 'calendar', 'projects', 'ads', 'web'];
export const LEVELS = ['none', 'view', 'decide', 'edit'];
const RANK = { none: 0, view: 1, decide: 2, edit: 3 };
// "Decidir" solo tiene sentido en ideas: aceptar/rechazar, marcar realizada y dejar nota
export const DECIDE_SECTIONS = ['ideas'];

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

const DENIED = {
  view: (label) => `No tenés acceso a ${label}`,
  decide: (label) => `No tenés permiso para decidir en ${label}`,
  edit: (label) => `No tenés permiso para editar ${label}`,
};
export const deniedMessage = (section, level) => DENIED[level](SECTION_LABELS[section]);

export const requirePermission = (section, level) => (req, _res, next) => {
  if (!hasLevel(req.user, section, level)) throw forbidden(deniedMessage(section, level));
  next();
};

export const requireFlag = (flag) => (req, _res, next) => {
  if (!req.user?.[flag]) {
    throw forbidden(flag === 'can_delete' ? 'No tenés permiso para borrar' : 'No tenés permiso para gestionar usuarios');
  }
  next();
};
