import { Router } from 'express';
import { createApp } from './app.js';
import { createUsersRepo } from './repo/users.js';
import { createAuthenticate, requirePasswordChanged } from './middleware/authenticate.js';
import { createAuthRouter } from './routes/auth.js';
import { createUsersRouter } from './routes/users.js';

export function buildApp({ db, jwtSecret, storage, secureCookies = false, staticDir, loginLimit = 10 }) {
  if (!jwtSecret) throw new Error('Falta jwtSecret');
  const usersRepo = createUsersRepo(db);
  const authenticate = createAuthenticate({ usersRepo, secret: jwtSecret, secureCookies });

  const api = Router();
  api.use('/auth', createAuthRouter({ usersRepo, secret: jwtSecret, secureCookies, authenticate, loginLimit }));
  // Todo lo que sigue requiere sesión y contraseña ya cambiada
  api.use(authenticate, requirePasswordChanged);
  api.use('/users', createUsersRouter({ usersRepo }));
  // (las tasks siguientes montan sus routers acá)

  return createApp({
    apiRouter: api,
    staticDir,
    health: async () => {
      await db.query('SELECT 1');
      return { db: true };
    },
  });
}
