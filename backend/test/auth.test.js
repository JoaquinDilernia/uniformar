import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestContext } from './helpers/testApp.js';

let ctx;
beforeAll(async () => { ctx = await createTestContext(); });
afterAll(() => ctx.close());

describe('auth', () => {
  it('login correcto setea cookie httpOnly y devuelve usuario sin hash', async () => {
    await ctx.createUser({ email: 'sofi@uniform.ar', name: 'Sofi' });
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'SOFI@uniform.ar', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Sofi');
    expect(res.body.user.password_hash).toBeUndefined();
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^uf_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('credenciales incorrectas → 401 INVALID_CREDENTIALS con mensaje claro', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'sofi@uniform.ar', password: 'mala' });
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos' });
  });

  it('usuario desactivado no puede entrar', async () => {
    const u = await ctx.createUser({ email: 'baja@uniform.ar' });
    await ctx.usersRepo.update(u.id, { is_active: false });
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'baja@uniform.ar', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('sin cookie → 401 UNAUTHENTICATED en rutas protegidas', async () => {
    const res = await request(ctx.app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('/me devuelve el usuario con permisos', async () => {
    const agent = await ctx.agentFor('sofi@uniform.ar');
    const res = await agent.get('/api/auth/me');
    expect(res.body.user.permissions.ideas).toBe('edit');
  });

  it('must_change_password bloquea el resto de la API hasta cambiarla', async () => {
    const { agent } = await ctx.asUser({ email: 'nuevo@uniform.ar', mustChange: true });
    const blocked = await agent.get('/api/nada-protegido');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('MUST_CHANGE_PASSWORD');
    const bad = await agent.post('/api/auth/change-password').send({ currentPassword: 'password123', newPassword: 'corta' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.newPassword).toBe('Mínimo 8 caracteres');
    const same = await agent.post('/api/auth/change-password').send({ currentPassword: 'password123', newPassword: 'password123' });
    expect(same.status).toBe(400);
    const ok = await agent.post('/api/auth/change-password').send({ currentPassword: 'password123', newPassword: 'nuevaClave9' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.must_change_password).toBe(false);
    // la cookie se reemitió con el nuevo token_version: la sesión sigue viva
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await agent.get('/api/nada-protegido')).status).toBe(404);
  });

  it('cambiar contraseña invalida otras sesiones del mismo usuario', async () => {
    await ctx.createUser({ email: 'dos@uniform.ar' });
    const a = await ctx.agentFor('dos@uniform.ar');
    const b = await ctx.agentFor('dos@uniform.ar');
    await a.post('/api/auth/change-password').send({ currentPassword: 'password123', newPassword: 'otraClave99' });
    const res = await b.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Tu sesión expiró. Volvé a entrar.');
  });

  it('renueva la cookie cuando quedan menos de 15 días', async () => {
    const u = await ctx.usersRepo.findByEmail('sofi@uniform.ar');
    const old = jwt.sign({ sub: u.id, tv: u.token_version, exp: Math.floor(Date.now() / 1000) + 5 * 86400 }, 'test-secret');
    const res = await request(ctx.app).get('/api/auth/me').set('Cookie', `uf_session=${old}`);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/^uf_session=/);
  });

  it('PATCH /me cambia nombre y color', async () => {
    const agent = await ctx.agentFor('sofi@uniform.ar');
    const res = await agent.patch('/api/auth/me').send({ name: 'Sofía', avatar_color: '#3B6A9E' });
    expect(res.body.user).toMatchObject({ name: 'Sofía', avatar_color: '#3B6A9E' });
    const bad = await agent.patch('/api/auth/me').send({ avatar_color: 'rojo' });
    expect(bad.status).toBe(400);
  });

  it('logout borra la cookie', async () => {
    const agent = await ctx.agentFor('sofi@uniform.ar');
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('rate limit de login: 10 intentos por IP+email', async () => {
    const limited = await createTestContext({ loginLimit: 3 });
    for (let i = 0; i < 3; i++) await request(limited.app).post('/api/auth/login').send({ email: 'x@x.com', password: 'mala' });
    const res = await request(limited.app).post('/api/auth/login').send({ email: 'x@x.com', password: 'mala' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    await limited.close();
  });
});
