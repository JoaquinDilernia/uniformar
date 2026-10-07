import { AppError, unauthenticated } from '../lib/errors.js';
import { RENEW_BELOW_MS, verifySession, signSession } from '../services/auth.js';

// <img src>/iframe no pueden mandar headers: solo para el archivo crudo se acepta ?token=
const RAW_FILE = /^\/files\/[^/]+\/raw\/?$/;

function extractToken(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
  if (m) return m[1];
  if (req.method === 'GET' && RAW_FILE.test(req.path) && typeof req.query.token === 'string') return req.query.token;
  return null;
}

export function createAuthenticate({ usersRepo, secret }) {
  return async (req, res, next) => {
    const token = extractToken(req);
    const payload = token ? verifySession(token, secret) : null;
    if (!payload) throw unauthenticated();
    const user = await usersRepo.findById(payload.sub);
    if (!user || !user.is_active || user.token_version !== payload.tv) {
      throw unauthenticated('Tu sesión expiró. Volvé a entrar.');
    }
    // sesión deslizante: si quedan menos de 15 días, se reemite por 30
    if (payload.exp * 1000 - Date.now() < RENEW_BELOW_MS) {
      res.set('X-Session-Token', signSession(user, secret));
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
