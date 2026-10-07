import { AppError, unauthenticated } from '../lib/errors.js';
import { COOKIE, RENEW_BELOW_MS, verifySession, signSession, cookieOptions } from '../services/auth.js';

export function createAuthenticate({ usersRepo, secret, secureCookies }) {
  return async (req, res, next) => {
    const token = req.cookies?.[COOKIE];
    const payload = token ? verifySession(token, secret) : null;
    if (!payload) throw unauthenticated();
    const user = await usersRepo.findById(payload.sub);
    if (!user || !user.is_active || user.token_version !== payload.tv) {
      res.clearCookie(COOKIE, { path: '/' });
      throw unauthenticated('Tu sesión expiró. Volvé a entrar.');
    }
    // sesión deslizante: si quedan menos de 15 días, se reemite por 30
    if (payload.exp * 1000 - Date.now() < RENEW_BELOW_MS) {
      res.cookie(COOKIE, signSession(user, secret), cookieOptions(secureCookies));
    }
    req.user = user;
    next();
  };
}

export function requirePasswordChanged(req, _res, next) {
  if (req.user.must_change_password) {
    throw new AppError(403, 'MUST_CHANGE_PASSWORD', 'Tenés que cambiar tu contraseña antes de seguir.');
  }
  next();
}
