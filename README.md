# Uniform.ar — Plataforma interna

Panel de contenidos y proyectos de Uniform.ar (ideas, calendario de redes, proyectos), con usuarios y permisos.
Spec: `docs/superpowers/specs/2026-10-07-uniformar-panel-design.md` · Plan: `docs/superpowers/plans/2026-10-07-uniformar-panel.md`.

Dos piezas separadas: el backend (Express + Postgres) en Railway, y el frontend (React + Vite PWA) como sitio estático en `https://uniformar.techdi.com.ar`. La sesión viaja como token Bearer en el header `Authorization` (no hay cookies), y el backend habilita CORS para `FRONTEND_URL`.

## Local
```bash
cd backend && npm install && npx vitest run     # tests (Postgres en memoria con PGlite)
cp .env.example .env                              # completar DATABASE_URL, JWT_SECRET, ADMIN_INITIAL_PASSWORD
npm start                                         # http://localhost:3000
cd ../frontend && npm install && npm run dev      # http://localhost:5173 (proxy /api → :3000)
```

## Producción (Railway)
Variables: `DATABASE_URL` (referencia al Postgres de Railway), `NODE_ENV=production`, `JWT_SECRET` (≥ 32 caracteres),
`ADMIN_INITIAL_PASSWORD`, `FRONTEND_URL=https://uniformar.techdi.com.ar` (varios orígenes separados por coma), `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`.
Deploy del backend: `railway up` (queda en el dominio generado `https://<app>.up.railway.app`).

### Frontend (estático)
```bash
cd frontend && npm ci && VITE_API_URL=https://<app>.up.railway.app npm run build
```
Subir el contenido de `frontend/dist/` (zip) al hosting de `uniformar.techdi.com.ar`. Tiene que servir `index.html` para cualquier ruta (SPA).

Primer ingreso: `jdilernia99@gmail.com` con `ADMIN_INITIAL_PASSWORD`; pide cambiar la contraseña.

## Migrar datos del prototipo
1. Crear desde el panel los usuarios de Sofi, Santi y Bauti.
2. Exportar los datos del prototipo a `export.json` (ideas, proyectos con tareas, calendario).
3. `cd backend && DATABASE_URL=... node scripts/migrateFromPrototype.js --file export.json --map "Sofi=<email>,Santi=<email>,Bauti=<email>"`
   Es idempotente: correrlo de nuevo no duplica.
