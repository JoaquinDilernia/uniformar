# Uniform.ar — Plataforma interna

Panel de contenidos y proyectos de Uniform.ar (ideas, calendario de redes, proyectos), con usuarios y permisos.
Spec: `docs/superpowers/specs/2026-10-07-uniformar-panel-design.md` · Plan: `docs/superpowers/plans/2026-10-07-uniformar-panel.md`.

Un solo servicio en Railway: el backend (Express + Postgres) sirve `/api` y el build del frontend (React + Vite PWA).

## Local
```bash
cd backend && npm install && npx vitest run     # tests (Postgres en memoria con PGlite)
cp .env.example .env                              # completar DATABASE_URL, JWT_SECRET, ADMIN_INITIAL_PASSWORD
npm start                                         # http://localhost:3000
cd ../frontend && npm install && npm run dev      # http://localhost:5173 (proxy /api → :3000)
```

## Producción (Railway)
Variables: `DATABASE_URL` (referencia al Postgres de Railway), `NODE_ENV=production`, `JWT_SECRET` (≥ 32 caracteres),
`ADMIN_INITIAL_PASSWORD`, `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`.
Deploy: `railway up`. Dominio: `uniformar.techdi.com.ar` (CNAME al dominio de Railway).

Primer ingreso: `jdilernia99@gmail.com` con `ADMIN_INITIAL_PASSWORD`; pide cambiar la contraseña.

## Migrar datos del prototipo
1. Crear desde el panel los usuarios de Sofi, Santi y Bauti.
2. Exportar los datos del prototipo a `export.json` (ideas, proyectos con tareas, calendario).
3. `cd backend && DATABASE_URL=... node scripts/migrateFromPrototype.js --file export.json --map "Sofi=<email>,Santi=<email>,Bauti=<email>"`
   Es idempotente: correrlo de nuevo no duplica.
