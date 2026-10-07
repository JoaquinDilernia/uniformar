import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';

let ctx, admin, adminAgent;
beforeAll(async () => {
  ctx = await createTestContext();
  ({ user: admin, agent: adminAgent } = await ctx.asUser({ email: 'joaco@techdi.com.ar', name: 'Joaco' }));
});
afterAll(() => ctx.close());

describe('usuarios', () => {
  it('admin crea usuario con plantilla equipo y contraseña inicial obligatoria de cambiar', async () => {
    const res = await adminAgent.post('/api/users').send({ name: 'Santi', email: 'santi@uniform.ar', password: 'inicial123', template: 'equipo' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Santi', must_change_password: true, can_delete: false, manage_users: false });
    expect(res.body.user.permissions).toEqual({ home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' });
    const login = await ctx.agentFor('santi@uniform.ar', 'inicial123');
    expect((await login.get('/api/users/directory')).body.error.code).toBe('MUST_CHANGE_PASSWORD');
  });

  it('email repetido → 409 con mensaje claro', async () => {
    const res = await adminAgent.post('/api/users').send({ name: 'X', email: 'SANTI@uniform.ar', password: 'inicial123', template: 'lectura' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Ya existe un usuario con ese email.');
  });

  it('sin manage_users → 403 al listar o crear', async () => {
    const { agent } = await ctx.asUser({ template: 'equipo' });
    expect((await agent.get('/api/users')).status).toBe(403);
    expect((await agent.post('/api/users').send({})).body.error.message).toBe('No tenés permiso para gestionar usuarios');
  });

  it('directory disponible para cualquier usuario logueado', async () => {
    const { agent } = await ctx.asUser({ template: 'lectura' });
    const res = await agent.get('/api/users/directory');
    expect(res.status).toBe(200);
    expect(res.body.users.some((u) => u.name === 'Santi')).toBe(true);
  });

  it('PUT permisos ajusta sección por sección y valida niveles', async () => {
    const santi = await ctx.usersRepo.findByEmail('santi@uniform.ar');
    const ok = await adminAgent.put(`/api/users/${santi.id}/permissions`).send({ projects: 'view' });
    expect(ok.body.user.permissions.projects).toBe('view');
    expect(ok.body.user.permissions.ideas).toBe('edit');
    const bad = await adminAgent.put(`/api/users/${santi.id}/permissions`).send({ projects: 'admin' });
    expect(bad.status).toBe(400);
  });

  it('nadie se quita a sí mismo manage_users ni se desactiva', async () => {
    const a = await adminAgent.patch(`/api/users/${admin.id}`).send({ manage_users: false });
    expect(a.status).toBe(409);
    const b = await adminAgent.patch(`/api/users/${admin.id}`).send({ is_active: false });
    expect(b.status).toBe(409);
  });

  it('desactivar a otro gestor está permitido (queda el que actúa) y le cierra la sesión', async () => {
    const { user: other, agent: otherAgent } = await ctx.asUser({ template: 'admin' });
    const res = await adminAgent.patch(`/api/users/${other.id}`).send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.user.is_active).toBe(false);
    expect((await otherAgent.get('/api/auth/me')).status).toBe(401);
  });

  it('reset de contraseña devuelve temporal y cierra sesiones del usuario', async () => {
    const { user, agent } = await ctx.asUser({ template: 'equipo' });
    const res = await adminAgent.post(`/api/users/${user.id}/reset-password`);
    expect(res.body.temporaryPassword).toHaveLength(10);
    expect(res.body.user.must_change_password).toBe(true);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    await ctx.agentFor(user.email, res.body.temporaryPassword);
  });

  it('id inexistente → 404', async () => {
    expect((await adminAgent.patch('/api/users/00000000-0000-0000-0000-000000000000').send({ name: 'x' })).status).toBe(404);
    expect((await adminAgent.patch('/api/users/no-es-uuid').send({ name: 'x' })).status).toBe(404);
  });
});
