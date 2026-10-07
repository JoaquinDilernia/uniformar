import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { errorHandler, notFound } from './lib/errors.js';

export function createApp({ apiRouter, staticDir, health } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway está detrás de un proxy: req.ip y cookies Secure
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', async (_req, res) => {
    if (!health) return res.json({ ok: true });
    try {
      res.json({ ok: true, ...(await health()) });
    } catch (err) {
      console.error('[health]', err);
      res.status(503).json({ ok: false, error: 'db no disponible' });
    }
  });
  if (apiRouter) app.use('/api', apiRouter);
  app.use('/api', (_req, _res, next) => next(notFound('Ruta no encontrada.')));
  app.use(errorHandler);
  if (staticDir) {
    const noCache = (res) => res.set('Cache-Control', 'no-cache');
    app.use(express.static(staticDir, {
      index: false,
      setHeaders: (res, file) => {
        if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(file)) noCache(res);
      },
    }));
    app.get(/^\/(?!api\/|health).*/, (_req, res) => {
      noCache(res);
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }
  return app;
}
