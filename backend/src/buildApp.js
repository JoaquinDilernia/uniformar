import { Router } from 'express';
import { createApp } from './app.js';
import { createUsersRepo } from './repo/users.js';
import { createClientsRepo } from './repo/clients.js';
import { createActivityRepo } from './repo/activity.js';
import { createIdeasRepo } from './repo/ideas.js';
import { createCalendarRepo } from './repo/calendar.js';
import { createProjectsRepo } from './repo/projects.js';
import { createHomeRepo } from './repo/home.js';
import { createFilesService } from './services/files.js';
import { createAuthenticate, requirePasswordChanged } from './middleware/authenticate.js';
import { createAuthRouter } from './routes/auth.js';
import { createUsersRouter } from './routes/users.js';
import { createSettingsRouter } from './routes/settings.js';
import { createFilesRouter } from './routes/files.js';
import { createIdeasRouter } from './routes/ideas.js';
import { createCalendarRouter } from './routes/calendar.js';
import { createProjectsRouter } from './routes/projects.js';
import { createHomeRouter } from './routes/home.js';

export function buildApp({ db, jwtSecret, storage, corsOrigin, staticDir, loginLimit = 10 }) {
  if (!jwtSecret) throw new Error('Falta jwtSecret');
  if (!storage) throw new Error('Falta storage');

  const usersRepo = createUsersRepo(db);
  const clientsRepo = createClientsRepo(db);
  const activityRepo = createActivityRepo(db);
  const ideasRepo = createIdeasRepo(db);
  const calendarRepo = createCalendarRepo(db);
  const projectsRepo = createProjectsRepo(db);
  const files = createFilesService({ db, storage });
  const authenticate = createAuthenticate({ usersRepo, secret: jwtSecret });

  const api = Router();
  api.use('/auth', createAuthRouter({ usersRepo, secret: jwtSecret, authenticate, loginLimit }));
  // Todo lo que sigue requiere sesión y contraseña ya cambiada
  api.use(authenticate, requirePasswordChanged);
  api.use('/users', createUsersRouter({ usersRepo }));
  api.use(createSettingsRouter({ db, clientsRepo }));
  api.use(createFilesRouter({ files }));
  api.use(createIdeasRouter({ db, ideasRepo, clientsRepo, activityRepo, files }));
  api.use(createCalendarRouter({ db, calendarRepo, files }));
  api.use(createProjectsRouter({ db, projectsRepo, activityRepo, files }));
  api.use(createHomeRouter({ homeRepo: createHomeRepo(db), storage }));

  const app = createApp({
    apiRouter: api,
    staticDir,
    corsOrigin,
    health: async () => {
      await db.query('SELECT 1');
      return { db: true };
    },
  });
  app.locals.files = files;
  return app;
}
