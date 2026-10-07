import { describe, it, expect } from 'vitest';
import { visibleNav } from './nav.js';
import { can } from '../../lib/permissions.js';

const user = (permissions, flags = {}) => ({ permissions: { home: 'none', ideas: 'none', calendar: 'none', projects: 'none', ads: 'none', web: 'none', ...permissions }, ...flags });

describe('navegación', () => {
  it('equipo ve las 4 principales y en "Más" Pauta, Web, Mi cuenta (sin Usuarios)', () => {
    const nav = visibleNav(user({ home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' }));
    expect(nav.primary.map((i) => i.label)).toEqual(['Inicio', 'Ideas', 'Calendario', 'Proyectos']);
    expect(nav.more.map((i) => i.label)).toEqual(['Agente de pauta', 'Admin web', 'Ajustes', 'Mi cuenta']);
  });

  it('admin ve Usuarios; lectura no ve Ajustes', () => {
    const admin = visibleNav(user({ home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'edit', web: 'edit' }, { manage_users: true }));
    expect(admin.more.map((i) => i.label)).toContain('Usuarios');
    const lectura = visibleNav(user({ home: 'view', ideas: 'view', calendar: 'view', projects: 'view' }));
    expect(lectura.more.map((i) => i.label)).not.toContain('Ajustes');
  });

  it('sin acceso a una sección, no aparece', () => {
    const nav = visibleNav(user({ home: 'view', ideas: 'edit' }));
    expect(nav.primary.map((i) => i.label)).toEqual(['Inicio', 'Ideas']);
  });

  it('can respeta niveles', () => {
    expect(can(user({ ideas: 'view' }), 'ideas')).toBe(true);
    expect(can(user({ ideas: 'view' }), 'ideas', 'edit')).toBe(false);
    expect(can(null, 'ideas')).toBe(false);
  });
});
