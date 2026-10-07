import { describe, it, expect } from 'vitest';
import { hasLevel, requirePermission, requireFlag, TEMPLATES, SECTIONS } from '../src/services/permissions.js';

const user = (permissions, flags = {}) => ({ permissions, ...flags });

describe('permisos', () => {
  it('hasLevel respeta el orden none < view < edit', () => {
    const u = user({ ideas: 'view', projects: 'edit' });
    expect(hasLevel(u, 'ideas', 'view')).toBe(true);
    expect(hasLevel(u, 'ideas', 'edit')).toBe(false);
    expect(hasLevel(u, 'projects', 'view')).toBe(true);
    expect(hasLevel(u, 'calendar', 'view')).toBe(false);
  });

  it('requirePermission lanza 403 con el nombre de la sección', () => {
    const mw = requirePermission('projects', 'edit');
    expect(() => mw({ user: user({ projects: 'view' }) }, {}, () => {})).toThrow('No tenés permiso para editar Proyectos');
    let called = false;
    mw({ user: user({ projects: 'edit' }) }, {}, () => { called = true; });
    expect(called).toBe(true);
  });

  it('requireFlag', () => {
    expect(() => requireFlag('can_delete')({ user: user({}) }, {}, () => {})).toThrow('No tenés permiso para borrar');
  });

  it('plantillas cubren todas las secciones', () => {
    for (const t of Object.values(TEMPLATES)) expect(Object.keys(t.permissions).sort()).toEqual([...SECTIONS].sort());
    expect(TEMPLATES.equipo.can_delete).toBe(false);
    expect(TEMPLATES.admin.manage_users).toBe(true);
  });
});
