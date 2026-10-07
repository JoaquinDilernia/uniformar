import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestContext } from './helpers/testApp.js';

let ctx;
beforeAll(async () => { ctx = await createTestContext(); });
afterAll(() => ctx.close());

describe('auth', () => {
  it('login correcto devuelve token y usuario sin hash', async () => {
    await ctx.createUser({ email: 'sofi@uniform.ar', name: 'Sofi' });
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'SOFI@uniform.ar', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Sofi');
    expect(res.body.user.password_hash).toBeUndefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.headers['set-cookie']).toBeUndefined();
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

  it('sin Authorization → 401 UNAUTHENTICATED en rutas protegidas', async () => {
    const res = await request(ctx.app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('header malformado → 401', async () => {
    for (const h of ['Bearer', 'Bearer basura', 'Token abc', 'abc']) {
      const res = await request(ctx.app).get('/api/auth/me').set('Authorization', h);
      expect(res.status).toBe(401);
    }
  });

  it('el esquema Bearer no distingue mayúsculas', async () => {
    const { token } = await ctx.asUser({ email: 'case@uniform.ar' });
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('/me devuelve el usuario con permisos', async () => {
    const agent = await ctx.agentFor('sofi@uniform.ar');
    const res = await agent.get('/api/auth/me');
    expect(res.body.user.permissions.ideas).toBe('edit');
  });

  it('must_change_password bloquea el resto de la API hasta cambiarla', async () => {
    const { agent, token } = await ctx.asUser({ email: 'nuevo@uniform.ar', mustChange: true });
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
    // el token viejo (token_version anterior) ya no sirve; el nuevo sí
    expect(typeof ok.body.token).toBe('string');
    const old = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(old.status).toBe(401);
    expect(old.body.error.message).toBe('Tu sesión expiró. Volvé a entrar.');
    const fresh = (path) => request(ctx.app).get(path).set('Authorization', `Bearer ${ok.body.token}`);
    expect((await fresh('/api/auth/me')).status).toBe(200);
    expect((await fresh('/api/nada-protegido')).status).toBe(404);
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

  it('renueva el token (header X-Session-Token) cuando quedan menos de 15 días', async () => {
    const u = await ctx.usersRepo.findByEmail('sofi@uniform.ar');
    const old = jwt.sign({ sub: u.id, tv: u.token_version, exp: Math.floor(Date.now() / 1000) + 5 * 86400 }, 'test-secret');
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${old}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-session-token']).toBeTruthy();
    expect(res.headers['set-cookie']).toBeUndefined();
    const renewed = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${res.headers['x-session-token']}`);
    expect(renewed.status).toBe(200);
    expect(renewed.headers['x-session-token']).toBeUndefined();
  });

  it('un token recién emitido no se renueva', async () => {
    const { agent } = await ctx.asUser({ email: 'fresco@uniform.ar' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.headers['x-session-token']).toBeUndefined();
  });

  it('PATCH /me cambia nombre y color', async () => {
    const agent = await ctx.agentFor('sofi@uniform.ar');
    const res = await agent.patch('/api/auth/me').send({ name: 'Sofía', avatar_color: '#3B6A9E' });
    expect(res.body.user).toMatchObject({ name: 'Sofía', avatar_color: '#3B6A9E' });
    const bad = await agent.patch('/api/auth/me').send({ avatar_color: 'rojo' });
    expect(bad.status).toBe(400);
  });

  it('logout devuelve ok', async () => {
    const agent = await ctx.agentFor('sofi@uniform.ar');
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // Sesión sin estado: el token sigue siendo técnicamente válido hasta que
    // vence (o hasta cambiar la contraseña). El cliente lo descarta.
  });

  it('?token= se acepta solo en GET /api/files/:id/raw', async () => {
    const { token } = await ctx.asUser({ email: 'qs@uniform.ar' });
    const raw = await request(ctx.app).get(`/api/files/9999/raw?token=${token}`);
    expect(raw.status).not.toBe(401); // autenticó; el archivo no existe
    const other = await request(ctx.app).get(`/api/ideas?token=${token}`);
    expect(other.status).toBe(401);
    const bad = await request(ctx.app).get('/api/files/9999/raw?token=basura');
    expect(bad.status).toBe(401);
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

describe('CORS', () => {
  it('preflight desde el origen permitido', async () => {
    const c = await createTestContext({ corsOrigin: 'https://uniformar.techdi.com.ar' });
    const res = await request(c.app).options('/api/ideas')
      .set('Origin', 'https://uniformar.techdi.com.ar')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');
    expect(res.headers['access-control-allow-origin']).toBe('https://uniformar.techdi.com.ar');
    const get = await request(c.app).get('/health').set('Origin', 'https://uniformar.techdi.com.ar');
    expect(get.headers['access-control-expose-headers']).toContain('X-Session-Token');
    await c.close();
  });

  it('otro origen no recibe allow-origin', async () => {
    const c = await createTestContext({ corsOrigin: 'https://uniformar.techdi.com.ar' });
    const res = await request(c.app).options('/api/ideas')
      .set('Origin', 'https://malo.example.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await c.close();
  });
});
