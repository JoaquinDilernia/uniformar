import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { parse } from '../lib/validate.js';
import { AppError, badRequest } from '../lib/errors.js';
import { toPublicUser } from '../repo/users.js';
import { COOKIE, verifyPassword, hashPassword, signSession, cookieOptions } from '../services/auth.js';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, 'Escribí tu contraseña'),
});
const changeSchema = z.object({
  currentPassword: z.string().min(1, 'Escribí tu contraseña actual'),
  newPassword: z.string().min(8).max(200),
});
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido');
const meSchema = z.object({ name: z.string().trim().min(1).max(60).optional(), avatar_color: colorSchema.optional() });

export function createAuthRouter({ usersRepo, secret, secureCookies, authenticate, loginLimit }) {
  const r = Router();
  const setSession = (res, user) => res.cookie(COOKIE, signSession(user, secret), cookieOptions(secureCookies));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginLimit,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.' } }),
  });

  r.post('/login', limiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await usersRepo.findByEmail(email);
    const ok = user && user.is_active && (await verifyPassword(password, user.password_hash));
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos');
    await usersRepo.touchLogin(user.id);
    setSession(res, user);
    res.json({ user: toPublicUser(await usersRepo.findById(user.id)) });
  });

  r.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/me', authenticate, (req, res) => res.json({ user: toPublicUser(req.user) }));

  r.patch('/me', authenticate, async (req, res) => {
    const patch = parse(meSchema, req.body);
    res.json({ user: toPublicUser(await usersRepo.update(req.user.id, patch)) });
  });

  r.post('/change-password', authenticate, async (req, res) => {
    const { currentPassword, newPassword } = parse(changeSchema, req.body);
    if (!(await verifyPassword(currentPassword, req.user.password_hash))) {
      throw badRequest('La contraseña actual no es correcta.', { currentPassword: 'Incorrecta' });
    }
    if (currentPassword === newPassword) {
      throw badRequest('La nueva contraseña tiene que ser distinta de la actual.', { newPassword: 'Igual a la actual' });
    }
    await usersRepo.setPassword(req.user.id, await hashPassword(newPassword), { mustChange: false });
    const user = await usersRepo.findById(req.user.id);
    setSession(res, user); // nuevo token_version: esta sesión sigue, las demás se cierran
    res.json({ user: toPublicUser(user) });
  });

  return r;
}
