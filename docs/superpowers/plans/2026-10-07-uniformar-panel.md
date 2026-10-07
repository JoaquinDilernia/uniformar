# Uniform.ar — Panel de contenidos y proyectos · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plataforma interna de Uniform.ar (login + usuarios con permisos, Inicio, Ideas, Calendario de redes, Proyectos, Ajustes) en un solo servicio de Railway, mobile-first, que reemplaza el prototipo de Sofía y migra sus datos.

**Architecture:** Monorepo `backend/` + `frontend/`. Express 5 (ESM) con Postgres (SQL a mano, migraciones numeradas) sirve `/api` y el build estático del frontend (React 18 + Vite + HashRouter + PWA). Archivos en un bucket S3-compatible (Cloudflare R2) con driver local para dev/test. Mismo patrón que `DEV-PERSONAL/gineza-agent`.

**Tech Stack:** Node ≥20, Express 5, pg, zod 3, bcryptjs, jsonwebtoken, cookie-parser, express-rate-limit 7, multer 2, file-type 19, image-size 1, @aws-sdk/client-s3 + s3-request-presigner, node-cron · vitest 2 + @electric-sql/pglite + supertest · React 18, react-router-dom 6 (HashRouter), @tanstack/react-query 5, lucide-react, CSS Modules, vite-plugin-pwa, @fontsource-variable/inter + outfit, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-07-uniformar-panel-design.md`

## Global Constraints

- Todo texto visible al usuario en **español rioplatense** ("tenés", "probá", "subí"). Mensajes de error concretos, nunca "Error" a secas.
- Formato de error de la API, siempre: `{ "error": { "code": "...", "message": "texto en español", "fields"?: { campo: mensaje } } }`.
- **Toda escritura en el frontend termina en un toast** de éxito ("Guardado ✓" u otro) o de error con el `message` del backend. Nunca un fallo silencioso (requisito #1 del brief).
- El backend valida permisos en **cada** request; el frontend solo oculta.
- Secciones: `home`, `ideas`, `calendar`, `projects`, `ads`, `web`; niveles `none | view | edit`; flags `can_delete`, `manage_users`.
- Imágenes: el navegador las lleva a lado largo ≤ **2048 px**, WebP calidad **0,82** (fallback JPEG si el navegador no codifica WebP), bajando hasta **0,6**; máximo **2 MB** (2 097 152 bytes); original hasta **25 MB**. PDFs ≤ **10 MB** (10 485 760 bytes). **Videos no se suben.** Backend acepta solo `image/webp|jpeg|png` y `application/pdf` detectados por magic bytes; tope multer 12 MB.
- Medidas recomendadas: Post/carrusel IG **1080×1350 (4:5)**, Historia/Reel/TikTok **1080×1920 (9:16)**, cuadrado **1080×1080**, foto de producto 1080×1350.
- Zona horaria de negocio: Argentina (UTC−3 fijo, sin horario de verano). Semanas de **lunes a domingo**.
- Columnas `DATE` viajan como string `'YYYY-MM-DD'` (type parser 1082) — nunca como `Date`.
- Sesión: cookie `uf_session` httpOnly, SameSite=Lax, Secure en producción; JWT 30 días, se renueva si quedan < 15 días; `token_version` invalida sesiones.
- Superadmin inicial: `jdilernia99@gmail.com`, contraseña de `ADMIN_INITIAL_PASSWORD`, `must_change_password = true`.
- Acento de marca ciruela **`#775D66`**; tipografías Inter (UI) y Outfit (títulos); íconos lucide-react; áreas táctiles ≥ 44 px.
- Nunca `window.alert/confirm/prompt`: usar el `ConfirmDialog` propio.
- No usar `rowCount` (PGlite no lo expone igual): usar `RETURNING`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Fotos desde iPhone (Safari)**: Safari puede no codificar WebP en `canvas.toBlob` → debe caer a JPEG y subir igual; si no puede leer la imagen, toast claro. (Test en Task 17: `compressImage` con encoder que devuelve PNG/JPEG para webp.)
2. **Fechas que se corren un día**: `due_date`/`date` deben ida y vuelta como `'YYYY-MM-DD'` exacto, y la semana de Inicio debe calcularse en hora argentina (un domingo 22:00 ART sigue siendo domingo). (Tests en Task 2 y Task 11.)
3. **Sesión vencida a mitad de una edición larga**: el texto escrito no se pierde; al volver a entrar se recupera el borrador. (Test de `useDraft` en Task 14.)
4. **Textos largos con saltos de línea y emojis** (notas de Santi, "Qué queremos hacer"): se guardan sin recortar y se muestran completos con `white-space: pre-wrap`. (Test de ida y vuelta en Task 8.)
5. **Borrar algo vinculado**: borrar una idea vinculada a una pieza deja la pieza sin idea (no rompe el calendario); desactivar un usuario no borra sus tareas ni su historial y lo saca de las columnas de Inicio. (Tests en Task 9 y Task 11.)

---

## Mapa de archivos

```
uniformar/
├── package.json · railway.json · .gitignore · README.md
├── backend/
│   ├── package.json · vitest.config.js · .env.example
│   ├── scripts/migrateFromPrototype.js
│   ├── src/
│   │   ├── index.js                 arranque: env, db, migraciones, superadmin, cron, listen
│   │   ├── app.js                   express base: cookies, json, /health, /api, errores, estáticos
│   │   ├── buildApp.js              wiring de repos + routers (lo usan index.js y los tests)
│   │   ├── db/index.js · db/migrate.js · db/migrations/001_init.sql
│   │   ├── lib/errors.js            AppError + errorHandler
│   │   ├── lib/validate.js          parse(), mapa de errores zod en español, esquemas comunes
│   │   ├── lib/sql.js               buildInsert/buildUpdate/pick
│   │   ├── lib/ideaStatus.js        deriveIdeaStatus
│   │   ├── lib/dates.js             todayART, addDays, weekRange, artDayStartISO
│   │   ├── services/permissions.js  SECTIONS, TEMPLATES, hasLevel, requirePermission, requireFlag
│   │   ├── services/auth.js         hash/verify, sign/verify sesión, cookieOptions
│   │   ├── services/bootstrap.js    ensureSuperadmin
│   │   ├── services/activity.js     logActivity, diffFields
│   │   ├── services/storage.js      createLocalStorage, createS3Storage
│   │   ├── services/files.js        OWNER_TYPES, LIMITS, createFilesService
│   │   ├── middleware/authenticate.js
│   │   ├── repo/users.js · repo/clients.js · repo/ideas.js · repo/calendar.js · repo/projects.js
│   │   ├── repo/activity.js · repo/home.js
│   │   ├── routes/auth.js · users.js · settings.js · files.js · ideas.js · calendar.js · projects.js · home.js
│   │   └── migration/importPrototype.js
│   └── test/  helpers/testDb.js · helpers/testApp.js · helpers/fixtures.js · *.test.js
└── frontend/
    ├── package.json · vite.config.js · index.html · pwa-assets.config.js · test/setup.js
    ├── public/ logo-negro.png · logo-blanco.png · logo-ciruela.png (+ íconos PWA generados)
    └── src/
        ├── main.jsx · App.jsx
        ├── styles/tokens.css · styles/global.css
        ├── api/client.js · api/hooks.js           fetch + ApiError · hooks de react-query por recurso
        ├── state/toastBus.js · state/Toasts.jsx · state/auth.jsx
        ├── hooks/ useOptimisticMutation.js · useDraft.js · usePersistentState.js · useMediaQuery.js · useOnline.js
        ├── lib/ ideaStatus.js · groupIdeas.js · dates.js · embed.js · imageCompress.js · sizes.js · permissions.js · upload.js
        ├── components/ui/      Button · Chip · Field · Sheet · ConfirmDialog · Avatar · Progress · Collapsible
        │                       · EmptyState · StatusBadge · Segmented · Spinner  (+ .module.css)
        ├── components/shell/   AppShell · Sidebar · BottomNav · Fab · OfflineBanner · nav.js
        ├── components/media/   ImageUploader · Gallery · Lightbox · PdfList · PdfViewer · EmbedPreview · SizeHint
        └── pages/  Login · ChangePassword · Home · More · ComingSoon · Account · Settings
                    ideas/ (IdeasPage · IdeaRow · IdeaSheet · IdeaForm)
                    calendar/ (CalendarPage · MonthGrid · WeekList · DaySheet · ItemForm · PreviewMockup)
                    projects/ (ProjectsPage · ProjectDetail · TaskList · UpdatesFeed · ProjectForm · InlineText)
                    users/ (UsersPage · UserSheet · PermissionMatrix)
```

---

## BACKEND

### Task 1: Scaffold del repo, capa de DB y app base con errores

**Files:**
- Create: `package.json`, `railway.json`, `.gitignore`
- Create: `backend/package.json`, `backend/vitest.config.js`
- Create: `backend/src/db/index.js`, `backend/src/db/migrate.js`, `backend/src/db/migrations/000_noop.sql` (se borra en Task 2)
- Create: `backend/src/lib/errors.js`, `backend/src/lib/validate.js`, `backend/src/app.js`
- Create: `backend/test/helpers/testDb.js`
- Test: `backend/test/app.test.js`

**Interfaces:**
- Produces: `createPgDb(url) → db` y `createTestDb() → db` con interfaz `{ query(text, params) → {rows}, exec(sql), tx(fn(q)) , close() }` donde `q = { query }`.
- Produces: `migrate(db) → string[]`.
- Produces: `AppError(status, code, message, fields?)`, `badRequest`, `unauthenticated`, `forbidden`, `notFound`, `conflict`, `errorHandler`.
- Produces: `parse(schema, data)`, `dateStr`, `optionalUrl`, `requiredUrl`, `nullableText(max)`, `uuid` (zod).
- Produces: `createApp({ apiRouter, staticDir, health }) → express app`.

- [ ] **Step 1: Crear archivos raíz**

`package.json`:
```json
{
  "name": "uniformar",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "npm --prefix backend ci --omit=dev && npm --prefix frontend ci && npm --prefix frontend run build",
    "start": "npm --prefix backend start",
    "test": "npm --prefix backend test && npm --prefix frontend test"
  }
}
```

`railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "npm run build" },
  "deploy": { "startCommand": "npm start", "healthcheckPath": "/health", "restartPolicyType": "ON_FAILURE" }
}
```

`.gitignore`:
```
node_modules/
dist/
.env
backend/.uploads/
coverage/
*.timestamp-*.mjs
.superpowers/
```

`backend/package.json`:
```json
{
  "name": "uniformar-backend",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": { "start": "node src/index.js", "test": "vitest run" },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/s3-request-presigner": "^3.700.0",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.7",
    "dotenv": "^16.4.5",
    "express": "^5.1.0",
    "express-rate-limit": "^7.4.0",
    "file-type": "^19.6.0",
    "image-size": "^1.1.1",
    "jsonwebtoken": "^9.0.2",
    "multer": "^2.0.0",
    "node-cron": "^3.0.3",
    "pg": "^8.13.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.2.12",
    "supertest": "^7.0.0",
    "vitest": "^2.1.0"
  }
}
```

`backend/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

// PGlite (Postgres en WASM) tarda en arrancar cuando corren muchos archivos en paralelo
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
```

Run: `cd backend && npm install`

- [ ] **Step 2: Capa de DB**

`backend/src/db/index.js`:
```js
import pg from 'pg';

// DATE (oid 1082) como 'YYYY-MM-DD': si no, pg lo convierte a Date local y corre un día
pg.types.setTypeParser(1082, (v) => v);

// Interfaz común { query, exec, tx, close } — la misma que implementa el helper de tests con PGlite.
export function createPgDb(connectionString) {
  const ssl = /proxy\.rlwy\.net|sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({ connectionString, max: 5, ssl });
  return {
    query: (text, params) => pool.query(text, params),
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (t, p) => client.query(t, p) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
```

`backend/src/db/migrate.js`:
```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// Aplica en orden los .sql de migrations/ que todavía no estén en schema_migrations.
export async function migrate(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const { rows } = await db.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await fs.readFile(path.join(DIR, f), 'utf8');
    await db.exec(`BEGIN;\n${sql}\nINSERT INTO schema_migrations (name) VALUES ('${f}');\nCOMMIT;`);
    applied.push(f);
  }
  return applied;
}
```

`backend/src/db/migrations/000_noop.sql`:
```sql
SELECT 1;
```

`backend/test/helpers/testDb.js`:
```js
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../../src/db/migrate.js';

// Postgres real (WASM) en memoria, con la misma interfaz que createPgDb.
export async function createTestDb() {
  const pg = new PGlite({ parsers: { 1082: (v) => v } });
  const db = {
    query: (text, params) => pg.query(text, params),
    exec: (sql) => pg.exec(sql),
    tx: (fn) => pg.transaction((t) => fn({ query: (q, p) => t.query(q, p) })),
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}
```

- [ ] **Step 3: Escribir el test que falla**

`backend/test/app.test.js`:
```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { AppError, forbidden } from '../src/lib/errors.js';
import { parse, optionalUrl, dateStr } from '../src/lib/validate.js';

function appWith(routes) {
  const api = Router();
  routes(api);
  return createApp({ apiRouter: api });
}

describe('app base', () => {
  it('/health responde ok', async () => {
    const res = await request(createApp({ health: async () => ({ db: true }) })).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it('ruta /api inexistente → 404 con formato de error', async () => {
    const res = await request(appWith(() => {})).get('/api/nada');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('AppError lanzado en handler async → status y code', async () => {
    const app = appWith((r) => r.get('/x', async () => { throw forbidden('No tenés permiso para editar Proyectos'); }));
    const res = await request(app).get('/api/x');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'No tenés permiso para editar Proyectos' } });
  });

  it('ZodError → 400 VALIDATION con fields en español', async () => {
    const schema = z.object({ text: z.string().min(1, 'Escribí la idea'), link: optionalUrl, fecha: dateStr.nullish() });
    const app = appWith((r) => r.post('/x', (req, res) => res.json(parse(schema, req.body))));
    const bad = await request(app).post('/api/x').send({ text: '', link: 'no-es-link', fecha: '07/10/2026' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION');
    expect(bad.body.error.fields).toEqual({ text: 'Escribí la idea', link: 'Link inválido', fecha: 'Fecha inválida' });
    const ok = await request(app).post('/api/x').send({ text: 'hola', link: '  ' });
    expect(ok.body).toEqual({ text: 'hola', link: null });
  });

  it('JSON mal formado → 400', async () => {
    const app = appWith((r) => r.post('/x', (req, res) => res.json(req.body)));
    const res = await request(app).post('/api/x').set('Content-Type', 'application/json').send('{mal');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('error desconocido → 500 INTERNAL sin filtrar detalles', async () => {
    const app = appWith((r) => r.get('/x', async () => { throw new Error('secreto interno'); }));
    const res = await request(app).get('/api/x');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.message).not.toContain('secreto');
  });

  it('AppError es instancia de Error', () => {
    expect(new AppError(400, 'X', 'y')).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 4: Correr y ver que falla**

Run: `cd backend && npx vitest run test/app.test.js`
Expected: FAIL — `Cannot find module '../src/app.js'`.

- [ ] **Step 5: Implementar errores, validación y app**

`backend/src/lib/errors.js`:
```js
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new AppError(400, 'VALIDATION', message, fields);
export const unauthenticated = (message = 'Tenés que iniciar sesión.') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'No tenés permiso para hacer esto.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'No se encontró lo que buscabas.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message) => new AppError(409, 'CONFLICT', message);

function send(res, status, code, message, fields) {
  res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return send(res, 400, 'VALIDATION', `Revisá los datos: ${Object.values(fields)[0]}`, fields);
  }
  if (err instanceof AppError) return send(res, err.status, err.code, err.message, err.fields);
  if (err?.code === 'LIMIT_FILE_SIZE') return send(res, 413, 'FILE_TOO_LARGE', 'El archivo es demasiado pesado.');
  if (err?.type === 'entity.parse.failed') return send(res, 400, 'VALIDATION', 'El formato de los datos no es válido.');
  if (err?.type === 'entity.too.large') return send(res, 413, 'TOO_LARGE', 'Los datos enviados son demasiado grandes.');
  if (err?.code === '22P02') return send(res, 404, 'NOT_FOUND', 'No se encontró lo que buscabas.'); // uuid mal formado
  console.error('[error]', err);
  return send(res, 500, 'INTERNAL', 'Error interno. Probá de nuevo en un momento.');
}
```

`backend/src/lib/validate.js`:
```js
import { z } from 'zod';

// Mensajes de zod en español (los mensajes explícitos de cada esquema tienen prioridad)
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case 'invalid_type':
      return { message: issue.received === 'undefined' || issue.received === 'null' ? 'Campo obligatorio' : 'Valor inválido' };
    case 'too_small':
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'Campo obligatorio' : `Mínimo ${issue.minimum} caracteres` };
      return { message: `Mínimo ${issue.minimum}` };
    case 'too_big':
      return { message: issue.type === 'string' ? `Máximo ${issue.maximum} caracteres` : `Máximo ${issue.maximum}` };
    case 'invalid_enum_value':
      return { message: 'Opción inválida' };
    case 'invalid_string':
      if (issue.validation === 'email') return { message: 'Email inválido' };
      if (issue.validation === 'url') return { message: 'Link inválido' };
      if (issue.validation === 'uuid') return { message: 'Id inválido' };
      return { message: 'Formato inválido' };
    default:
      return { message: ctx.defaultError };
  }
});

export function parse(schema, data) {
  return schema.parse(data ?? {});
}

const blankToNull = (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v);
const isHttp = (u) => /^https?:\/\//i.test(u);

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
export const uuid = z.string().uuid('Id inválido');
export const optionalUrl = z.preprocess(
  blankToNull,
  z.string().url('Link inválido').max(2000).refine(isHttp, 'El link tiene que empezar con http:// o https://').nullish(),
);
export const requiredUrl = z.preprocess(
  blankToNull,
  z.string({ required_error: 'Pegá el link del resultado' }).url('Pegá un link válido').max(2000)
    .refine(isHttp, 'El link tiene que empezar con http:// o https://'),
);
// Textos largos: se conservan saltos de línea y emojis; vacío → null
export const nullableText = (max) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().max(max).nullish());
```

`backend/src/app.js`:
```js
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
      res.status(503).json({ ok: false, error: err.message });
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
```

- [ ] **Step 6: Correr y ver que pasa**

Run: `cd backend && npx vitest run test/app.test.js`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json railway.json .gitignore backend
git commit -m "feat: scaffold backend — db, migraciones, errores y app base

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Esquema de base de datos

**Files:**
- Delete: `backend/src/db/migrations/000_noop.sql`
- Create: `backend/src/db/migrations/001_init.sql`
- Test: `backend/test/schema.test.js`

**Interfaces:**
- Produces: tablas `users, user_permissions, clients, content_rules, ideas, calendar_items, projects, project_tasks, task_assignees, project_updates, files, activity_log, storage_deletions_pending` (columnas exactas abajo; todas las tareas siguientes usan estos nombres).

- [ ] **Step 1: Test que falla**

`backend/test/schema.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from './helpers/testDb.js';

let db;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.close());

async function user(email = 'a@b.com') {
  const { rows } = await db.query(`INSERT INTO users (email, name, password_hash) VALUES ($1, 'A', 'x') RETURNING *`, [email]);
  return rows[0];
}

describe('schema', () => {
  it('email único sin importar mayúsculas', async () => {
    await user('Sofi@Uniform.ar');
    await expect(user('sofi@uniform.ar')).rejects.toThrow();
  });

  it('DATE vuelve como string YYYY-MM-DD exacto', async () => {
    const u = await user('fecha@b.com');
    const { rows } = await db.query(
      `INSERT INTO ideas (kind, format, category, text, due_date, created_by) VALUES ('must','photo','producto','x','2026-10-31',$1) RETURNING due_date`,
      [u.id],
    );
    expect(rows[0].due_date).toBe('2026-10-31');
  });

  it('CHECK rechaza valores inválidos', async () => {
    await expect(db.query(`INSERT INTO ideas (kind, format, category, text) VALUES ('otra','video','domingo','x')`)).rejects.toThrow();
    await expect(db.query(`INSERT INTO calendar_items (date, status) VALUES ('2026-10-07','hecho')`)).rejects.toThrow();
  });

  it('grilla fija sembrada: mar, mié, vie, dom 20:00', async () => {
    const { rows } = await db.query('SELECT weekday, time, channels FROM content_rules ORDER BY sort');
    expect(rows.map((r) => r.weekday)).toEqual([2, 3, 5, 0]);
    expect(rows[3].time).toBe('20:00');
    expect(rows[2].channels).toEqual(['ig_reel', 'tiktok']);
  });

  it('borrar idea deja la pieza del calendario sin idea', async () => {
    const { rows: [idea] } = await db.query(`INSERT INTO ideas (kind, format, category, text) VALUES ('idea','video','domingo','x') RETURNING id`);
    const { rows: [item] } = await db.query(`INSERT INTO calendar_items (date, idea_id) VALUES ('2026-10-12', $1) RETURNING id`, [idea.id]);
    await db.query('DELETE FROM ideas WHERE id = $1', [idea.id]);
    const { rows } = await db.query('SELECT idea_id FROM calendar_items WHERE id = $1', [item.id]);
    expect(rows[0].idea_id).toBeNull();
  });

  it('arrays de texto ida y vuelta', async () => {
    const { rows } = await db.query(`INSERT INTO calendar_items (date, channels) VALUES ('2026-10-13', $1) RETURNING channels`, [['ig_post', 'tiktok']]);
    expect(rows[0].channels).toEqual(['ig_post', 'tiktok']);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd backend && npx vitest run test/schema.test.js`
Expected: FAIL — `relation "users" does not exist`.

- [ ] **Step 3: Escribir la migración**

Borrar `backend/src/db/migrations/000_noop.sql`. Crear `backend/src/db/migrations/001_init.sql`:
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  avatar_color text NOT NULL DEFAULT '#775D66',
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  can_delete boolean NOT NULL DEFAULT false,
  manage_users boolean NOT NULL DEFAULT false,
  token_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

CREATE TABLE user_permissions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('home','ideas','calendar','projects','ads','web')),
  level text NOT NULL CHECK (level IN ('none','view','edit')),
  PRIMARY KEY (user_id, section)
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clients_name_lower ON clients (lower(name));

CREATE TABLE content_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  time text CHECK (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  theme text NOT NULL,
  format text NOT NULL DEFAULT '',
  channels text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0
);
INSERT INTO content_rules (weekday, time, theme, format, channels, sort) VALUES
  (2, NULL, 'Foco por rubro', 'Carrusel / post', ARRAY['ig_post'], 1),
  (3, NULL, 'Cotización', '1–2 historias', ARRAY['ig_story'], 2),
  (5, NULL, 'Cliente real', 'Reel', ARRAY['ig_reel','tiktok'], 3),
  (0, '20:00', 'Humor / trend', 'Reel', ARRAY['ig_reel','tiktok'], 4);

CREATE TABLE ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('idea','must')),
  format text NOT NULL CHECK (format IN ('video','photo')),
  category text NOT NULL CHECK (category IN ('domingo','viernes','producto','otra')),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  text text NOT NULL,
  reference_url text,
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','yes','no')),
  done_at timestamptz,
  result_url text,
  due_date date,
  note_santi text,
  note_santi_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note_sofi text,
  note_sofi_by uuid REFERENCES users(id) ON DELETE SET NULL,
  legacy_id text UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ideas_created_at ON ideas (created_at DESC);

CREATE TABLE calendar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  title text NOT NULL DEFAULT '',
  channels text[] NOT NULL DEFAULT '{}',
  idea_id uuid REFERENCES ideas(id) ON DELETE SET NULL,
  copy text,
  piece_url text,
  refs text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','published')),
  sort integer NOT NULL DEFAULT 0,
  legacy_id text UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendar_items_date ON calendar_items (date);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','proposal','upcoming','done')),
  start_date date,
  end_date date,
  goal_text text NOT NULL DEFAULT '',
  doing_text text NOT NULL DEFAULT '',
  how_text text NOT NULL DEFAULT '',
  legacy_id text UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text text NOT NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  sort integer NOT NULL DEFAULT 0,
  legacy_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_tasks_project ON project_tasks (project_id, sort);

CREATE TABLE task_assignees (
  task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE project_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('idea_ref','idea_result','calendar_preview','project_photo','project_pdf')),
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image','pdf')),
  storage_key text NOT NULL UNIQUE,
  mime text NOT NULL,
  bytes integer NOT NULL,
  width integer,
  height integer,
  original_name text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_owner ON files (owner_type, owner_id, sort);

CREATE TABLE activity_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_entity ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX activity_recent ON activity_log (created_at DESC);

CREATE TABLE storage_deletions_pending (
  storage_key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS (app + schema). Si el test de DATE falla con un objeto `Date`, la versión de PGlite no soporta `parsers` en el constructor: pasar `{ parsers }` como tercer argumento en `query` dentro de `testDb.js` (`pg.query(text, params, { parsers: { 1082: (v) => v } })`) y lo mismo en `t.query`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db backend/test/schema.test.js
git commit -m "feat: esquema inicial — usuarios, ideas, calendario, proyectos, archivos, historial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Permisos, servicio de auth, repo de usuarios y superadmin

**Files:**
- Create: `backend/src/services/permissions.js`, `backend/src/services/auth.js`, `backend/src/services/bootstrap.js`, `backend/src/repo/users.js`
- Test: `backend/test/users.repo.test.js`, `backend/test/permissions.test.js`

**Interfaces:**
- Produces (`permissions.js`): `SECTIONS: string[]`, `LEVELS`, `SECTION_LABELS: Record<section,string>`, `TEMPLATES: { admin|equipo|lectura: { permissions, can_delete, manage_users } }`, `hasLevel(user, section, level) → bool`, `requirePermission(section, level)` y `requireFlag('can_delete'|'manage_users')` (middlewares que lanzan `forbidden`).
- Produces (`auth.js`): `COOKIE = 'uf_session'`, `RENEW_BELOW_MS`, `hashPassword(pw) → Promise<string>`, `verifyPassword(pw, hash) → Promise<bool>`, `signSession(user, secret) → string`, `verifySession(token, secret) → payload|null` (`{ sub, tv, exp }`), `cookieOptions(secure) → object`, `generateTempPassword() → string`.
- Produces (`repo/users.js`): `toPublicUser(u)`, `createUsersRepo(db)` → `{ findByEmail(email), findById(id), list(), directory(), create({ email, name, passwordHash, avatarColor?, mustChangePassword?, canDelete?, manageUsers?, permissions? }), update(id, patch), setPermissions(id, permissions), setPassword(id, hash, { mustChange }), touchLogin(id), countActiveManagers(excludeId) }`. Usuarios devueltos incluyen `permissions: Record<section, level>` con todas las secciones (`'none'` por defecto).
- Produces (`bootstrap.js`): `ensureSuperadmin({ usersRepo, email, password, name? })`.

- [ ] **Step 1: Tests que fallan**

`backend/test/permissions.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { hasLevel, requirePermission, requireFlag, TEMPLATES, SECTIONS } from '../src/services/permissions.js';

const user = (permissions, flags = {}) => ({ permissions, ...flags });

describe('permisos', () => {
  it('hasLevel respeta el orden none < view < edit', () => {
    const u = user({ ideas: 'view', projects: 'edit' });
    expect(hasLevel(u, 'ideas', 'view')).toBe(true);
    expect(hasLevel(u, 'ideas', 'edit')).toBe(false);
    expect(hasLevel(u, 'projects', 'view')).toBe(true);
    expect(hasLevel(u, 'calendar', 'view')).toBe(false);
  });

  it('requirePermission lanza 403 con el nombre de la sección', () => {
    const mw = requirePermission('projects', 'edit');
    expect(() => mw({ user: user({ projects: 'view' }) }, {}, () => {})).toThrow('No tenés permiso para editar Proyectos');
    let called = false;
    mw({ user: user({ projects: 'edit' }) }, {}, () => { called = true; });
    expect(called).toBe(true);
  });

  it('requireFlag', () => {
    expect(() => requireFlag('can_delete')({ user: user({}) }, {}, () => {})).toThrow('No tenés permiso para borrar');
  });

  it('plantillas cubren todas las secciones', () => {
    for (const t of Object.values(TEMPLATES)) expect(Object.keys(t.permissions).sort()).toEqual([...SECTIONS].sort());
    expect(TEMPLATES.equipo.can_delete).toBe(false);
    expect(TEMPLATES.admin.manage_users).toBe(true);
  });
});
```

`backend/test/users.repo.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from './helpers/testDb.js';
import { createUsersRepo, toPublicUser } from '../src/repo/users.js';
import { ensureSuperadmin } from '../src/services/bootstrap.js';
import { verifyPassword, signSession, verifySession, generateTempPassword } from '../src/services/auth.js';
import { TEMPLATES } from '../src/services/permissions.js';

let db, repo;
beforeAll(async () => { db = await createTestDb(); repo = createUsersRepo(db); });
afterAll(() => db.close());

describe('repo de usuarios', () => {
  it('crea con permisos y completa secciones faltantes con none', async () => {
    const u = await repo.create({ email: 'santi@x.com', name: 'Santi', passwordHash: 'h', permissions: { ideas: 'edit' } });
    expect(u.permissions).toEqual({ home: 'none', ideas: 'edit', calendar: 'none', projects: 'none', ads: 'none', web: 'none' });
    expect(u.must_change_password).toBe(true);
    expect((await repo.findByEmail('SANTI@x.com')).id).toBe(u.id);
  });

  it('toPublicUser no expone el hash', async () => {
    const u = await repo.findByEmail('santi@x.com');
    expect(toPublicUser(u).password_hash).toBeUndefined();
    expect(toPublicUser(u).token_version).toBeUndefined();
  });

  it('setPassword incrementa token_version', async () => {
    const before = await repo.findByEmail('santi@x.com');
    await repo.setPassword(before.id, 'h2', { mustChange: false });
    const after = await repo.findById(before.id);
    expect(after.token_version).toBe(before.token_version + 1);
    expect(after.must_change_password).toBe(false);
  });

  it('desactivar incrementa token_version', async () => {
    const u = await repo.create({ email: 'baja@x.com', name: 'Baja', passwordHash: 'h' });
    const after = await repo.update(u.id, { is_active: false });
    expect(after.is_active).toBe(false);
    expect(after.token_version).toBe(u.token_version + 1);
  });

  it('directory solo activos, ordenado por nombre', async () => {
    const dir = await repo.directory();
    expect(dir.map((d) => d.name)).toEqual(['Santi']);
    expect(Object.keys(dir[0]).sort()).toEqual(['avatar_color', 'id', 'name']);
  });

  it('ensureSuperadmin crea una sola vez, con plantilla admin y cambio forzado', async () => {
    const a = await ensureSuperadmin({ usersRepo: repo, email: 'jdilernia99@gmail.com', password: 'generica123' });
    const b = await ensureSuperadmin({ usersRepo: repo, email: 'jdilernia99@gmail.com', password: 'otra' });
    expect(b.id).toBe(a.id);
    expect(a.manage_users).toBe(true);
    expect(a.can_delete).toBe(true);
    expect(a.must_change_password).toBe(true);
    expect(a.permissions).toEqual(TEMPLATES.admin.permissions);
    expect(await verifyPassword('generica123', (await repo.findById(a.id)).password_hash)).toBe(true);
    expect(await repo.countActiveManagers('00000000-0000-0000-0000-000000000000')).toBe(1);
    expect(await repo.countActiveManagers(a.id)).toBe(0);
  });

  it('sesiones firmadas y verificadas', () => {
    const t = signSession({ id: 'u1', token_version: 3 }, 's');
    expect(verifySession(t, 's')).toMatchObject({ sub: 'u1', tv: 3 });
    expect(verifySession(t, 'otra')).toBeNull();
    expect(verifySession('basura', 's')).toBeNull();
  });

  it('contraseña temporal legible de 10 caracteres', () => {
    const p = generateTempPassword();
    expect(p).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{10}$/);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/permissions.test.js test/users.repo.test.js`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

`backend/src/services/permissions.js`:
```js
import { forbidden } from '../lib/errors.js';

export const SECTIONS = ['home', 'ideas', 'calendar', 'projects', 'ads', 'web'];
export const LEVELS = ['none', 'view', 'edit'];
const RANK = { none: 0, view: 1, edit: 2 };

export const SECTION_LABELS = {
  home: 'Inicio', ideas: 'Ideas', calendar: 'Calendario', projects: 'Proyectos', ads: 'Agente de pauta', web: 'Admin web',
};

const all = (level) => Object.fromEntries(SECTIONS.map((s) => [s, level]));

export const TEMPLATES = {
  admin: { permissions: all('edit'), can_delete: true, manage_users: true },
  equipo: {
    permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' },
    can_delete: false,
    manage_users: false,
  },
  lectura: { permissions: all('view'), can_delete: false, manage_users: false },
};

export function hasLevel(user, section, level) {
  return RANK[user?.permissions?.[section] ?? 'none'] >= RANK[level];
}

export const requirePermission = (section, level) => (req, _res, next) => {
  if (!hasLevel(req.user, section, level)) {
    throw forbidden(level === 'edit'
      ? `No tenés permiso para editar ${SECTION_LABELS[section]}`
      : `No tenés acceso a ${SECTION_LABELS[section]}`);
  }
  next();
};

export const requireFlag = (flag) => (req, _res, next) => {
  if (!req.user?.[flag]) {
    throw forbidden(flag === 'can_delete' ? 'No tenés permiso para borrar' : 'No tenés permiso para gestionar usuarios');
  }
  next();
};
```

`backend/src/services/auth.js`:
```js
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const COOKIE = 'uf_session';
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_MS = 30 * DAY;
export const RENEW_BELOW_MS = 15 * DAY;
const ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (pw) => bcrypt.hash(pw, ROUNDS);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function signSession(user, secret) {
  return jwt.sign({ sub: user.id, tv: user.token_version }, secret, { expiresIn: Math.floor(SESSION_MS / 1000) });
}

export function verifySession(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

export function cookieOptions(secure) {
  return { httpOnly: true, secure, sameSite: 'lax', maxAge: SESSION_MS, path: '/' };
}

// Sin caracteres ambiguos (0/O, 1/l/I) para dictarla por WhatsApp
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateTempPassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
```

`backend/src/repo/users.js`:
```js
import { SECTIONS } from '../services/permissions.js';

const PUBLIC = ['id', 'email', 'name', 'avatar_color', 'is_active', 'must_change_password', 'can_delete', 'manage_users', 'created_at', 'last_login_at', 'permissions'];
export const toPublicUser = (u) => (u ? Object.fromEntries(PUBLIC.map((k) => [k, u[k]])) : null);

const UPDATABLE = ['name', 'email', 'avatar_color', 'is_active', 'can_delete', 'manage_users'];

export function createUsersRepo(db) {
  async function hydrate(rows) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const { rows: perms } = await db.query('SELECT user_id, section, level FROM user_permissions WHERE user_id = ANY($1)', [ids]);
    const map = new Map(ids.map((id) => [id, Object.fromEntries(SECTIONS.map((s) => [s, 'none']))]));
    for (const p of perms) map.get(p.user_id)[p.section] = p.level;
    return rows.map((r) => ({ ...r, permissions: map.get(r.id) }));
  }

  async function one(sql, params) {
    const { rows } = await db.query(sql, params);
    return rows[0] ? (await hydrate(rows))[0] : null;
  }

  async function writePermissions(q, userId, permissions) {
    for (const [section, level] of Object.entries(permissions)) {
      await q.query(
        `INSERT INTO user_permissions (user_id, section, level) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, section) DO UPDATE SET level = EXCLUDED.level`,
        [userId, section, level],
      );
    }
  }

  const findById = (id) => one('SELECT * FROM users WHERE id = $1', [id]);
  const findByEmail = (email) => one('SELECT * FROM users WHERE lower(email) = lower($1)', [email.trim()]);

  async function list() {
    const { rows } = await db.query('SELECT * FROM users ORDER BY is_active DESC, lower(name)');
    return hydrate(rows);
  }

  async function directory() {
    const { rows } = await db.query('SELECT id, name, avatar_color FROM users WHERE is_active ORDER BY lower(name)');
    return rows;
  }

  async function create({ email, name, passwordHash, avatarColor, mustChangePassword = true, canDelete = false, manageUsers = false, permissions = {} }) {
    const id = await db.tx(async (q) => {
      const { rows } = await q.query(
        `INSERT INTO users (email, name, password_hash, avatar_color, must_change_password, can_delete, manage_users)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [email.trim(), name.trim(), passwordHash, avatarColor || '#775D66', mustChangePassword, canDelete, manageUsers],
      );
      await writePermissions(q, rows[0].id, permissions);
      return rows[0].id;
    });
    return findById(id);
  }

  async function update(id, patch) {
    const keys = UPDATABLE.filter((k) => patch[k] !== undefined);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    if (patch.is_active === false) sets.push('token_version = token_version + 1');
    if (sets.length) await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, [id, ...keys.map((k) => patch[k])]);
    return findById(id);
  }

  async function setPermissions(id, permissions) {
    await db.tx((q) => writePermissions(q, id, permissions));
    return findById(id);
  }

  async function setPassword(id, hash, { mustChange }) {
    await db.query(
      'UPDATE users SET password_hash = $2, must_change_password = $3, token_version = token_version + 1 WHERE id = $1',
      [id, hash, mustChange],
    );
  }

  async function touchLogin(id) {
    await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
  }

  async function countActiveManagers(excludeId) {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM users WHERE is_active AND manage_users AND id <> $1', [excludeId]);
    return rows[0].n;
  }

  return { findById, findByEmail, list, directory, create, update, setPermissions, setPassword, touchLogin, countActiveManagers };
}
```

`backend/src/services/bootstrap.js`:
```js
import { hashPassword } from './auth.js';
import { TEMPLATES } from './permissions.js';

// Crea el superadmin si no existe. Nunca pisa una contraseña existente.
export async function ensureSuperadmin({ usersRepo, email, password, name = 'Joaquín' }) {
  if (!email || !password) return null;
  const existing = await usersRepo.findByEmail(email);
  if (existing) return existing;
  const t = TEMPLATES.admin;
  return usersRepo.create({
    email, name, passwordHash: await hashPassword(password), mustChangePassword: true,
    canDelete: t.can_delete, manageUsers: t.manage_users, permissions: t.permissions,
  });
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services backend/src/repo backend/test
git commit -m "feat: permisos por sección, servicio de auth, repo de usuarios y superadmin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Login, sesión por cookie y wiring de la app (`buildApp`)

**Files:**
- Create: `backend/src/middleware/authenticate.js`, `backend/src/routes/auth.js`, `backend/src/buildApp.js`
- Create: `backend/test/helpers/testApp.js`
- Test: `backend/test/auth.test.js`

**Interfaces:**
- Consumes: `createUsersRepo`, `toPublicUser`, `auth.js`, `TEMPLATES`, `createApp`, errores.
- Produces: `createAuthenticate({ usersRepo, secret, secureCookies })` (middleware que setea `req.user` = usuario hidratado completo), `requirePasswordChanged` (middleware: 403 `MUST_CHANGE_PASSWORD`).
- Produces: `buildApp({ db, jwtSecret, storage, secureCookies = false, staticDir, loginLimit = 10 }) → express app`. **Cada task de backend siguiente agrega su router acá**, después de la línea `api.use(authenticate, requirePasswordChanged);`.
- Produces endpoints: `POST /api/auth/login {email,password} → { user }`, `POST /api/auth/logout`, `GET /api/auth/me → { user }`, `PATCH /api/auth/me {name?, avatar_color?} → { user }`, `POST /api/auth/change-password {currentPassword,newPassword} → { user }`.
- Produces (test helper): `createTestContext() → { db, app, storage, usersRepo, createUser(opts), agentFor(email, password?), asUser(opts) → { user, agent }, close() }`. `createUser({ email, name='Test', password='password123', template='admin', mustChange=false, permissions?, flags? })`.

- [ ] **Step 1: Helper de tests**

`backend/test/helpers/testApp.js`:
```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createTestDb } from './testDb.js';
import { buildApp } from '../../src/buildApp.js';
import { createUsersRepo } from '../../src/repo/users.js';
import { hashPassword } from '../../src/services/auth.js';
import { TEMPLATES } from '../../src/services/permissions.js';
import { createLocalStorage } from '../../src/services/storage.js';

let seq = 0;

export async function createTestContext({ loginLimit = 1000 } = {}) {
  const db = await createTestDb();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uf-files-'));
  const storage = createLocalStorage({ dir });
  const app = buildApp({ db, jwtSecret: 'test-secret', storage, secureCookies: false, loginLimit });
  const usersRepo = createUsersRepo(db);

  async function createUser({ email, name = 'Test', password = 'password123', template = 'admin', mustChange = false, permissions, flags } = {}) {
    const t = TEMPLATES[template];
    return usersRepo.create({
      email: email ?? `user${++seq}@test.com`,
      name,
      passwordHash: await hashPassword(password),
      mustChangePassword: mustChange,
      canDelete: flags?.can_delete ?? t.can_delete,
      manageUsers: flags?.manage_users ?? t.manage_users,
      permissions: { ...t.permissions, ...permissions },
    });
  }

  async function agentFor(email, password = 'password123') {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password });
    if (res.status !== 200) throw new Error(`login falló: ${res.status} ${JSON.stringify(res.body)}`);
    return agent;
  }

  async function asUser(opts = {}) {
    const user = await createUser(opts);
    return { user, agent: await agentFor(user.email, opts.password) };
  }

  return { db, app, storage, dir, usersRepo, createUser, agentFor, asUser, close: () => db.close() };
}
```

> `createLocalStorage` se implementa en Task 7. Para que este helper cargue ya, crear ahora `backend/src/services/storage.js` con un stub mínimo que Task 7 reemplaza:
> ```js
> export function createLocalStorage({ dir }) {
>   return { dir };
> }
> ```

- [ ] **Step 2: Test que falla**

`backend/test/auth.test.js`:
```js
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
```

- [ ] **Step 3: Correr y ver que falla**

Run: `cd backend && npx vitest run test/auth.test.js`
Expected: FAIL — `Cannot find module '../../src/buildApp.js'`.

- [ ] **Step 4: Implementar**

`backend/src/middleware/authenticate.js`:
```js
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
```

`backend/src/routes/auth.js`:
```js
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
```

`backend/src/buildApp.js`:
```js
import { Router } from 'express';
import { createApp } from './app.js';
import { createUsersRepo } from './repo/users.js';
import { createAuthenticate, requirePasswordChanged } from './middleware/authenticate.js';
import { createAuthRouter } from './routes/auth.js';

export function buildApp({ db, jwtSecret, storage, secureCookies = false, staticDir, loginLimit = 10 }) {
  if (!jwtSecret) throw new Error('Falta jwtSecret');
  const usersRepo = createUsersRepo(db);
  const authenticate = createAuthenticate({ usersRepo, secret: jwtSecret, secureCookies });

  const api = Router();
  api.use('/auth', createAuthRouter({ usersRepo, secret: jwtSecret, secureCookies, authenticate, loginLimit }));
  // Todo lo que sigue requiere sesión y contraseña ya cambiada
  api.use(authenticate, requirePasswordChanged);
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
```

> `storage` todavía no se usa: queda en la firma para Task 7.

- [ ] **Step 5: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat: login con cookie httpOnly, sesión deslizante, cambio de contraseña obligatorio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Gestión de usuarios

**Files:**
- Create: `backend/src/routes/users.js`
- Modify: `backend/src/buildApp.js` (montar router)
- Test: `backend/test/users.routes.test.js`

**Interfaces:**
- Consumes: `usersRepo`, `TEMPLATES`, `SECTIONS`, `LEVELS`, `requireFlag`, `hashPassword`, `generateTempPassword`, `toPublicUser`, `colorSchema` (de `routes/auth.js`).
- Produces endpoints:
  - `GET /api/users/directory → { users: [{ id, name, avatar_color }] }` (cualquier logueado)
  - `GET /api/users → { users: PublicUser[] }` (manage_users)
  - `POST /api/users { name, email, password, template: 'admin'|'equipo'|'lectura', avatar_color? } → 201 { user }`
  - `PATCH /api/users/:id { name?, email?, avatar_color?, is_active?, can_delete?, manage_users? } → { user }`
  - `PUT /api/users/:id/permissions { [section]: level } → { user }`
  - `POST /api/users/:id/reset-password → { user, temporaryPassword }`

- [ ] **Step 1: Test que falla**

`backend/test/users.routes.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';

let ctx, admin, adminAgent;
beforeAll(async () => {
  ctx = await createTestContext();
  ({ user: admin, agent: adminAgent } = await ctx.asUser({ email: 'joaco@techdi.com.ar', name: 'Joaco' }));
});
afterAll(() => ctx.close());

describe('usuarios', () => {
  it('admin crea usuario con plantilla equipo y contraseña inicial obligatoria de cambiar', async () => {
    const res = await adminAgent.post('/api/users').send({ name: 'Santi', email: 'santi@uniform.ar', password: 'inicial123', template: 'equipo' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Santi', must_change_password: true, can_delete: false, manage_users: false });
    expect(res.body.user.permissions).toEqual({ home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' });
    const login = await ctx.agentFor('santi@uniform.ar', 'inicial123');
    expect((await login.get('/api/users/directory')).body.error.code).toBe('MUST_CHANGE_PASSWORD');
  });

  it('email repetido → 409 con mensaje claro', async () => {
    const res = await adminAgent.post('/api/users').send({ name: 'X', email: 'SANTI@uniform.ar', password: 'inicial123', template: 'lectura' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Ya existe un usuario con ese email.');
  });

  it('sin manage_users → 403 al listar o crear', async () => {
    const { agent } = await ctx.asUser({ template: 'equipo' });
    expect((await agent.get('/api/users')).status).toBe(403);
    expect((await agent.post('/api/users').send({})).body.error.message).toBe('No tenés permiso para gestionar usuarios');
  });

  it('directory disponible para cualquier usuario logueado', async () => {
    const { agent } = await ctx.asUser({ template: 'lectura' });
    const res = await agent.get('/api/users/directory');
    expect(res.status).toBe(200);
    expect(res.body.users.some((u) => u.name === 'Santi')).toBe(true);
  });

  it('PUT permisos ajusta sección por sección y valida niveles', async () => {
    const santi = await ctx.usersRepo.findByEmail('santi@uniform.ar');
    const ok = await adminAgent.put(`/api/users/${santi.id}/permissions`).send({ projects: 'view' });
    expect(ok.body.user.permissions.projects).toBe('view');
    expect(ok.body.user.permissions.ideas).toBe('edit');
    const bad = await adminAgent.put(`/api/users/${santi.id}/permissions`).send({ projects: 'admin' });
    expect(bad.status).toBe(400);
  });

  it('nadie se quita a sí mismo manage_users ni se desactiva', async () => {
    const a = await adminAgent.patch(`/api/users/${admin.id}`).send({ manage_users: false });
    expect(a.status).toBe(409);
    const b = await adminAgent.patch(`/api/users/${admin.id}`).send({ is_active: false });
    expect(b.status).toBe(409);
  });

  it('desactivar a otro gestor está permitido (queda el que actúa) y le cierra la sesión', async () => {
    const { user: other, agent: otherAgent } = await ctx.asUser({ template: 'admin' });
    const res = await adminAgent.patch(`/api/users/${other.id}`).send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.user.is_active).toBe(false);
    expect((await otherAgent.get('/api/auth/me')).status).toBe(401);
  });

  it('reset de contraseña devuelve temporal y cierra sesiones del usuario', async () => {
    const { user, agent } = await ctx.asUser({ template: 'equipo' });
    const res = await adminAgent.post(`/api/users/${user.id}/reset-password`);
    expect(res.body.temporaryPassword).toHaveLength(10);
    expect(res.body.user.must_change_password).toBe(true);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    await ctx.agentFor(user.email, res.body.temporaryPassword);
  });

  it('id inexistente → 404', async () => {
    expect((await adminAgent.patch('/api/users/00000000-0000-0000-0000-000000000000').send({ name: 'x' })).status).toBe(404);
    expect((await adminAgent.patch('/api/users/no-es-uuid').send({ name: 'x' })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd backend && npx vitest run test/users.routes.test.js`
Expected: FAIL — 404 en `/api/users`.

- [ ] **Step 3: Implementar**

`backend/src/routes/users.js`:
```js
import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { conflict, notFound } from '../lib/errors.js';
import { toPublicUser } from '../repo/users.js';
import { requireFlag, TEMPLATES, SECTIONS, LEVELS } from '../services/permissions.js';
import { hashPassword, generateTempPassword } from '../services/auth.js';
import { colorSchema } from './auth.js';

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  template: z.enum(['admin', 'equipo', 'lectura']),
  avatar_color: colorSchema.optional(),
});
const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email().optional(),
  avatar_color: colorSchema.optional(),
  is_active: z.boolean().optional(),
  can_delete: z.boolean().optional(),
  manage_users: z.boolean().optional(),
});
const permissionsSchema = z.record(z.enum(SECTIONS), z.enum(LEVELS));

export function createUsersRouter({ usersRepo }) {
  const r = Router();

  async function load(id) {
    const u = await usersRepo.findById(id);
    if (!u) throw notFound('No existe ese usuario.');
    return u;
  }

  r.get('/directory', async (_req, res) => res.json({ users: await usersRepo.directory() }));

  r.use(requireFlag('manage_users'));

  r.get('/', async (_req, res) => res.json({ users: (await usersRepo.list()).map(toPublicUser) }));

  r.post('/', async (req, res) => {
    const body = parse(createSchema, req.body);
    if (await usersRepo.findByEmail(body.email)) throw conflict('Ya existe un usuario con ese email.');
    const t = TEMPLATES[body.template];
    const user = await usersRepo.create({
      email: body.email, name: body.name, avatarColor: body.avatar_color,
      passwordHash: await hashPassword(body.password), mustChangePassword: true,
      canDelete: t.can_delete, manageUsers: t.manage_users, permissions: t.permissions,
    });
    res.status(201).json({ user: toPublicUser(user) });
  });

  r.patch('/:id', async (req, res) => {
    const target = await load(req.params.id);
    const patch = parse(patchSchema, req.body);
    const isSelf = target.id === req.user.id;
    if (isSelf && (patch.is_active === false || patch.manage_users === false)) {
      throw conflict('No podés desactivarte ni quitarte el permiso de gestionar usuarios a vos mismo.');
    }
    const losesManager = target.manage_users && target.is_active && (patch.is_active === false || patch.manage_users === false);
    if (losesManager && (await usersRepo.countActiveManagers(target.id)) === 0) {
      throw conflict('Tiene que quedar al menos un usuario activo que gestione usuarios.');
    }
    if (patch.email) {
      const other = await usersRepo.findByEmail(patch.email);
      if (other && other.id !== target.id) throw conflict('Ya existe un usuario con ese email.');
    }
    res.json({ user: toPublicUser(await usersRepo.update(target.id, patch)) });
  });

  r.put('/:id/permissions', async (req, res) => {
    const target = await load(req.params.id);
    const permissions = parse(permissionsSchema, req.body);
    res.json({ user: toPublicUser(await usersRepo.setPermissions(target.id, permissions)) });
  });

  r.post('/:id/reset-password', async (req, res) => {
    const target = await load(req.params.id);
    const temporaryPassword = generateTempPassword();
    await usersRepo.setPassword(target.id, await hashPassword(temporaryPassword), { mustChange: true });
    res.json({ user: toPublicUser(await usersRepo.findById(target.id)), temporaryPassword });
  });

  return r;
}
```

Modify `backend/src/buildApp.js` — agregar import y montar después de `api.use(authenticate, requirePasswordChanged);`:
```js
import { createUsersRouter } from './routes/users.js';
// ...
  api.use('/users', createUsersRouter({ usersRepo }));
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat: gestión de usuarios con plantillas, matriz de permisos y reset de contraseña

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Helpers SQL, historial, clientes y grilla fija

**Files:**
- Create: `backend/src/lib/sql.js`, `backend/src/lib/channels.js`, `backend/src/services/activity.js`, `backend/src/repo/activity.js`, `backend/src/repo/clients.js`, `backend/src/routes/settings.js`
- Create: `backend/test/helpers/fixtures.js`
- Modify: `backend/src/buildApp.js`
- Test: `backend/test/settings.test.js`

**Interfaces:**
- Produces (`sql.js`): `buildInsert(table, values) → { text, params }` (con `RETURNING *`), `buildUpdate(table, id, values, { touch = true }) → { text, params } | null` (setea `updated_at = now()` si `touch`), `pick(obj, keys)`.
- Produces (`channels.js`): `CHANNELS = ['ig_story', 'ig_post', 'ig_reel', 'tiktok']`.
- Produces (`activity.js`): `logActivity(q, { actorId, entityType, entityId, action, diff? })`, `diffFields(before, after, fields) → { campo: { from, to } }`.
- Produces (`repo/activity.js`): `createActivityRepo(db) → { listFor(entityType, entityId, limit = 50) → [{ id, action, diff, created_at, actor_name, actor_color }] }`.
- Produces (`repo/clients.js`): `createClientsRepo(db) → { list(), get(id), upsertByName(q, name) → id, rename(id, name), merge(id, intoId) }`.
- Produces endpoints: `GET/PUT /api/settings/content-rules`, `GET /api/clients`, `POST /api/clients`, `PATCH /api/clients/:id`, `POST /api/clients/:id/merge`.
- Produces (`fixtures.js`): `PNG_1x1: Buffer`, `PDF_MIN: Buffer`, `insertIdea(db, overrides?) → row`, `insertProject(db, overrides?) → row`, `insertCalendarItem(db, overrides?) → row`.

- [ ] **Step 1: Fixtures de tests**

`backend/test/helpers/fixtures.js`:
```js
import { buildInsert } from '../../src/lib/sql.js';

export const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
export const PDF_MIN = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function insert(db, table, values) {
  const { text, params } = buildInsert(table, values);
  const { rows } = await db.query(text, params);
  return rows[0];
}

export const insertIdea = (db, o = {}) => insert(db, 'ideas', { kind: 'idea', format: 'video', category: 'domingo', text: 'Idea de prueba', ...o });
export const insertProject = (db, o = {}) => insert(db, 'projects', { name: 'Proyecto de prueba', status: 'active', ...o });
export const insertCalendarItem = (db, o = {}) => insert(db, 'calendar_items', { date: '2026-10-07', title: 'Pieza', ...o });
```

- [ ] **Step 2: Test que falla**

`backend/test/settings.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { insertIdea } from './helpers/fixtures.js';
import { diffFields } from '../src/services/activity.js';
import { buildUpdate } from '../src/lib/sql.js';

let ctx, admin, equipo, lectura;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo' })).agent;
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
});
afterAll(() => ctx.close());

describe('helpers', () => {
  it('diffFields compara por valor, incluidos arrays', () => {
    expect(diffFields({ a: 1, b: ['x'], c: null }, { a: 1, b: ['x', 'y'], c: 'z' }, ['a', 'b', 'c'])).toEqual({
      b: { from: ['x'], to: ['x', 'y'] },
      c: { from: null, to: 'z' },
    });
  });

  it('buildUpdate rechaza nombres de columna raros', () => {
    expect(() => buildUpdate('ideas', 'id', { 'text; drop': 'x' })).toThrow();
  });
});

describe('grilla fija', () => {
  it('cualquiera con calendario puede leerla', async () => {
    const res = await lectura.get('/api/settings/content-rules');
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(4);
    expect(res.body.rules[0]).toMatchObject({ weekday: 2, theme: 'Foco por rubro' });
  });

  it('solo edit en calendario la reemplaza, validando hora y canales', async () => {
    expect((await lectura.put('/api/settings/content-rules').send({ rules: [] })).status).toBe(403);
    const bad = await equipo.put('/api/settings/content-rules').send({ rules: [{ weekday: 1, time: '25:00', theme: 'x', channels: ['ig_post'] }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields['rules.0.time']).toBe('Hora inválida');
    const ok = await equipo.put('/api/settings/content-rules').send({
      rules: [
        { weekday: 1, time: '19:30', theme: 'Detrás de escena', format: 'Historias', channels: ['ig_story'], active: true },
        { weekday: 5, theme: 'Cliente real', format: 'Reel', channels: ['ig_reel', 'tiktok'] },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.rules.map((r) => r.theme)).toEqual(['Detrás de escena', 'Cliente real']);
    expect(ok.body.rules[1].time).toBeNull();
  });
});

describe('clientes', () => {
  it('crear es idempotente sin importar mayúsculas y espacios', async () => {
    const a = await equipo.post('/api/clients').send({ name: 'Estudio  Wonder' });
    const b = await equipo.post('/api/clients').send({ name: 'estudio wonder' });
    expect(a.status).toBe(201);
    expect(b.body.client.id).toBe(a.body.client.id);
    expect(a.body.client.name).toBe('Estudio Wonder');
  });

  it('renombrar a un nombre existente → 409', async () => {
    const posta = (await equipo.post('/api/clients').send({ name: 'POSTA' })).body.client;
    const res = await equipo.patch(`/api/clients/${posta.id}`).send({ name: 'estudio wonder' });
    expect(res.status).toBe(409);
  });

  it('unificar mueve las ideas y borra el duplicado (requiere borrar)', async () => {
    const dup = (await equipo.post('/api/clients').send({ name: 'Posta SRL' })).body.client;
    const posta = (await equipo.get('/api/clients')).body.clients.find((c) => c.name === 'POSTA');
    const idea = await insertIdea(ctx.db, { category: 'viernes', client_id: dup.id });
    expect((await equipo.post(`/api/clients/${dup.id}/merge`).send({ into_id: posta.id })).status).toBe(403);
    expect((await admin.post(`/api/clients/${dup.id}/merge`).send({ into_id: posta.id })).status).toBe(200);
    const { rows } = await ctx.db.query('SELECT client_id FROM ideas WHERE id = $1', [idea.id]);
    expect(rows[0].client_id).toBe(posta.id);
    const list = (await admin.get('/api/clients')).body.clients;
    expect(list.find((c) => c.id === dup.id)).toBeUndefined();
    expect(list.find((c) => c.id === posta.id).idea_count).toBe(1);
  });

  it('lectura no crea clientes', async () => {
    expect((await lectura.post('/api/clients').send({ name: 'Yaguar' })).status).toBe(403);
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `cd backend && npx vitest run test/settings.test.js`
Expected: FAIL — `Cannot find module '../src/services/activity.js'`.

- [ ] **Step 4: Implementar**

`backend/src/lib/sql.js`:
```js
const ident = (k) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw new Error(`columna inválida: ${k}`);
  return k;
};

export function buildInsert(table, values) {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined).map(ident);
  return {
    text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    params: keys.map((k) => values[k]),
  };
}

export function buildUpdate(table, id, values, { touch = true } = {}) {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined).map(ident);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  if (touch) sets.push('updated_at = now()');
  if (!sets.length) return null;
  return { text: `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params: [id, ...keys.map((k) => values[k])] };
}

export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
```

`backend/src/lib/channels.js`:
```js
export const CHANNELS = ['ig_story', 'ig_post', 'ig_reel', 'tiktok'];
```

`backend/src/services/activity.js`:
```js
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function diffFields(before, after, fields) {
  const d = {};
  for (const f of fields) {
    if (after[f] !== undefined && !same(before[f], after[f])) d[f] = { from: before[f] ?? null, to: after[f] ?? null };
  }
  return d;
}

// Se llama con el `q` de la transacción para que el historial y el cambio se guarden juntos
export async function logActivity(q, { actorId, entityType, entityId, action, diff = null }) {
  await q.query(
    'INSERT INTO activity_log (actor_id, entity_type, entity_id, action, diff) VALUES ($1, $2, $3, $4, $5)',
    [actorId ?? null, entityType, entityId, action, diff && Object.keys(diff).length ? JSON.stringify(diff) : null],
  );
}
```

`backend/src/repo/activity.js`:
```js
export function createActivityRepo(db) {
  return {
    async listFor(entityType, entityId, limit = 50) {
      const { rows } = await db.query(
        `SELECT a.id, a.action, a.diff, a.created_at, u.name AS actor_name, u.avatar_color AS actor_color
         FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
         WHERE a.entity_type = $1 AND a.entity_id = $2
         ORDER BY a.created_at DESC, a.id DESC LIMIT $3`,
        [entityType, entityId, limit],
      );
      return rows;
    },
  };
}
```

`backend/src/repo/clients.js`:
```js
import { conflict, notFound } from '../lib/errors.js';

const clean = (name) => name.trim().replace(/\s+/g, ' ');

export function createClientsRepo(db) {
  async function list() {
    const { rows } = await db.query(
      `SELECT c.id, c.name, count(i.id)::int AS idea_count
       FROM clients c LEFT JOIN ideas i ON i.client_id = c.id
       GROUP BY c.id ORDER BY lower(c.name)`,
    );
    return rows;
  }

  async function get(id) {
    const { rows } = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (!rows[0]) throw notFound('No existe ese cliente.');
    return rows[0];
  }

  async function upsertByName(q, name) {
    const n = clean(name);
    const found = await q.query('SELECT id FROM clients WHERE lower(name) = lower($1)', [n]);
    if (found.rows[0]) return found.rows[0].id;
    const { rows } = await q.query('INSERT INTO clients (name) VALUES ($1) RETURNING id', [n]);
    return rows[0].id;
  }

  async function rename(id, name) {
    await get(id);
    const n = clean(name);
    const { rows: dup } = await db.query('SELECT id FROM clients WHERE lower(name) = lower($1) AND id <> $2', [n, id]);
    if (dup[0]) throw conflict('Ya existe un cliente con ese nombre. Si es el mismo, unificalos.');
    const { rows } = await db.query('UPDATE clients SET name = $2 WHERE id = $1 RETURNING *', [id, n]);
    return rows[0];
  }

  async function merge(id, intoId) {
    if (id === intoId) throw conflict('Elegí un cliente distinto para unificar.');
    await get(id);
    await get(intoId);
    await db.tx(async (q) => {
      await q.query('UPDATE ideas SET client_id = $2 WHERE client_id = $1', [id, intoId]);
      await q.query('DELETE FROM clients WHERE id = $1', [id]);
    });
  }

  return { list, get, upsertByName, rename, merge };
}
```

`backend/src/routes/settings.js`:
```js
import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid } from '../lib/validate.js';
import { CHANNELS } from '../lib/channels.js';
import { requirePermission, requireFlag } from '../services/permissions.js';

const ruleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida').nullish(),
  theme: z.string().trim().min(1, 'Poné la temática').max(80),
  format: z.string().trim().max(80).default(''),
  channels: z.array(z.enum(CHANNELS)).max(4).default([]),
  active: z.boolean().default(true),
});
const rulesSchema = z.object({ rules: z.array(ruleSchema).max(30) });
const nameSchema = z.object({ name: z.string().trim().min(1, 'Poné el nombre').max(120) });
const mergeSchema = z.object({ into_id: uuid });

export function createSettingsRouter({ db, clientsRepo }) {
  const r = Router();

  async function rules() {
    const { rows } = await db.query('SELECT id, weekday, time, theme, format, channels, active, sort FROM content_rules ORDER BY sort');
    return rows;
  }

  r.get('/settings/content-rules', requirePermission('calendar', 'view'), async (_req, res) => res.json({ rules: await rules() }));

  r.put('/settings/content-rules', requirePermission('calendar', 'edit'), async (req, res) => {
    const body = parse(rulesSchema, req.body);
    await db.tx(async (q) => {
      await q.query('DELETE FROM content_rules');
      for (const [i, rule] of body.rules.entries()) {
        await q.query(
          'INSERT INTO content_rules (weekday, time, theme, format, channels, active, sort) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [rule.weekday, rule.time ?? null, rule.theme, rule.format, rule.channels, rule.active, i + 1],
        );
      }
    });
    res.json({ rules: await rules() });
  });

  r.get('/clients', requirePermission('ideas', 'view'), async (_req, res) => res.json({ clients: await clientsRepo.list() }));

  r.post('/clients', requirePermission('ideas', 'edit'), async (req, res) => {
    const { name } = parse(nameSchema, req.body);
    const id = await clientsRepo.upsertByName(db, name);
    res.status(201).json({ client: await clientsRepo.get(id) });
  });

  r.patch('/clients/:id', requirePermission('ideas', 'edit'), async (req, res) => {
    const { name } = parse(nameSchema, req.body);
    res.json({ client: await clientsRepo.rename(req.params.id, name) });
  });

  r.post('/clients/:id/merge', requirePermission('ideas', 'edit'), requireFlag('can_delete'), async (req, res) => {
    const { into_id } = parse(mergeSchema, req.body);
    await clientsRepo.merge(req.params.id, into_id);
    res.json({ ok: true });
  });

  return r;
}
```

Modify `backend/src/buildApp.js` — imports y montaje (después de `/users`):
```js
import { createClientsRepo } from './repo/clients.js';
import { createActivityRepo } from './repo/activity.js';
import { createSettingsRouter } from './routes/settings.js';
// dentro de buildApp, junto a usersRepo:
  const clientsRepo = createClientsRepo(db);
  const activityRepo = createActivityRepo(db);
// después de api.use('/users', ...):
  api.use(createSettingsRouter({ db, clientsRepo }));
```
(`activityRepo` lo usan las Tasks 8–10.)

- [ ] **Step 5: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat: helpers SQL, historial de cambios, clientes y grilla fija editable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Almacenamiento y archivos (imágenes y PDFs)

**Files:**
- Modify (reemplazar el stub): `backend/src/services/storage.js`
- Create: `backend/src/services/files.js`, `backend/src/routes/files.js`
- Modify: `backend/src/buildApp.js`
- Test: `backend/test/files.test.js`

**Interfaces:**
- Produces (`storage.js`): `createLocalStorage({ dir })` y `createS3Storage({ endpoint, region, bucket, accessKeyId, secretAccessKey, urlTtlSeconds = 3600 })`, ambos `{ driver, put(key, buffer, mime), read(key) → Buffer, remove(key), urlFor(fileRow) → Promise<string> }`. El local devuelve `/api/files/:id/raw`.
- Produces (`files.js`): `OWNER_TYPES` (`{ table, section, kind, max }` por `owner_type`), `LIMITS`, `createFilesService({ db, storage }) → { listFor(ownerTypes[], ownerIds[]) → FileDTO[], upload({ ownerType, ownerId, buffer, originalName, userId }) → FileDTO, get(id) → row, read(row) → Buffer, remove(id), removeOwnerRows(q, ownerTypes[], ownerId) → keys[], purgeKeys(keys), retryPending() → number, reorder(ids) }`.
- `FileDTO = { id, owner_type, owner_id, kind, mime, bytes, width, height, original_name, sort, created_at, url }`.
- Produces endpoints: `POST /api/files` (multipart `owner_type`, `owner_id`, `file`) → `201 { file }`; `GET /api/files/:id/raw`; `DELETE /api/files/:id`; `PATCH /api/files/order { ids }`.

- [ ] **Step 1: Test que falla**

`backend/test/files.test.js`:
```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { PNG_1x1, PDF_MIN, insertIdea, insertProject, insertCalendarItem } from './helpers/fixtures.js';
import { createFilesService } from '../src/services/files.js';

let ctx, admin, equipo, lectura, idea;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo' })).agent;
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
  idea = await insertIdea(ctx.db, { format: 'photo' });
});
afterAll(() => ctx.close());

const up = (agent, ownerType, ownerId, buffer, name = 'foto.png') =>
  agent.post('/api/files').field('owner_type', ownerType).field('owner_id', ownerId).attach('file', buffer, name);

describe('archivos', () => {
  it('sube una imagen, guarda medidas y se puede leer', async () => {
    const res = await up(equipo, 'idea_ref', idea.id, PNG_1x1);
    expect(res.status).toBe(201);
    expect(res.body.file).toMatchObject({ kind: 'image', mime: 'image/png', width: 1, height: 1, original_name: 'foto.png' });
    expect(res.body.file.url).toBe(`/api/files/${res.body.file.id}/raw`);
    const raw = await lectura.get(res.body.file.url);
    expect(raw.status).toBe(200);
    expect(raw.headers['content-type']).toMatch(/image\/png/);
  });

  it('detecta el tipo real: texto con extensión .png → 415', async () => {
    const res = await up(equipo, 'idea_ref', idea.id, Buffer.from('hola, no soy imagen'), 'trucho.png');
    expect(res.status).toBe(415);
    expect(res.body.error.message).toBe('Solo se aceptan imágenes JPG, PNG o WebP.');
  });

  it('PDF solo en project_pdf', async () => {
    const project = await insertProject(ctx.db);
    expect((await up(equipo, 'idea_ref', idea.id, PDF_MIN, 'doc.pdf')).status).toBe(415);
    const ok = await up(equipo, 'project_pdf', project.id, PDF_MIN, 'propuesta.pdf');
    expect(ok.status).toBe(201);
    expect(ok.body.file.kind).toBe('pdf');
  });

  it('imagen de más de 2 MB → 413 con mensaje claro', async () => {
    const big = Buffer.concat([PNG_1x1, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await up(equipo, 'idea_ref', idea.id, big);
    expect(res.status).toBe(413);
    expect(res.body.error.message).toBe('La imagen pesa más de 2 MB.');
  });

  it('dueño inexistente → 404; sin archivo → 400', async () => {
    expect((await up(equipo, 'idea_ref', '00000000-0000-0000-0000-000000000000', PNG_1x1)).status).toBe(404);
    const res = await equipo.post('/api/files').field('owner_type', 'idea_ref').field('owner_id', idea.id);
    expect(res.status).toBe(400);
  });

  it('permisos: lectura no sube; sin acceso a ideas no lee', async () => {
    expect((await up(lectura, 'idea_ref', idea.id, PNG_1x1)).status).toBe(403);
    const file = (await up(equipo, 'idea_ref', idea.id, PNG_1x1)).body.file;
    const { agent: sinIdeas } = await ctx.asUser({ template: 'equipo', permissions: { ideas: 'none' } });
    expect((await sinIdeas.get(file.url)).status).toBe(403);
  });

  it('máximo 10 previsualizaciones por pieza', async () => {
    const item = await insertCalendarItem(ctx.db);
    for (let i = 0; i < 10; i++) expect((await up(equipo, 'calendar_preview', item.id, PNG_1x1)).status).toBe(201);
    const res = await up(equipo, 'calendar_preview', item.id, PNG_1x1);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Máximo 10 archivos acá.');
  });

  it('borrar requiere can_delete y elimina del storage', async () => {
    const file = (await up(equipo, 'idea_ref', idea.id, PNG_1x1)).body.file;
    expect((await equipo.delete(`/api/files/${file.id}`)).status).toBe(403);
    const { rows } = await ctx.db.query('SELECT storage_key FROM files WHERE id = $1', [file.id]);
    expect((await admin.delete(`/api/files/${file.id}`)).status).toBe(200);
    await expect(fs.access(path.join(ctx.dir, rows[0].storage_key))).rejects.toThrow();
  });

  it('reordenar', async () => {
    const it2 = await insertIdea(ctx.db, { format: 'photo' });
    const a = (await up(equipo, 'idea_ref', it2.id, PNG_1x1)).body.file;
    const b = (await up(equipo, 'idea_ref', it2.id, PNG_1x1)).body.file;
    expect((await equipo.patch('/api/files/order').send({ ids: [b.id, a.id] })).status).toBe(200);
    const { rows } = await ctx.db.query('SELECT id FROM files WHERE owner_id = $1 ORDER BY sort', [it2.id]);
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it('si el storage falla al borrar, queda pendiente y se reintenta', async () => {
    let fail = true;
    const storage = { ...ctx.storage, remove: async (key) => { if (fail) throw new Error('caído'); return ctx.storage.remove(key); } };
    const files = createFilesService({ db: ctx.db, storage });
    await files.purgeKeys(['idea_ref/x/y.png']);
    let { rows } = await ctx.db.query('SELECT * FROM storage_deletions_pending');
    expect(rows.map((r) => r.storage_key)).toContain('idea_ref/x/y.png');
    fail = false;
    expect(await files.retryPending()).toBe(1);
    ({ rows } = await ctx.db.query('SELECT * FROM storage_deletions_pending'));
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd backend && npx vitest run test/files.test.js`
Expected: FAIL — `createFilesService` no existe.

- [ ] **Step 3: Implementar**

`backend/src/services/storage.js` (reemplaza el stub):
```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Interfaz común: { driver, put(key, buffer, mime), read(key) → Buffer, remove(key), urlFor(fileRow) → Promise<string> }

export function createLocalStorage({ dir }) {
  const root = path.resolve(dir);
  const full = (key) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error('clave inválida');
    return p;
  };
  return {
    driver: 'local',
    async put(key, buffer) {
      const p = full(key);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, buffer);
    },
    read: (key) => fs.readFile(full(key)),
    remove: (key) => fs.rm(full(key), { force: true }),
    urlFor: async (file) => `/api/files/${file.id}/raw`,
  };
}

export function createS3Storage({ endpoint, region = 'auto', bucket, accessKeyId, secretAccessKey, urlTtlSeconds = 3600 }) {
  const client = new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey } });
  return {
    driver: 's3',
    put: (key, buffer, mime) => client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: buffer, ContentType: mime, CacheControl: 'private, max-age=31536000, immutable',
    })),
    async read(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await out.Body.transformToByteArray());
    },
    remove: (key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
    // URL firmada: el bucket es privado; dura 1 h para que la galería no se rompa mientras se navega
    urlFor: (file) => getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: file.storage_key }), { expiresIn: urlTtlSeconds }),
  };
}
```

`backend/src/services/files.js`:
```js
import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sizeOf from 'image-size';
import { AppError, badRequest, notFound } from '../lib/errors.js';

export const OWNER_TYPES = {
  idea_ref: { table: 'ideas', section: 'ideas', kind: 'image', max: 20 },
  idea_result: { table: 'ideas', section: 'ideas', kind: 'image', max: 20 },
  calendar_preview: { table: 'calendar_items', section: 'calendar', kind: 'image', max: 10 },
  project_photo: { table: 'projects', section: 'projects', kind: 'image', max: 50 },
  project_pdf: { table: 'projects', section: 'projects', kind: 'pdf', max: 20 },
};
export const LIMITS = { image: 2 * 1024 * 1024, pdf: 10 * 1024 * 1024 };
const ACCEPTED = { image: ['image/webp', 'image/jpeg', 'image/png'], pdf: ['application/pdf'] };
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

export function createFilesService({ db, storage }) {
  async function toDTO(rows) {
    return Promise.all(rows.map(async (f) => ({
      id: f.id, owner_type: f.owner_type, owner_id: f.owner_id, kind: f.kind, mime: f.mime, bytes: f.bytes,
      width: f.width, height: f.height, original_name: f.original_name, sort: f.sort, created_at: f.created_at,
      url: await storage.urlFor(f),
    })));
  }

  async function listFor(ownerTypes, ownerIds) {
    if (!ownerIds.length) return [];
    const { rows } = await db.query(
      'SELECT * FROM files WHERE owner_type = ANY($1) AND owner_id = ANY($2) ORDER BY sort, created_at',
      [ownerTypes, ownerIds],
    );
    return toDTO(rows);
  }

  async function upload({ ownerType, ownerId, buffer, originalName, userId }) {
    const def = OWNER_TYPES[ownerType];
    if (!def) throw badRequest('Tipo de archivo inválido.');
    const { rows: owner } = await db.query(`SELECT id FROM ${def.table} WHERE id = $1`, [ownerId]);
    if (!owner[0]) throw notFound('No existe el elemento al que querés adjuntar el archivo.');

    const mime = (await fileTypeFromBuffer(buffer))?.mime;
    if (!mime || !ACCEPTED[def.kind].includes(mime)) {
      throw new AppError(415, 'UNSUPPORTED_FILE', def.kind === 'pdf' ? 'Solo se aceptan archivos PDF.' : 'Solo se aceptan imágenes JPG, PNG o WebP.');
    }
    if (buffer.length > LIMITS[def.kind]) {
      throw new AppError(413, 'FILE_TOO_LARGE', def.kind === 'pdf' ? 'El PDF pesa más de 10 MB.' : 'La imagen pesa más de 2 MB.');
    }
    const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM files WHERE owner_type = $1 AND owner_id = $2', [ownerType, ownerId]);
    if (n >= def.max) throw new AppError(409, 'TOO_MANY_FILES', `Máximo ${def.max} archivos acá.`);

    let width = null;
    let height = null;
    if (def.kind === 'image') {
      try {
        ({ width, height } = sizeOf(buffer));
      } catch {
        throw new AppError(415, 'UNSUPPORTED_FILE', 'No pudimos leer la imagen. Probá con otra.');
      }
    }

    const key = `${ownerType}/${ownerId}/${crypto.randomUUID()}.${EXT[mime]}`;
    await storage.put(key, buffer, mime);
    try {
      const { rows } = await db.query(
        `INSERT INTO files (owner_type, owner_id, kind, storage_key, mime, bytes, width, height, original_name, sort, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [ownerType, ownerId, def.kind, key, mime, buffer.length, width, height, String(originalName ?? '').slice(0, 200), n, userId],
      );
      return (await toDTO(rows))[0];
    } catch (err) {
      await purgeKeys([key]);
      throw err;
    }
  }

  async function get(id) {
    const { rows } = await db.query('SELECT * FROM files WHERE id = $1', [id]);
    if (!rows[0]) throw notFound('No existe ese archivo.');
    return rows[0];
  }

  const read = (row) => storage.read(row.storage_key);

  async function purgeKeys(keys) {
    for (const key of keys) {
      try {
        await storage.remove(key);
      } catch (err) {
        console.error('[storage] no se pudo borrar', key, err.message);
        await db.query('INSERT INTO storage_deletions_pending (storage_key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
      }
    }
  }

  async function remove(id) {
    const { rows } = await db.query('DELETE FROM files WHERE id = $1 RETURNING storage_key', [id]);
    if (!rows[0]) throw notFound('No existe ese archivo.');
    await purgeKeys([rows[0].storage_key]);
  }

  // Dentro de la transacción del dueño: borra las filas y devuelve las claves para purgar después del commit
  async function removeOwnerRows(q, ownerTypes, ownerId) {
    const { rows } = await q.query('DELETE FROM files WHERE owner_type = ANY($1) AND owner_id = $2 RETURNING storage_key', [ownerTypes, ownerId]);
    return rows.map((r) => r.storage_key);
  }

  async function retryPending() {
    const { rows } = await db.query('SELECT storage_key FROM storage_deletions_pending WHERE attempts < 20 ORDER BY created_at LIMIT 200');
    let done = 0;
    for (const { storage_key: key } of rows) {
      try {
        await storage.remove(key);
        await db.query('DELETE FROM storage_deletions_pending WHERE storage_key = $1', [key]);
        done++;
      } catch {
        await db.query('UPDATE storage_deletions_pending SET attempts = attempts + 1 WHERE storage_key = $1', [key]);
      }
    }
    return done;
  }

  async function reorder(ids) {
    const { rows } = await db.query('SELECT id, owner_type, owner_id FROM files WHERE id = ANY($1)', [ids]);
    if (rows.length !== ids.length) throw notFound('Algún archivo ya no existe.');
    const owners = new Set(rows.map((r) => `${r.owner_type}:${r.owner_id}`));
    if (owners.size !== 1) throw badRequest('Solo se pueden reordenar archivos del mismo lugar.');
    await db.tx(async (q) => {
      for (const [i, id] of ids.entries()) await q.query('UPDATE files SET sort = $2 WHERE id = $1', [id, i]);
    });
    return rows[0];
  }

  return { listFor, upload, get, read, remove, removeOwnerRows, purgeKeys, retryPending, reorder };
}
```

`backend/src/routes/files.js`:
```js
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { parse, uuid } from '../lib/validate.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { hasLevel, requireFlag, SECTION_LABELS } from '../services/permissions.js';
import { OWNER_TYPES } from '../services/files.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const uploadSchema = z.object({ owner_type: z.enum(Object.keys(OWNER_TYPES)), owner_id: uuid });
const orderSchema = z.object({ ids: z.array(uuid).min(1).max(50) });

function checkSection(user, ownerType, level) {
  const section = OWNER_TYPES[ownerType]?.section;
  if (!section) throw badRequest('Tipo de archivo inválido.');
  if (!hasLevel(user, section, level)) {
    throw forbidden(level === 'edit' ? `No tenés permiso para editar ${SECTION_LABELS[section]}` : `No tenés acceso a ${SECTION_LABELS[section]}`);
  }
}

export function createFilesRouter({ files }) {
  const r = Router();

  r.post('/files', upload.single('file'), async (req, res) => {
    const { owner_type, owner_id } = parse(uploadSchema, req.body);
    checkSection(req.user, owner_type, 'edit');
    if (!req.file) throw badRequest('Elegí un archivo.', { file: 'Obligatorio' });
    const file = await files.upload({
      ownerType: owner_type, ownerId: owner_id, buffer: req.file.buffer, originalName: req.file.originalname, userId: req.user.id,
    });
    res.status(201).json({ file });
  });

  r.patch('/files/order', async (req, res) => {
    const { ids } = parse(orderSchema, req.body);
    const first = await files.get(ids[0]);
    checkSection(req.user, first.owner_type, 'edit');
    await files.reorder(ids);
    res.json({ ok: true });
  });

  r.get('/files/:id/raw', async (req, res) => {
    const file = await files.get(req.params.id);
    checkSection(req.user, file.owner_type, 'view');
    res.type(file.mime).set('Cache-Control', 'private, max-age=3600').send(await files.read(file));
  });

  r.delete('/files/:id', requireFlag('can_delete'), async (req, res) => {
    const file = await files.get(req.params.id);
    checkSection(req.user, file.owner_type, 'edit');
    await files.remove(file.id);
    res.json({ ok: true });
  });

  return r;
}
```

Modify `backend/src/buildApp.js`:
```js
import { createFilesService } from './services/files.js';
import { createFilesRouter } from './routes/files.js';
// dentro de buildApp:
  if (!storage) throw new Error('Falta storage');
  const files = createFilesService({ db, storage });
// montaje, después del de settings:
  api.use(createFilesRouter({ files }));
```
Y devolver `files` para el cron de Task 13: cambiar el final de `buildApp` a
```js
  const app = createApp({ /* igual que antes */ });
  app.locals.files = files;
  return app;
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat: subida de imágenes y PDFs con validación por contenido, límites y borrado con reintento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Ideas de contenido

**Files:**
- Create: `backend/src/lib/ideaStatus.js`, `backend/src/repo/ideas.js`, `backend/src/routes/ideas.js`
- Modify: `backend/src/buildApp.js`
- Test: `backend/test/ideaStatus.test.js`, `backend/test/ideas.test.js`

**Interfaces:**
- Produces: `deriveIdeaStatus({ kind, decision, done_at }) → 'no_se_hace'|'realizada'|'si_o_si'|'por_hacer'|'por_decidir'`, `IDEA_STATUS_LABELS`.
- Produces: `createIdeasRepo(db) → { list(), get(id, q?) }` — filas con `status`, `client_name`, `assignee_name`, `assignee_color`, `note_santi_by_name`, `note_sofi_by_name`, `ref_count`, `result_count`, `calendar_links: [{ id, date }]`.
- Produces endpoints: `GET /api/ideas → { ideas }`, `GET /api/ideas/:id → { idea }` (con `ref_files`, `result_files`), `GET /api/ideas/:id/activity → { activity }`, `POST /api/ideas → 201 { idea }`, `PATCH /api/ideas/:id → { idea }`, `POST /api/ideas/:id/decide { decision: 'yes'|'no' }`, `POST /api/ideas/:id/undecide`, `POST /api/ideas/:id/complete { result_url }`, `POST /api/ideas/:id/reopen`, `DELETE /api/ideas/:id`.
- Campos de alta/edición: `kind, format, category, text, client_name, assignee_id, reference_url, due_date, note_santi, note_sofi`.

- [ ] **Step 1: Tests que fallan**

`backend/test/ideaStatus.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { deriveIdeaStatus } from '../src/lib/ideaStatus.js';

describe('deriveIdeaStatus', () => {
  it.each([
    [{ kind: 'idea', decision: 'pending', done_at: null }, 'por_decidir'],
    [{ kind: 'idea', decision: 'yes', done_at: null }, 'por_hacer'],
    [{ kind: 'idea', decision: 'no', done_at: null }, 'no_se_hace'],
    [{ kind: 'idea', decision: 'yes', done_at: '2026-10-07T10:00:00Z' }, 'realizada'],
    [{ kind: 'must', decision: 'pending', done_at: null }, 'si_o_si'],
    [{ kind: 'must', decision: 'pending', done_at: '2026-10-07T10:00:00Z' }, 'realizada'],
    [{ kind: 'idea', decision: 'no', done_at: '2026-10-07T10:00:00Z' }, 'no_se_hace'],
  ])('%o → %s', (idea, expected) => {
    expect(deriveIdeaStatus(idea)).toBe(expected);
  });
});
```

`backend/test/ideas.test.js`:
```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { PNG_1x1, insertCalendarItem } from './helpers/fixtures.js';

let ctx, admin, equipo, equipoUser, lectura, santi;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  ({ agent: equipo, user: equipoUser } = await ctx.asUser({ template: 'equipo', name: 'Sofi' }));
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
  santi = await ctx.createUser({ template: 'equipo', name: 'Santi' });
});
afterAll(() => ctx.close());

const base = { kind: 'idea', format: 'video', category: 'domingo', text: 'Reel de humor con el delantal' };
const create = (agent, body = {}) => agent.post('/api/ideas').send({ ...base, ...body });

describe('ideas', () => {
  it('crea una idea por decidir, asignada', async () => {
    const res = await create(equipo, { assignee_id: santi.id });
    expect(res.status).toBe(201);
    expect(res.body.idea).toMatchObject({ status: 'por_decidir', decision: 'pending', assignee_name: 'Santi', ref_files: [], result_files: [] });
  });

  it('cliente solo para viernes; se reutiliza sin importar mayúsculas', async () => {
    const a = (await create(equipo, { category: 'viernes', client_name: 'Estudio Wonder' })).body.idea;
    const b = (await create(equipo, { category: 'viernes', client_name: 'estudio wonder' })).body.idea;
    const c = (await create(equipo, { category: 'domingo', client_name: 'Yaguar' })).body.idea;
    expect(a.client_id).toBe(b.client_id);
    expect(a.client_name).toBe('Estudio Wonder');
    expect(c.client_id).toBeNull();
  });

  it('fecha límite solo para "sí o sí"', async () => {
    const must = (await create(equipo, { kind: 'must', format: 'photo', category: 'producto', due_date: '2026-10-31' })).body.idea;
    const idea = (await create(equipo, { due_date: '2026-10-31' })).body.idea;
    expect(must).toMatchObject({ status: 'si_o_si', due_date: '2026-10-31' });
    expect(idea.due_date).toBeNull();
  });

  it('textos largos con saltos de línea y emojis vuelven idénticos, con autor de la nota', async () => {
    const note = 'Línea 1\nLínea 2 🎬\n\n  con sangría y "comillas"';
    const res = await create(equipo, { text: 'Idea\ncon dos líneas 😂', note_sofi: note });
    expect(res.body.idea.text).toBe('Idea\ncon dos líneas 😂');
    expect(res.body.idea.note_sofi).toBe(note);
    expect(res.body.idea.note_sofi_by_name).toBe('Sofi');
  });

  it('validaciones con mensajes en español', async () => {
    const res = await create(equipo, { text: '', reference_url: 'instagram.com/reel/x' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toMatchObject({ text: 'Escribí la idea', reference_url: 'Link inválido' });
  });

  it('flujo: decidir sí → por hacer → realizada (link obligatorio) → reabrir', async () => {
    const id = (await create(equipo)).body.idea.id;
    expect((await equipo.post(`/api/ideas/${id}/complete`).send({ result_url: 'https://drive.google.com/x' })).body.error.message)
      .toBe('Primero marcá "Sí la hago".');
    expect((await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'yes' })).body.idea.status).toBe('por_hacer');
    const noLink = await equipo.post(`/api/ideas/${id}/complete`).send({});
    expect(noLink.status).toBe(400);
    expect(noLink.body.error.fields.result_url).toBe('Pegá el link del resultado');
    const done = await equipo.post(`/api/ideas/${id}/complete`).send({ result_url: 'https://www.instagram.com/reel/abc/' });
    expect(done.body.idea).toMatchObject({ status: 'realizada', result_url: 'https://www.instagram.com/reel/abc/' });
    expect(done.body.idea.done_at).toBeTruthy();
    expect((await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'no' })).status).toBe(409);
    expect((await equipo.post(`/api/ideas/${id}/reopen`)).body.idea.status).toBe('por_hacer');
  });

  it('decidir no y deshacer', async () => {
    const id = (await create(equipo)).body.idea.id;
    expect((await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'no' })).body.idea.status).toBe('no_se_hace');
    expect((await equipo.post(`/api/ideas/${id}/complete`).send({ result_url: 'https://x.com' })).status).toBe(409);
    expect((await equipo.post(`/api/ideas/${id}/undecide`)).body.idea.status).toBe('por_decidir');
  });

  it('"sí o sí" no se decide pero sí se completa', async () => {
    const id = (await create(equipo, { kind: 'must' })).body.idea.id;
    const res = await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'yes' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Los contenidos "sí o sí" no se deciden: ya están por hacer.');
    expect((await equipo.post(`/api/ideas/${id}/complete`).send({ result_url: 'https://x.com/r' })).body.idea.status).toBe('realizada');
  });

  it('editar todo: idea → sí o sí reinicia decisión; dejar de ser viernes limpia cliente', async () => {
    const created = (await create(equipo, { category: 'viernes', client_name: 'POSTA' })).body.idea;
    await equipo.post(`/api/ideas/${created.id}/decide`).send({ decision: 'no' });
    const res = await equipo.patch(`/api/ideas/${created.id}`).send({ kind: 'must', category: 'producto', text: 'Fotos de catálogo' });
    expect(res.body.idea).toMatchObject({ kind: 'must', status: 'si_o_si', client_id: null, text: 'Fotos de catálogo' });
  });

  it('historial registra quién hizo qué', async () => {
    const id = (await create(equipo)).body.idea.id;
    await equipo.patch(`/api/ideas/${id}`).send({ text: 'Otro texto' });
    await equipo.post(`/api/ideas/${id}/decide`).send({ decision: 'yes' });
    const { body } = await lectura.get(`/api/ideas/${id}/activity`);
    expect(body.activity.map((a) => a.action)).toEqual(['decide_yes', 'update', 'create']);
    expect(body.activity[1].diff.text).toEqual({ from: base.text, to: 'Otro texto' });
    expect(body.activity[0].actor_name).toBe('Sofi');
  });

  it('lectura ve pero no edita', async () => {
    expect((await lectura.get('/api/ideas')).status).toBe(200);
    const res = await create(lectura);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('No tenés permiso para editar Ideas');
  });

  it('borrar: requiere permiso, borra archivos y deja la pieza vinculada sin idea', async () => {
    const id = (await create(equipo, { format: 'photo' })).body.idea.id;
    const item = await insertCalendarItem(ctx.db, { idea_id: id });
    const file = (await equipo.post('/api/files').field('owner_type', 'idea_ref').field('owner_id', id).attach('file', PNG_1x1, 'r.png')).body.file;
    const { rows: [{ storage_key }] } = await ctx.db.query('SELECT storage_key FROM files WHERE id = $1', [file.id]);
    const detail = (await equipo.get(`/api/ideas/${id}`)).body.idea;
    expect(detail.ref_files).toHaveLength(1);
    expect(detail.calendar_links).toEqual([{ id: item.id, date: '2026-10-07' }]);
    expect((await equipo.delete(`/api/ideas/${id}`)).status).toBe(403);
    expect((await admin.delete(`/api/ideas/${id}`)).status).toBe(200);
    expect((await equipo.get(`/api/ideas/${id}`)).status).toBe(404);
    const { rows } = await ctx.db.query('SELECT idea_id FROM calendar_items WHERE id = $1', [item.id]);
    expect(rows[0].idea_id).toBeNull();
    await expect(fs.access(path.join(ctx.dir, storage_key))).rejects.toThrow();
  });

  it('lista ordenada de más nueva a más vieja', async () => {
    const { body } = await equipo.get('/api/ideas');
    const dates = body.ideas.map((i) => new Date(i.created_at).getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    expect(equipoUser.name).toBe('Sofi');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/ideaStatus.test.js test/ideas.test.js`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

`backend/src/lib/ideaStatus.js`:
```js
// Única fuente del estado de una idea (espejada en frontend/src/lib/ideaStatus.js)
export const IDEA_STATUS_LABELS = {
  si_o_si: 'Sí o sí', por_decidir: 'Por decidir', por_hacer: 'Por hacer', realizada: 'Realizada', no_se_hace: 'No se hace',
};

export function deriveIdeaStatus({ kind, decision, done_at }) {
  if (decision === 'no') return 'no_se_hace';
  if (done_at) return 'realizada';
  if (kind === 'must') return 'si_o_si';
  if (decision === 'yes') return 'por_hacer';
  return 'por_decidir';
}
```

`backend/src/repo/ideas.js`:
```js
import { deriveIdeaStatus } from '../lib/ideaStatus.js';

const SELECT = `
  SELECT i.*, c.name AS client_name, a.name AS assignee_name, a.avatar_color AS assignee_color,
    ns.name AS note_santi_by_name, nf.name AS note_sofi_by_name,
    (SELECT count(*)::int FROM files f WHERE f.owner_type = 'idea_ref' AND f.owner_id = i.id) AS ref_count,
    (SELECT count(*)::int FROM files f WHERE f.owner_type = 'idea_result' AND f.owner_id = i.id) AS result_count,
    (SELECT json_agg(json_build_object('id', ci.id, 'date', ci.date) ORDER BY ci.date)
       FROM calendar_items ci WHERE ci.idea_id = i.id) AS calendar_links
  FROM ideas i
  LEFT JOIN clients c ON c.id = i.client_id
  LEFT JOIN users a ON a.id = i.assignee_id
  LEFT JOIN users ns ON ns.id = i.note_santi_by
  LEFT JOIN users nf ON nf.id = i.note_sofi_by`;

export const withStatus = (row) => (row ? { ...row, status: deriveIdeaStatus(row), calendar_links: row.calendar_links ?? [] } : null);

export function createIdeasRepo(db) {
  return {
    async list() {
      const { rows } = await db.query(`${SELECT} ORDER BY i.created_at DESC`);
      return rows.map(withStatus);
    },
    async get(id, q = db) {
      const { rows } = await q.query(`${SELECT} WHERE i.id = $1`, [id]);
      return withStatus(rows[0]);
    },
  };
}
```

`backend/src/routes/ideas.js`:
```js
import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid, dateStr, optionalUrl, requiredUrl, nullableText } from '../lib/validate.js';
import { conflict, notFound } from '../lib/errors.js';
import { buildInsert, buildUpdate, pick } from '../lib/sql.js';
import { requirePermission, requireFlag } from '../services/permissions.js';
import { logActivity, diffFields } from '../services/activity.js';

const FIELDS = {
  kind: z.enum(['idea', 'must']),
  format: z.enum(['video', 'photo']),
  category: z.enum(['domingo', 'viernes', 'producto', 'otra']),
  text: z.string().trim().min(1, 'Escribí la idea').max(5000),
  client_name: z.string().trim().max(120).nullish(),
  assignee_id: uuid.nullish(),
  reference_url: optionalUrl,
  due_date: dateStr.nullish(),
  note_santi: nullableText(5000),
  note_sofi: nullableText(5000),
};
const createSchema = z.object(FIELDS);
const updateSchema = z.object(FIELDS).partial();
const decideSchema = z.object({ decision: z.enum(['yes', 'no']) });
const completeSchema = z.object({ result_url: requiredUrl });

const EDITABLE = ['kind', 'format', 'category', 'client_id', 'assignee_id', 'text', 'reference_url', 'due_date',
  'note_santi', 'note_santi_by', 'note_sofi', 'note_sofi_by', 'decision'];

// Reglas de coherencia: cliente solo en viernes, fecha límite solo en "sí o sí"
function normalize(v) {
  return { ...v, client_id: v.category === 'viernes' ? v.client_id ?? null : null, due_date: v.kind === 'must' ? v.due_date ?? null : null };
}

export function createIdeasRouter({ db, ideasRepo, clientsRepo, activityRepo, files }) {
  const r = Router();
  const view = requirePermission('ideas', 'view');
  const edit = requirePermission('ideas', 'edit');

  async function detail(id) {
    const idea = await ideasRepo.get(id);
    if (!idea) throw notFound('No existe esa idea.');
    const all = await files.listFor(['idea_ref', 'idea_result'], [id]);
    return { ...idea, ref_files: all.filter((f) => f.owner_type === 'idea_ref'), result_files: all.filter((f) => f.owner_type === 'idea_result') };
  }

  async function lock(q, id) {
    const { rows } = await q.query('SELECT * FROM ideas WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw notFound('No existe esa idea.');
    return rows[0];
  }

  const resolveClient = (q, category, name) => (category === 'viernes' && name ? clientsRepo.upsertByName(q, name) : null);

  r.get('/ideas', view, async (_req, res) => res.json({ ideas: await ideasRepo.list() }));
  r.get('/ideas/:id', view, async (req, res) => res.json({ idea: await detail(req.params.id) }));
  r.get('/ideas/:id/activity', view, async (req, res) => res.json({ activity: await activityRepo.listFor('idea', req.params.id) }));

  r.post('/ideas', edit, async (req, res) => {
    const b = parse(createSchema, req.body);
    const id = await db.tx(async (q) => {
      const values = normalize({
        kind: b.kind, format: b.format, category: b.category, text: b.text,
        client_id: await resolveClient(q, b.category, b.client_name),
        assignee_id: b.assignee_id ?? null, reference_url: b.reference_url ?? null, due_date: b.due_date ?? null,
        note_santi: b.note_santi ?? null, note_sofi: b.note_sofi ?? null,
        note_santi_by: b.note_santi ? req.user.id : null, note_sofi_by: b.note_sofi ? req.user.id : null,
        decision: 'pending', created_by: req.user.id,
      });
      const ins = buildInsert('ideas', values);
      const { rows } = await q.query(ins.text, ins.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'idea', entityId: rows[0].id, action: 'create' });
      return rows[0].id;
    });
    res.status(201).json({ idea: await detail(id) });
  });

  r.patch('/ideas/:id', edit, async (req, res) => {
    const b = parse(updateSchema, req.body);
    await db.tx(async (q) => {
      const before = await lock(q, req.params.id);
      const patch = pick(b, ['kind', 'format', 'category', 'text', 'assignee_id', 'reference_url', 'due_date', 'note_santi', 'note_sofi']);
      if (b.client_name !== undefined) patch.client_id = await resolveClient(q, b.category ?? before.category, b.client_name);
      if (b.kind && b.kind !== before.kind && !before.done_at) patch.decision = 'pending';
      if (b.note_santi !== undefined && b.note_santi !== before.note_santi) patch.note_santi_by = b.note_santi ? req.user.id : null;
      if (b.note_sofi !== undefined && b.note_sofi !== before.note_sofi) patch.note_sofi_by = b.note_sofi ? req.user.id : null;
      const merged = normalize({ ...before, ...patch });
      const changed = diffFields(before, merged, EDITABLE);
      if (!Object.keys(changed).length) return;
      const upd = buildUpdate('ideas', before.id, Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])));
      await q.query(upd.text, upd.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'idea', entityId: before.id, action: 'update', diff: changed });
    });
    res.json({ idea: await detail(req.params.id) });
  });

  async function transition(req, action, check, values) {
    await db.tx(async (q) => {
      const before = await lock(q, req.params.id);
      check(before);
      const upd = buildUpdate('ideas', before.id, values);
      await q.query(upd.text, upd.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'idea', entityId: before.id, action });
    });
    return detail(req.params.id);
  }

  r.post('/ideas/:id/decide', edit, async (req, res) => {
    const { decision } = parse(decideSchema, req.body);
    const idea = await transition(req, decision === 'yes' ? 'decide_yes' : 'decide_no', (i) => {
      if (i.kind === 'must') throw conflict('Los contenidos "sí o sí" no se deciden: ya están por hacer.');
      if (i.done_at) throw conflict('Esta idea ya está realizada. Reabrila primero.');
    }, { decision });
    res.json({ idea });
  });

  r.post('/ideas/:id/undecide', edit, async (req, res) => {
    const idea = await transition(req, 'undecide', (i) => {
      if (i.done_at) throw conflict('Esta idea ya está realizada. Reabrila primero.');
    }, { decision: 'pending' });
    res.json({ idea });
  });

  r.post('/ideas/:id/complete', edit, async (req, res) => {
    const { result_url } = parse(completeSchema, req.body);
    const idea = await transition(req, 'complete', (i) => {
      if (i.decision === 'no') throw conflict('Esta idea está marcada como "No se hace".');
      if (i.kind === 'idea' && i.decision !== 'yes') throw conflict('Primero marcá "Sí la hago".');
      if (i.done_at) throw conflict('Esta idea ya está realizada.');
    }, { done_at: new Date(), result_url });
    res.json({ idea });
  });

  r.post('/ideas/:id/reopen', edit, async (req, res) => {
    const idea = await transition(req, 'reopen', (i) => {
      if (!i.done_at) throw conflict('Esta idea no está realizada.');
    }, { done_at: null });
    res.json({ idea });
  });

  r.delete('/ideas/:id', edit, requireFlag('can_delete'), async (req, res) => {
    const keys = await db.tx(async (q) => {
      const before = await lock(q, req.params.id);
      const k = await files.removeOwnerRows(q, ['idea_ref', 'idea_result'], before.id);
      await q.query('DELETE FROM ideas WHERE id = $1', [before.id]);
      await logActivity(q, { actorId: req.user.id, entityType: 'idea', entityId: before.id, action: 'delete', diff: { text: { from: before.text, to: null } } });
      return k;
    });
    await files.purgeKeys(keys);
    res.json({ ok: true });
  });

  return r;
}
```

Modify `backend/src/buildApp.js`:
```js
import { createIdeasRepo } from './repo/ideas.js';
import { createIdeasRouter } from './routes/ideas.js';
// dentro:
  const ideasRepo = createIdeasRepo(db);
// montaje, después de files:
  api.use(createIdeasRouter({ db, ideasRepo, clientsRepo, activityRepo, files }));
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat: ideas de contenido — alta, edición, decidir, realizar con link, reabrir, historial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Calendario de redes (piezas)

**Files:**
- Create: `backend/src/repo/calendar.js`, `backend/src/routes/calendar.js`
- Modify: `backend/src/buildApp.js`
- Test: `backend/test/calendar.test.js`

**Interfaces:**
- Consumes: `deriveIdeaStatus`, `CHANNELS`, `files`, `logActivity`, `diffFields`.
- Produces: `createCalendarRepo(db) → { range(from, to), get(id) }` — ítems `{ id, date, title, channels, idea_id, idea: { id, text, status } | null, copy, piece_url, refs, status, sort, preview_count, created_at, updated_at }`.
- Produces endpoints: `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD → { items }` (cada uno con `previews: FileDTO[]`; rango ≤ 62 días), `GET /api/calendar/:id → { item }`, `POST /api/calendar → 201 { item }`, `PATCH /api/calendar/:id → { item }`, `DELETE /api/calendar/:id`.

- [ ] **Step 1: Test que falla**

`backend/test/calendar.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { insertIdea, PNG_1x1 } from './helpers/fixtures.js';

let ctx, admin, equipo, lectura;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin' })).agent;
  equipo = (await ctx.asUser({ template: 'equipo' })).agent;
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
});
afterAll(() => ctx.close());

describe('calendario', () => {
  it('crea una pieza con canales e idea vinculada', async () => {
    const idea = await insertIdea(ctx.db, { decision: 'yes' });
    const res = await equipo.post('/api/calendar').send({ date: '2026-10-10', title: 'Reel cliente POSTA', channels: ['ig_reel', 'tiktok'], idea_id: idea.id });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ date: '2026-10-10', status: 'draft', channels: ['ig_reel', 'tiktok'], idea: { id: idea.id, status: 'por_hacer' }, previews: [] });
  });

  it('varias piezas el mismo día, ordenadas', async () => {
    await equipo.post('/api/calendar').send({ date: '2026-10-08', title: 'Historia 1', channels: ['ig_story'] });
    await equipo.post('/api/calendar').send({ date: '2026-10-08', title: 'Historia 2', channels: ['ig_story'] });
    const { body } = await lectura.get('/api/calendar?from=2026-10-01&to=2026-10-31');
    expect(body.items.filter((i) => i.date === '2026-10-08').map((i) => i.title)).toEqual(['Historia 1', 'Historia 2']);
  });

  it('valida canal, link, idea y rango', async () => {
    const bad = await equipo.post('/api/calendar').send({ date: '2026-10-10', channels: ['facebook'], piece_url: 'nope' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['channels.0', 'piece_url']));
    const noIdea = await equipo.post('/api/calendar').send({ date: '2026-10-10', idea_id: '00000000-0000-0000-0000-000000000000' });
    expect(noIdea.status).toBe(400);
    expect(noIdea.body.error.fields.idea_id).toBe('Esa idea no existe');
    expect((await equipo.get('/api/calendar?from=2026-01-01&to=2026-12-31')).status).toBe(400);
    expect((await equipo.get('/api/calendar?from=2026-10-31&to=2026-10-01')).status).toBe(400);
    expect((await equipo.get('/api/calendar')).status).toBe(400);
  });

  it('editar estado, copy y link; queda en el historial', async () => {
    const item = (await equipo.post('/api/calendar').send({ date: '2026-10-14', title: 'Carrusel gastronomía' })).body.item;
    const res = await equipo.patch(`/api/calendar/${item.id}`).send({ status: 'ready', copy: 'Uniformá tu cocina 👨‍🍳\n#gastronomía', piece_url: 'https://drive.google.com/file/d/abc' });
    expect(res.body.item).toMatchObject({ status: 'ready', copy: 'Uniformá tu cocina 👨‍🍳\n#gastronomía' });
    const { rows } = await ctx.db.query(`SELECT action, diff FROM activity_log WHERE entity_type = 'calendar_item' AND entity_id = $1 ORDER BY id`, [item.id]);
    expect(rows.map((r) => r.action)).toEqual(['create', 'update']);
    expect(rows[1].diff.status).toEqual({ from: 'draft', to: 'ready' });
  });

  it('previsualizaciones vienen con la pieza', async () => {
    const item = (await equipo.post('/api/calendar').send({ date: '2026-10-15', channels: ['ig_post'] })).body.item;
    await equipo.post('/api/files').field('owner_type', 'calendar_preview').field('owner_id', item.id).attach('file', PNG_1x1, 'p.png');
    const { body } = await equipo.get(`/api/calendar/${item.id}`);
    expect(body.item.previews).toHaveLength(1);
    expect(body.item.preview_count).toBe(1);
  });

  it('borrar una idea deja la pieza sin idea, sin romper el calendario', async () => {
    const idea = (await admin.post('/api/ideas').send({ kind: 'idea', format: 'video', category: 'domingo', text: 'x' })).body.idea;
    const item = (await equipo.post('/api/calendar').send({ date: '2026-10-19', idea_id: idea.id })).body.item;
    await admin.delete(`/api/ideas/${idea.id}`);
    const { body } = await equipo.get(`/api/calendar/${item.id}`);
    expect(body.item.idea).toBeNull();
    expect(body.item.idea_id).toBeNull();
  });

  it('permisos: lectura no crea; equipo no borra; admin sí', async () => {
    expect((await lectura.post('/api/calendar').send({ date: '2026-10-10' })).status).toBe(403);
    const item = (await equipo.post('/api/calendar').send({ date: '2026-10-20' })).body.item;
    expect((await equipo.delete(`/api/calendar/${item.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/calendar/${item.id}`)).status).toBe(200);
    expect((await equipo.get(`/api/calendar/${item.id}`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd backend && npx vitest run test/calendar.test.js`
Expected: FAIL — 404 en `/api/calendar`.

- [ ] **Step 3: Implementar**

`backend/src/repo/calendar.js`:
```js
import { deriveIdeaStatus } from '../lib/ideaStatus.js';

const SELECT = `
  SELECT ci.*, i.text AS idea_text, i.kind AS idea_kind, i.decision AS idea_decision, i.done_at AS idea_done_at,
    (SELECT count(*)::int FROM files f WHERE f.owner_type = 'calendar_preview' AND f.owner_id = ci.id) AS preview_count
  FROM calendar_items ci LEFT JOIN ideas i ON i.id = ci.idea_id`;

function shape(r) {
  if (!r) return null;
  const { idea_text, idea_kind, idea_decision, idea_done_at, ...item } = r;
  return {
    ...item,
    idea: r.idea_id ? { id: r.idea_id, text: idea_text, status: deriveIdeaStatus({ kind: idea_kind, decision: idea_decision, done_at: idea_done_at }) } : null,
  };
}

export function createCalendarRepo(db) {
  return {
    async range(from, to) {
      const { rows } = await db.query(`${SELECT} WHERE ci.date BETWEEN $1 AND $2 ORDER BY ci.date, ci.sort, ci.created_at`, [from, to]);
      return rows.map(shape);
    },
    async get(id) {
      const { rows } = await db.query(`${SELECT} WHERE ci.id = $1`, [id]);
      return shape(rows[0]);
    },
  };
}
```

`backend/src/routes/calendar.js`:
```js
import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid, dateStr, optionalUrl, nullableText } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { buildInsert, buildUpdate, pick } from '../lib/sql.js';
import { CHANNELS } from '../lib/channels.js';
import { requirePermission, requireFlag } from '../services/permissions.js';
import { logActivity, diffFields } from '../services/activity.js';

const FIELDS = {
  date: dateStr,
  title: z.string().trim().max(300),
  channels: z.array(z.enum(CHANNELS)).max(4),
  idea_id: uuid.nullish(),
  copy: nullableText(5000),
  piece_url: optionalUrl,
  refs: nullableText(5000),
  status: z.enum(['draft', 'ready', 'published']),
  sort: z.number().int().min(0).max(1000),
};
const createSchema = z.object({ ...FIELDS, title: FIELDS.title.default(''), channels: FIELDS.channels.default([]), status: FIELDS.status.default('draft') }).omit({ sort: true });
const updateSchema = z.object(FIELDS).partial();
const rangeSchema = z.object({ from: dateStr, to: dateStr });
const EDITABLE = Object.keys(FIELDS);
const DAY = 86_400_000;

export function createCalendarRouter({ db, calendarRepo, files }) {
  const r = Router();
  const view = requirePermission('calendar', 'view');
  const edit = requirePermission('calendar', 'edit');

  async function withPreviews(items) {
    const previews = await files.listFor(['calendar_preview'], items.map((i) => i.id));
    return items.map((i) => ({ ...i, previews: previews.filter((p) => p.owner_id === i.id) }));
  }

  async function detail(id) {
    const item = await calendarRepo.get(id);
    if (!item) throw notFound('No existe esa pieza.');
    return (await withPreviews([item]))[0];
  }

  async function assertIdea(q, ideaId) {
    if (!ideaId) return;
    const { rows } = await q.query('SELECT id FROM ideas WHERE id = $1', [ideaId]);
    if (!rows[0]) throw badRequest('Esa idea no existe.', { idea_id: 'Esa idea no existe' });
  }

  r.get('/calendar', view, async (req, res) => {
    const { from, to } = parse(rangeSchema, req.query);
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;
    if (days < 0) throw badRequest('La fecha "hasta" tiene que ser posterior a "desde".');
    if (days > 62) throw badRequest('El rango máximo es de 62 días.');
    res.json({ items: await withPreviews(await calendarRepo.range(from, to)) });
  });

  r.get('/calendar/:id', view, async (req, res) => res.json({ item: await detail(req.params.id) }));

  r.post('/calendar', edit, async (req, res) => {
    const b = parse(createSchema, req.body);
    const id = await db.tx(async (q) => {
      await assertIdea(q, b.idea_id);
      const { rows: [{ n }] } = await q.query('SELECT count(*)::int AS n FROM calendar_items WHERE date = $1', [b.date]);
      const ins = buildInsert('calendar_items', { ...b, idea_id: b.idea_id ?? null, sort: n, created_by: req.user.id });
      const { rows } = await q.query(ins.text, ins.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'calendar_item', entityId: rows[0].id, action: 'create' });
      return rows[0].id;
    });
    res.status(201).json({ item: await detail(id) });
  });

  r.patch('/calendar/:id', edit, async (req, res) => {
    const b = parse(updateSchema, req.body);
    await db.tx(async (q) => {
      const { rows } = await q.query('SELECT * FROM calendar_items WHERE id = $1 FOR UPDATE', [req.params.id]);
      const before = rows[0];
      if (!before) throw notFound('No existe esa pieza.');
      if (b.idea_id) await assertIdea(q, b.idea_id);
      const changed = diffFields(before, pick(b, EDITABLE), EDITABLE);
      if (!Object.keys(changed).length) return;
      const upd = buildUpdate('calendar_items', before.id, Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])));
      await q.query(upd.text, upd.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'calendar_item', entityId: before.id, action: 'update', diff: changed });
    });
    res.json({ item: await detail(req.params.id) });
  });

  r.delete('/calendar/:id', edit, requireFlag('can_delete'), async (req, res) => {
    const keys = await db.tx(async (q) => {
      const { rows } = await q.query('DELETE FROM calendar_items WHERE id = $1 RETURNING id, title', [req.params.id]);
      if (!rows[0]) throw notFound('No existe esa pieza.');
      const k = await files.removeOwnerRows(q, ['calendar_preview'], rows[0].id);
      await logActivity(q, { actorId: req.user.id, entityType: 'calendar_item', entityId: rows[0].id, action: 'delete', diff: { title: { from: rows[0].title, to: null } } });
      return k;
    });
    await files.purgeKeys(keys);
    res.json({ ok: true });
  });

  return r;
}
```

Modify `backend/src/buildApp.js`:
```js
import { createCalendarRepo } from './repo/calendar.js';
import { createCalendarRouter } from './routes/calendar.js';
// dentro:
  const calendarRepo = createCalendarRepo(db);
// montaje, después de ideas:
  api.use(createCalendarRouter({ db, calendarRepo, files }));
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat: calendario de redes — piezas con canales, copy, estado, idea vinculada y previsualizaciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Proyectos, tareas y novedades

**Files:**
- Create: `backend/src/repo/projects.js`, `backend/src/routes/projects.js`
- Modify: `backend/src/buildApp.js`
- Test: `backend/test/projects.test.js`

**Interfaces:**
- Produces: `createProjectsRepo(db) → { list(), get(id), tasks(projectId), task(q, id), updates(projectId) }`. `list()` incluye `task_total`, `task_done`. Tareas: `{ id, project_id, text, due_date, done, done_at, sort, assignee_ids: string[] }` (abiertas primero). Novedades: `{ id, body, created_at, author_id, author_name, author_color }`.
- Produces endpoints: `GET /api/projects → { projects }`, `GET /api/projects/:id → { project }` (con `tasks`, `updates`, `photos`, `pdfs`), `GET /api/projects/:id/activity`, `POST /api/projects`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id`, `POST /api/projects/:id/tasks → 201 { task }`, `PATCH /api/tasks/:id → { task }`, `DELETE /api/tasks/:id`, `POST /api/projects/:id/updates → 201 { update }`, `DELETE /api/updates/:id`.

- [ ] **Step 1: Test que falla**

`backend/test/projects.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { PNG_1x1, PDF_MIN } from './helpers/fixtures.js';

let ctx, admin, equipo, equipoUser, lectura, bauti;
beforeAll(async () => {
  ctx = await createTestContext();
  admin = (await ctx.asUser({ template: 'admin', name: 'Joaco' })).agent;
  ({ agent: equipo, user: equipoUser } = await ctx.asUser({ template: 'equipo', name: 'Sofi' }));
  lectura = (await ctx.asUser({ template: 'lectura' })).agent;
  bauti = await ctx.createUser({ template: 'equipo', name: 'Bauti' });
});
afterAll(() => ctx.close());

const goal = 'Rediseñar la web:\n- rubros\n- catálogo 👕\n\nCon simulador.';

describe('proyectos', () => {
  let project;

  it('crea un proyecto con textos largos intactos', async () => {
    const res = await equipo.post('/api/projects').send({ name: 'Rediseño web', status: 'active', start_date: '2026-10-01', end_date: '2026-11-30', goal_text: goal });
    expect(res.status).toBe(201);
    project = res.body.project;
    expect(project).toMatchObject({ name: 'Rediseño web', goal_text: goal, doing_text: '', tasks: [], updates: [], photos: [], pdfs: [] });
  });

  it('cierre antes que inicio → 400', async () => {
    const res = await equipo.post('/api/projects').send({ name: 'X', start_date: '2026-10-10', end_date: '2026-10-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.end_date).toBe('Anterior al inicio');
    const p = (await equipo.post('/api/projects').send({ name: 'Y', start_date: '2026-10-10' })).body.project;
    expect((await equipo.patch(`/api/projects/${p.id}`).send({ end_date: '2026-10-01' })).status).toBe(400);
  });

  it('tareas con varias personas, fecha límite y check', async () => {
    const t = await equipo.post(`/api/projects/${project.id}/tasks`).send({ text: 'Armar catálogo', due_date: '2026-10-20', assignee_ids: [equipoUser.id, bauti.id] });
    expect(t.status).toBe(201);
    expect(t.body.task.assignee_ids.sort()).toEqual([equipoUser.id, bauti.id].sort());
    await equipo.post(`/api/projects/${project.id}/tasks`).send({ text: 'Fotos de producto' });
    const done = await equipo.patch(`/api/tasks/${t.body.task.id}`).send({ done: true, assignee_ids: [bauti.id] });
    expect(done.body.task).toMatchObject({ done: true, assignee_ids: [bauti.id] });
    expect(done.body.task.done_at).toBeTruthy();
    const { body } = await lectura.get(`/api/projects/${project.id}`);
    expect(body.project.tasks.map((x) => x.text)).toEqual(['Fotos de producto', 'Armar catálogo']); // abiertas primero
    const list = (await lectura.get('/api/projects')).body.projects;
    expect(list.find((p) => p.id === project.id)).toMatchObject({ task_total: 2, task_done: 1 });
    const undone = await equipo.patch(`/api/tasks/${t.body.task.id}`).send({ done: false });
    expect(undone.body.task.done_at).toBeNull();
  });

  it('asignar a un usuario inexistente o desactivado → 400', async () => {
    const off = await ctx.createUser({ template: 'equipo' });
    await ctx.usersRepo.update(off.id, { is_active: false });
    const res = await equipo.post(`/api/projects/${project.id}/tasks`).send({ text: 'x', assignee_ids: [off.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.assignee_ids).toBe('Hay una persona que no existe o está desactivada');
  });

  it('novedades con autor; solo el autor o quien puede borrar las elimina', async () => {
    const u = await equipo.post(`/api/projects/${project.id}/updates`).send({ body: 'Primera reunión con el diseñador ✅' });
    expect(u.status).toBe(201);
    expect(u.body.update).toMatchObject({ author_name: 'Sofi', body: 'Primera reunión con el diseñador ✅' });
    const { agent: otro } = await ctx.asUser({ template: 'equipo' });
    expect((await otro.delete(`/api/updates/${u.body.update.id}`)).status).toBe(403);
    expect((await equipo.delete(`/api/updates/${u.body.update.id}`)).status).toBe(200);
  });

  it('fotos y PDFs aparecen en el detalle', async () => {
    await equipo.post('/api/files').field('owner_type', 'project_photo').field('owner_id', project.id).attach('file', PNG_1x1, 'f.png');
    await equipo.post('/api/files').field('owner_type', 'project_pdf').field('owner_id', project.id).attach('file', PDF_MIN, 'brief.pdf');
    const { body } = await equipo.get(`/api/projects/${project.id}`);
    expect(body.project.photos).toHaveLength(1);
    expect(body.project.pdfs[0].original_name).toBe('brief.pdf');
  });

  it('cambio de estado queda en el historial', async () => {
    await equipo.patch(`/api/projects/${project.id}`).send({ status: 'done' });
    const { body } = await equipo.get(`/api/projects/${project.id}/activity`);
    expect(body.activity[0]).toMatchObject({ action: 'update', diff: { status: { from: 'active', to: 'done' } } });
  });

  it('permisos: lectura no crea; equipo no borra; admin borra con todo', async () => {
    expect((await lectura.post('/api/projects').send({ name: 'Z' })).status).toBe(403);
    expect((await equipo.delete(`/api/projects/${project.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/projects/${project.id}`)).status).toBe(200);
    expect((await equipo.get(`/api/projects/${project.id}`)).status).toBe(404);
    const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM files WHERE owner_id = $1', [project.id]);
    expect(rows[0].n).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd backend && npx vitest run test/projects.test.js`
Expected: FAIL — 404 en `/api/projects`.

- [ ] **Step 3: Implementar**

`backend/src/repo/projects.js`:
```js
const TASKS = `
  SELECT t.*, COALESCE(array_agg(ta.user_id::text) FILTER (WHERE ta.user_id IS NOT NULL), '{}') AS assignee_ids
  FROM project_tasks t LEFT JOIN task_assignees ta ON ta.task_id = t.id`;

export function createProjectsRepo(db) {
  return {
    async list() {
      const { rows } = await db.query(`
        SELECT p.*, count(t.id)::int AS task_total, (count(t.id) FILTER (WHERE t.done))::int AS task_done
        FROM projects p LEFT JOIN project_tasks t ON t.project_id = p.id
        GROUP BY p.id
        ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'proposal' THEN 2 ELSE 3 END, p.updated_at DESC`);
      return rows;
    },
    async get(id) {
      const { rows } = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
      return rows[0] ?? null;
    },
    async tasks(projectId) {
      const { rows } = await db.query(`${TASKS} WHERE t.project_id = $1 GROUP BY t.id ORDER BY t.done, t.sort, t.created_at`, [projectId]);
      return rows;
    },
    async task(q, id) {
      const { rows } = await q.query(`${TASKS} WHERE t.id = $1 GROUP BY t.id`, [id]);
      return rows[0] ?? null;
    },
    async updates(projectId) {
      const { rows } = await db.query(
        `SELECT u.id, u.body, u.created_at, u.author_id, us.name AS author_name, us.avatar_color AS author_color
         FROM project_updates u LEFT JOIN users us ON us.id = u.author_id
         WHERE u.project_id = $1 ORDER BY u.created_at DESC`,
        [projectId],
      );
      return rows;
    },
  };
}
```

`backend/src/routes/projects.js`:
```js
import { Router } from 'express';
import { z } from 'zod';
import { parse, uuid, dateStr } from '../lib/validate.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { buildInsert, buildUpdate, pick } from '../lib/sql.js';
import { requirePermission, requireFlag } from '../services/permissions.js';
import { logActivity, diffFields } from '../services/activity.js';

const longText = z.string().max(20000);
const PROJECT = {
  name: z.string().trim().min(1, 'Poné un nombre').max(120),
  status: z.enum(['active', 'proposal', 'upcoming', 'done']),
  start_date: dateStr.nullish(),
  end_date: dateStr.nullish(),
  goal_text: longText,
  doing_text: longText,
  how_text: longText,
};
const createSchema = z.object({
  ...PROJECT, status: PROJECT.status.default('active'), goal_text: longText.default(''), doing_text: longText.default(''), how_text: longText.default(''),
});
const updateSchema = z.object(PROJECT).partial();
const TASK = {
  text: z.string().trim().min(1, 'Escribí la tarea').max(1000),
  due_date: dateStr.nullish(),
  assignee_ids: z.array(uuid).max(20),
  done: z.boolean(),
  sort: z.number().int().min(0).max(10000),
};
const taskCreateSchema = z.object({ text: TASK.text, due_date: TASK.due_date, assignee_ids: TASK.assignee_ids.default([]) });
const taskUpdateSchema = z.object(TASK).partial();
const updateBodySchema = z.object({ body: z.string().trim().min(1, 'Escribí la novedad').max(10000) });

function checkDates({ start_date, end_date }) {
  if (start_date && end_date && end_date < start_date) {
    throw badRequest('La fecha de cierre no puede ser anterior al inicio.', { end_date: 'Anterior al inicio' });
  }
}

export function createProjectsRouter({ db, projectsRepo, activityRepo, files }) {
  const r = Router();
  const view = requirePermission('projects', 'view');
  const edit = requirePermission('projects', 'edit');
  const touch = (q, id) => q.query('UPDATE projects SET updated_at = now() WHERE id = $1', [id]);

  async function mustProject(id) {
    const p = await projectsRepo.get(id);
    if (!p) throw notFound('No existe ese proyecto.');
    return p;
  }

  async function detail(id) {
    const p = await mustProject(id);
    const [tasks, updates, all] = await Promise.all([
      projectsRepo.tasks(id), projectsRepo.updates(id), files.listFor(['project_photo', 'project_pdf'], [id]),
    ]);
    return { ...p, tasks, updates, photos: all.filter((f) => f.owner_type === 'project_photo'), pdfs: all.filter((f) => f.owner_type === 'project_pdf') };
  }

  async function assertAssignees(q, ids) {
    if (!ids?.length) return;
    const { rows } = await q.query('SELECT count(*)::int AS n FROM users WHERE id = ANY($1) AND is_active', [ids]);
    if (rows[0].n !== new Set(ids).size) {
      throw badRequest('Hay una persona que no existe o está desactivada.', { assignee_ids: 'Hay una persona que no existe o está desactivada' });
    }
  }

  async function setAssignees(q, taskId, ids) {
    await q.query('DELETE FROM task_assignees WHERE task_id = $1', [taskId]);
    for (const userId of new Set(ids)) await q.query('INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)', [taskId, userId]);
  }

  r.get('/projects', view, async (_req, res) => res.json({ projects: await projectsRepo.list() }));
  r.get('/projects/:id', view, async (req, res) => res.json({ project: await detail(req.params.id) }));
  r.get('/projects/:id/activity', view, async (req, res) => res.json({ activity: await activityRepo.listFor('project', req.params.id) }));

  r.post('/projects', edit, async (req, res) => {
    const b = parse(createSchema, req.body);
    checkDates(b);
    const id = await db.tx(async (q) => {
      const ins = buildInsert('projects', { ...b, start_date: b.start_date ?? null, end_date: b.end_date ?? null, created_by: req.user.id });
      const { rows } = await q.query(ins.text, ins.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: rows[0].id, action: 'create' });
      return rows[0].id;
    });
    res.status(201).json({ project: await detail(id) });
  });

  r.patch('/projects/:id', edit, async (req, res) => {
    const b = parse(updateSchema, req.body);
    await db.tx(async (q) => {
      const { rows } = await q.query('SELECT * FROM projects WHERE id = $1 FOR UPDATE', [req.params.id]);
      const before = rows[0];
      if (!before) throw notFound('No existe ese proyecto.');
      checkDates({ ...before, ...b });
      const changed = diffFields(before, b, Object.keys(PROJECT));
      if (!Object.keys(changed).length) return;
      const upd = buildUpdate('projects', before.id, Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])));
      await q.query(upd.text, upd.params);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: before.id, action: 'update', diff: changed });
    });
    res.json({ project: await detail(req.params.id) });
  });

  r.delete('/projects/:id', edit, requireFlag('can_delete'), async (req, res) => {
    const keys = await db.tx(async (q) => {
      const { rows } = await q.query('DELETE FROM projects WHERE id = $1 RETURNING id, name', [req.params.id]);
      if (!rows[0]) throw notFound('No existe ese proyecto.');
      const k = await files.removeOwnerRows(q, ['project_photo', 'project_pdf'], rows[0].id);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: rows[0].id, action: 'delete', diff: { name: { from: rows[0].name, to: null } } });
      return k;
    });
    await files.purgeKeys(keys);
    res.json({ ok: true });
  });

  r.post('/projects/:id/tasks', edit, async (req, res) => {
    const b = parse(taskCreateSchema, req.body);
    const project = await mustProject(req.params.id);
    const task = await db.tx(async (q) => {
      await assertAssignees(q, b.assignee_ids);
      const { rows: [{ next }] } = await q.query('SELECT COALESCE(max(sort), -1) + 1 AS next FROM project_tasks WHERE project_id = $1', [project.id]);
      const ins = buildInsert('project_tasks', { project_id: project.id, text: b.text, due_date: b.due_date ?? null, sort: next });
      const { rows } = await q.query(ins.text, ins.params);
      await setAssignees(q, rows[0].id, b.assignee_ids);
      await touch(q, project.id);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: project.id, action: 'task_create', diff: { task: { from: null, to: b.text } } });
      return projectsRepo.task(q, rows[0].id);
    });
    res.status(201).json({ task });
  });

  r.patch('/tasks/:id', edit, async (req, res) => {
    const b = parse(taskUpdateSchema, req.body);
    const task = await db.tx(async (q) => {
      const before = await projectsRepo.task(q, req.params.id);
      if (!before) throw notFound('No existe esa tarea.');
      const values = pick(b, ['text', 'due_date', 'done', 'sort']);
      if (b.done !== undefined && b.done !== before.done) values.done_at = b.done ? new Date() : null;
      const upd = buildUpdate('project_tasks', before.id, values);
      await q.query(upd.text, upd.params);
      if (b.assignee_ids) {
        await assertAssignees(q, b.assignee_ids);
        await setAssignees(q, before.id, b.assignee_ids);
      }
      await touch(q, before.project_id);
      const diff = diffFields(before, { ...pick(b, ['text', 'due_date', 'done']), ...(b.assignee_ids ? { assignee_ids: [...b.assignee_ids].sort() } : {}) },
        ['text', 'due_date', 'done', 'assignee_ids']);
      if (Object.keys(diff).length) {
        await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: before.project_id, action: 'task_update', diff: { ...diff, task: { from: before.text, to: before.text } } });
      }
      return projectsRepo.task(q, before.id);
    });
    res.json({ task });
  });

  r.delete('/tasks/:id', edit, requireFlag('can_delete'), async (req, res) => {
    await db.tx(async (q) => {
      const { rows } = await q.query('DELETE FROM project_tasks WHERE id = $1 RETURNING project_id, text', [req.params.id]);
      if (!rows[0]) throw notFound('No existe esa tarea.');
      await touch(q, rows[0].project_id);
      await logActivity(q, { actorId: req.user.id, entityType: 'project', entityId: rows[0].project_id, action: 'task_delete', diff: { task: { from: rows[0].text, to: null } } });
    });
    res.json({ ok: true });
  });

  r.post('/projects/:id/updates', edit, async (req, res) => {
    const { body } = parse(updateBodySchema, req.body);
    const project = await mustProject(req.params.id);
    const id = await db.tx(async (q) => {
      const { rows } = await q.query('INSERT INTO project_updates (project_id, author_id, body) VALUES ($1, $2, $3) RETURNING id', [project.id, req.user.id, body]);
      await touch(q, project.id);
      return rows[0].id;
    });
    const update = (await projectsRepo.updates(project.id)).find((u) => u.id === id);
    res.status(201).json({ update });
  });

  r.delete('/updates/:id', edit, async (req, res) => {
    const { rows } = await db.query('SELECT id, author_id FROM project_updates WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('No existe esa novedad.');
    if (rows[0].author_id !== req.user.id && !req.user.can_delete) {
      throw forbidden('Solo el autor o alguien con permiso de borrar puede eliminar esta novedad.');
    }
    await db.query('DELETE FROM project_updates WHERE id = $1', [rows[0].id]);
    res.json({ ok: true });
  });

  return r;
}
```

Modify `backend/src/buildApp.js`:
```js
import { createProjectsRepo } from './repo/projects.js';
import { createProjectsRouter } from './routes/projects.js';
// dentro:
  const projectsRepo = createProjectsRepo(db);
// montaje, después de calendar:
  api.use(createProjectsRouter({ db, projectsRepo, activityRepo, files }));
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat: proyectos con tareas multi-asignadas, novedades, fotos y PDFs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Inicio (resumen de la semana)

**Files:**
- Create: `backend/src/lib/dates.js`, `backend/src/repo/home.js`, `backend/src/routes/home.js`
- Modify: `backend/src/buildApp.js`
- Test: `backend/test/dates.test.js`, `backend/test/home.test.js`

**Interfaces:**
- Produces (`dates.js`): `todayART(now = new Date()) → 'YYYY-MM-DD'`, `addDays(date, n)`, `weekdayOf(date) → 0..6` (0 = domingo), `weekRange(date) → { start, end, days: string[7] }` (lunes a domingo), `artDayStartISO(date) → 'YYYY-MM-DDT00:00:00-03:00'`.
- Produces endpoint `GET /api/home?week=YYYY-MM-DD` (cualquier día de la semana; por defecto hoy en ART) →
```
{
  week: { start, end, days: [{ date, weekday, rules: Rule[], items: [{ id, date, title, channels, status, idea_id, piece_url }], state: 'empty'|'planned'|'ready'|'published' }] | null },
  counters: { new_ideas_week, to_decide, done_week, active_projects },   // null en los que no tenga permiso
  mine: { to_decide: Idea[], to_do: Idea[], tasks: Task[] },
  to_decide: Idea[] | null,
  recently_done: [{ id, text, format, result_url, done_at, thumb_url|null }] | null,
  pending_by_user: [{ user: { id, name, avatar_color }, ideas: Idea[], tasks: Task[] }],
  projects: { active: [{ id, name, task_total, task_done }], proposals: [{ id, name }], upcoming: [{ id, name }] } | null
}
Idea (resumen) = { id, text, kind, format, category, status, due_date, assignee_id, client_name }
Task (resumen) = { id, text, due_date, project_id, project_name, assignee_ids }
```

- [ ] **Step 1: Tests que fallan**

`backend/test/dates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { todayART, weekRange, addDays, weekdayOf } from '../src/lib/dates.js';

describe('fechas', () => {
  it('domingo 23:30 en Argentina sigue siendo domingo', () => {
    expect(todayART(new Date('2026-10-12T02:30:00Z'))).toBe('2026-10-11');
    expect(todayART(new Date('2026-10-12T03:00:00Z'))).toBe('2026-10-12');
  });

  it('semana de lunes a domingo', () => {
    expect(weekRange('2026-10-11')).toMatchObject({ start: '2026-10-05', end: '2026-10-11' }); // domingo
    expect(weekRange('2026-10-05').start).toBe('2026-10-05'); // lunes
    expect(weekRange('2026-10-07').days).toHaveLength(7);
  });

  it('addDays cruza meses y años', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(weekdayOf('2026-10-07')).toBe(3);
  });
});
```

`backend/test/home.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { insertIdea, insertProject, insertCalendarItem } from './helpers/fixtures.js';

let ctx, sofi, santi, bauti, sofiAgent;
beforeAll(async () => {
  ctx = await createTestContext();
  ({ user: sofi, agent: sofiAgent } = await ctx.asUser({ template: 'admin', name: 'Sofi' }));
  santi = await ctx.createUser({ template: 'equipo', name: 'Santi' });
  bauti = await ctx.createUser({ template: 'equipo', name: 'Bauti' });
  const db = ctx.db;
  // semana del 5 al 11 de octubre de 2026
  await insertIdea(db, { text: 'Lunes 00:30 ART', created_at: '2026-10-05T03:30:00Z', assignee_id: santi.id });
  await insertIdea(db, { text: 'Domingo anterior 23:30 ART', created_at: '2026-10-05T02:30:00Z', assignee_id: santi.id });
  await insertIdea(db, { text: 'Por hacer de Santi', decision: 'yes', assignee_id: santi.id, created_at: '2026-09-01T12:00:00Z' });
  await insertIdea(db, { text: 'Sí o sí de Santi', kind: 'must', due_date: '2026-10-09', assignee_id: santi.id, created_at: '2026-09-01T12:00:00Z' });
  await insertIdea(db, { text: 'Hecha', decision: 'yes', done_at: '2026-10-06T15:00:00Z', result_url: 'https://instagram.com/reel/x', created_at: '2026-09-01T12:00:00Z' });
  const active = await insertProject(db, { name: 'Meta Ads', status: 'active' });
  const proposal = await insertProject(db, { name: 'LinkedIn', status: 'proposal' });
  const t1 = (await db.query(`INSERT INTO project_tasks (project_id, text) VALUES ($1, 'Duplicar conjunto a WhatsApp') RETURNING id`, [active.id])).rows[0];
  const t2 = (await db.query(`INSERT INTO project_tasks (project_id, text) VALUES ($1, 'Tarea de propuesta') RETURNING id`, [proposal.id])).rows[0];
  await db.query(`INSERT INTO project_tasks (project_id, text, done) VALUES ($1, 'Hecha', true)`, [active.id]);
  await db.query('INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2), ($1, $3), ($4, $2)', [t1.id, bauti.id, sofi.id, t2.id]);
  await insertCalendarItem(db, { date: '2026-10-06', title: 'Carrusel salud', status: 'ready', channels: ['ig_post'] });
  await insertCalendarItem(db, { date: '2026-10-09', title: 'Reel cliente', status: 'draft' });
  await insertCalendarItem(db, { date: '2026-10-09', title: 'Extra', status: 'published' });
});
afterAll(() => ctx.close());

describe('inicio', () => {
  it('semana con grilla fija y estado de cada día', async () => {
    const { body } = await sofiAgent.get('/api/home?week=2026-10-08');
    expect(body.week).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
    const byDate = Object.fromEntries(body.week.days.map((d) => [d.date, d]));
    expect(byDate['2026-10-06'].rules[0].theme).toBe('Foco por rubro');
    expect(byDate['2026-10-06'].state).toBe('ready');
    expect(byDate['2026-10-09'].state).toBe('planned');
    expect(byDate['2026-10-07'].state).toBe('empty');
    expect(byDate['2026-10-11'].rules[0]).toMatchObject({ theme: 'Humor / trend', time: '20:00' });
  });

  it('contadores de la semana en hora argentina', async () => {
    const { body } = await sofiAgent.get('/api/home?week=2026-10-08');
    // "Lunes 00:30 ART" cuenta; "Domingo anterior 23:30 ART" no. Las demás se crearon en septiembre.
    expect(body.counters.new_ideas_week).toBe(1);
    expect(body.counters.done_week).toBe(1);
    expect(body.counters.to_decide).toBe(2);
    expect(body.counters.active_projects).toBe(1);
  });

  it('pendientes por persona: solo usuarios activos y tareas de proyectos activos', async () => {
    const off = await ctx.createUser({ template: 'equipo', name: 'Agus' });
    await ctx.usersRepo.update(off.id, { is_active: false });
    const { body } = await sofiAgent.get('/api/home');
    const names = body.pending_by_user.map((p) => p.user.name);
    expect(names).not.toContain('Agus');
    const bautiCol = body.pending_by_user.find((p) => p.user.id === bauti.id);
    expect(bautiCol.tasks.map((t) => t.text)).toEqual(['Duplicar conjunto a WhatsApp']);
    const santiCol = body.pending_by_user.find((p) => p.user.id === santi.id);
    expect(santiCol.ideas.map((i) => i.text).sort()).toEqual(['Por hacer de Santi', 'Sí o sí de Santi']);
  });

  it('"te toca" de cada usuario', async () => {
    const santiAgent = await ctx.agentFor(santi.email);
    const { body } = await santiAgent.get('/api/home');
    expect(body.mine.to_decide.map((i) => i.text).sort()).toEqual(['Domingo anterior 23:30 ART', 'Lunes 00:30 ART']);
    expect(body.mine.to_do.map((i) => i.text).sort()).toEqual(['Por hacer de Santi', 'Sí o sí de Santi']);
    const sofiHome = (await sofiAgent.get('/api/home')).body;
    expect(sofiHome.mine.tasks.map((t) => t.text)).toEqual(['Duplicar conjunto a WhatsApp']);
  });

  it('realizado reciente y proyectos', async () => {
    const { body } = await sofiAgent.get('/api/home');
    expect(body.recently_done[0]).toMatchObject({ text: 'Hecha', result_url: 'https://instagram.com/reel/x', thumb_url: null });
    expect(body.projects.active).toEqual([expect.objectContaining({ name: 'Meta Ads', task_total: 2, task_done: 1 })]);
    expect(body.projects.proposals.map((p) => p.name)).toEqual(['LinkedIn']);
  });

  it('cada bloque respeta los permisos', async () => {
    const { agent } = await ctx.asUser({ template: 'equipo', permissions: { ideas: 'none', projects: 'none' } });
    const { body } = await agent.get('/api/home');
    expect(body.to_decide).toBeNull();
    expect(body.projects).toBeNull();
    expect(body.counters.to_decide).toBeNull();
    expect(body.week).not.toBeNull();
    expect(body.pending_by_user.every((p) => p.ideas.length === 0 && p.tasks.length === 0)).toBe(true);
    const { agent: noHome } = await ctx.asUser({ template: 'equipo', permissions: { home: 'none' } });
    expect((await noHome.get('/api/home')).status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd backend && npx vitest run test/dates.test.js test/home.test.js`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

`backend/src/lib/dates.js`:
```js
// Argentina es UTC−3 fijo (sin horario de verano), así que no hace falta tzdata
const OFFSET_MS = 3 * 60 * 60 * 1000;

export const todayART = (now = new Date()) => new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 10);

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function weekRange(date) {
  const wd = weekdayOf(date);
  const start = addDays(date, wd === 0 ? -6 : 1 - wd);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6], days };
}

export const artDayStartISO = (date) => `${date}T00:00:00-03:00`;
```

`backend/src/repo/home.js`:
```js
import { deriveIdeaStatus } from '../lib/ideaStatus.js';

const IDEA_COLS = `i.id, i.text, i.kind, i.format, i.category, i.decision, i.done_at, i.due_date, i.assignee_id, c.name AS client_name`;
const summarize = ({ decision, done_at, ...rest }) => ({ ...rest, status: deriveIdeaStatus({ kind: rest.kind, decision, done_at }) });

export function createHomeRepo(db) {
  return {
    async rules() {
      const { rows } = await db.query('SELECT weekday, time, theme, format, channels FROM content_rules WHERE active ORDER BY sort');
      return rows;
    },
    async weekItems(start, end) {
      const { rows } = await db.query(
        'SELECT id, date, title, channels, status, idea_id, piece_url FROM calendar_items WHERE date BETWEEN $1 AND $2 ORDER BY date, sort, created_at',
        [start, end],
      );
      return rows;
    },
    async ideaCounters(fromISO, toISO) {
      const { rows } = await db.query(
        `SELECT
           (count(*) FILTER (WHERE created_at >= $1 AND created_at < $2))::int AS new_ideas_week,
           (count(*) FILTER (WHERE kind = 'idea' AND decision = 'pending' AND done_at IS NULL))::int AS to_decide,
           (count(*) FILTER (WHERE done_at >= $1 AND done_at < $2))::int AS done_week
         FROM ideas`,
        [fromISO, toISO],
      );
      return rows[0];
    },
    async toDecide() {
      const { rows } = await db.query(
        `SELECT ${IDEA_COLS} FROM ideas i LEFT JOIN clients c ON c.id = i.client_id
         WHERE i.kind = 'idea' AND i.decision = 'pending' AND i.done_at IS NULL ORDER BY i.created_at DESC LIMIT 50`,
      );
      return rows.map(summarize);
    },
    async openAssignedIdeas() {
      const { rows } = await db.query(
        `SELECT ${IDEA_COLS} FROM ideas i LEFT JOIN clients c ON c.id = i.client_id
         WHERE i.done_at IS NULL AND i.decision <> 'no' AND (i.kind = 'must' OR i.decision = 'yes') AND i.assignee_id IS NOT NULL
         ORDER BY i.due_date NULLS LAST, i.created_at`,
      );
      return rows.map(summarize);
    },
    async recentlyDone(limit = 8) {
      const { rows } = await db.query(
        `SELECT i.id, i.text, i.format, i.result_url, i.done_at,
           (SELECT f.id FROM files f WHERE f.owner_type = 'idea_result' AND f.owner_id = i.id ORDER BY f.sort LIMIT 1) AS thumb_file_id,
           (SELECT f.storage_key FROM files f WHERE f.owner_type = 'idea_result' AND f.owner_id = i.id ORDER BY f.sort LIMIT 1) AS thumb_key
         FROM ideas i WHERE i.done_at IS NOT NULL ORDER BY i.done_at DESC LIMIT $1`,
        [limit],
      );
      return rows;
    },
    async openTasksInActiveProjects() {
      const { rows } = await db.query(
        `SELECT t.id, t.text, t.due_date, p.id AS project_id, p.name AS project_name,
           COALESCE(array_agg(ta.user_id::text) FILTER (WHERE ta.user_id IS NOT NULL), '{}') AS assignee_ids
         FROM project_tasks t
         JOIN projects p ON p.id = t.project_id AND p.status = 'active'
         LEFT JOIN task_assignees ta ON ta.task_id = t.id
         WHERE NOT t.done
         GROUP BY t.id, p.id ORDER BY t.due_date NULLS LAST, t.sort`,
      );
      return rows;
    },
    async projectsSummary() {
      const { rows } = await db.query(
        `SELECT p.id, p.name, p.status, count(t.id)::int AS task_total, (count(t.id) FILTER (WHERE t.done))::int AS task_done
         FROM projects p LEFT JOIN project_tasks t ON t.project_id = p.id
         WHERE p.status <> 'done' GROUP BY p.id ORDER BY p.updated_at DESC`,
      );
      return rows;
    },
    async activeUsers() {
      const { rows } = await db.query('SELECT id, name, avatar_color FROM users WHERE is_active ORDER BY lower(name)');
      return rows;
    },
  };
}
```

`backend/src/routes/home.js`:
```js
import { Router } from 'express';
import { z } from 'zod';
import { parse, dateStr } from '../lib/validate.js';
import { todayART, weekRange, weekdayOf, addDays, artDayStartISO } from '../lib/dates.js';
import { hasLevel, requirePermission } from '../services/permissions.js';

function dayState(items) {
  if (!items.length) return 'empty';
  if (items.every((i) => i.status === 'published')) return 'published';
  if (items.every((i) => i.status !== 'draft')) return 'ready';
  return 'planned';
}

export function createHomeRouter({ homeRepo, storage }) {
  const r = Router();

  r.get('/home', requirePermission('home', 'view'), async (req, res) => {
    const { week } = parse(z.object({ week: dateStr.optional() }), req.query);
    const range = weekRange(week ?? todayART());
    const u = req.user;
    const can = { ideas: hasLevel(u, 'ideas', 'view'), calendar: hasLevel(u, 'calendar', 'view'), projects: hasLevel(u, 'projects', 'view') };
    const fromISO = artDayStartISO(range.start);
    const toISO = artDayStartISO(addDays(range.end, 1));

    const [rules, items, counters, toDecide, openIdeas, done, tasks, projects, users] = await Promise.all([
      can.calendar ? homeRepo.rules() : null,
      can.calendar ? homeRepo.weekItems(range.start, range.end) : null,
      can.ideas ? homeRepo.ideaCounters(fromISO, toISO) : null,
      can.ideas ? homeRepo.toDecide() : null,
      can.ideas ? homeRepo.openAssignedIdeas() : [],
      can.ideas ? homeRepo.recentlyDone() : null,
      can.projects ? homeRepo.openTasksInActiveProjects() : [],
      can.projects ? homeRepo.projectsSummary() : null,
      homeRepo.activeUsers(),
    ]);

    res.json({
      week: {
        start: range.start,
        end: range.end,
        days: can.calendar
          ? range.days.map((date) => {
            const dayItems = items.filter((i) => i.date === date);
            return { date, weekday: weekdayOf(date), rules: rules.filter((x) => x.weekday === weekdayOf(date)), items: dayItems, state: dayState(dayItems) };
          })
          : null,
      },
      counters: {
        new_ideas_week: counters?.new_ideas_week ?? null,
        to_decide: counters?.to_decide ?? null,
        done_week: counters?.done_week ?? null,
        active_projects: projects ? projects.filter((p) => p.status === 'active').length : null,
      },
      mine: {
        to_decide: (toDecide ?? []).filter((i) => i.assignee_id === u.id),
        to_do: openIdeas.filter((i) => i.assignee_id === u.id),
        tasks: tasks.filter((t) => t.assignee_ids.includes(u.id)),
      },
      to_decide: toDecide,
      recently_done: done
        ? await Promise.all(done.map(async ({ thumb_file_id, thumb_key, ...d }) => ({
          ...d, thumb_url: thumb_file_id ? await storage.urlFor({ id: thumb_file_id, storage_key: thumb_key }) : null,
        })))
        : null,
      pending_by_user: users.map((user) => ({
        user,
        ideas: openIdeas.filter((i) => i.assignee_id === user.id),
        tasks: tasks.filter((t) => t.assignee_ids.includes(user.id)),
      })),
      projects: projects
        ? {
          active: projects.filter((p) => p.status === 'active').map(({ id, name, task_total, task_done }) => ({ id, name, task_total, task_done })),
          proposals: projects.filter((p) => p.status === 'proposal').map(({ id, name }) => ({ id, name })),
          upcoming: projects.filter((p) => p.status === 'upcoming').map(({ id, name }) => ({ id, name })),
        }
        : null,
    });
  });

  return r;
}
```

Modify `backend/src/buildApp.js`:
```js
import { createHomeRepo } from './repo/home.js';
import { createHomeRouter } from './routes/home.js';
// montaje, después de projects:
  api.use(createHomeRouter({ homeRepo: createHomeRepo(db), storage }));
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat: Inicio — semana con grilla fija, contadores en hora argentina, pendientes por persona

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Migración de los datos del prototipo

**Files:**
- Create: `backend/src/migration/importPrototype.js`, `backend/scripts/migrateFromPrototype.js`
- Test: `backend/test/importPrototype.test.js`

**Interfaces:**
- Produces: `importPrototype(db, data, { users, defaultAssignee = 'Santi', creator = 'Sofi' }) → { ideas, projects, tasks, calendar, skipped }` — `users` = `{ Sofi: uuid, Santi: uuid, Bauti: uuid }`. Idempotente por `legacy_id` (`idea:<id>`, `project:<id>`, `task:<projectId>:<taskId>`, `cal:<YYYY-MM-DD>`).
- Formato de entrada (`data`): `{ ideas: PrototypeIdea[], proyectos: PrototypeProject[] (con tareas: []), calendar: PrototypeDay[] | Record<fecha, PrototypeDay> }` con los nombres de campos del spec §5 del brief de Sofi.
- CLI: `node scripts/migrateFromPrototype.js --file <export.json> --map "Sofi=<email>,Santi=<email>,Bauti=<email>"`.

- [ ] **Step 1: Test que falla**

`backend/test/importPrototype.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { importPrototype } from '../src/migration/importPrototype.js';

const data = {
  ideas: [
    { id: 'i1', texto: 'Reel humor delantal', categoria: 'domingo', formato: 'video', encargo: false, decision: 'pendiente', hecha: false, creado: '2026-09-01T12:00:00Z' },
    { id: 'i2', texto: 'Entrega POSTA', categoria: 'viernes', formato: 'video', cliente: 'POSTA', encargo: false, decision: 'si', hecha: true, hechaEn: '2026-09-10T15:00:00Z', linkResultado: 'https://drive.google.com/x', nota: 'Grabado con Santi\n2 tomas', notaSofi: 'Subir el viernes', creado: '2026-09-02T12:00:00Z' },
    { id: 'i3', texto: 'Fotos catálogo', categoria: 'producto', formato: 'foto', encargo: true, responsable: 'Santi', fechaLimite: '2026-10-20', decision: 'pendiente', hecha: false, link: 'no es un link', creado: '2026-09-03T12:00:00Z' },
    { id: 'i4', texto: 'Algo raro', categoria: 'zzz', formato: 'video', decision: 'no', creado: '2026-09-04T12:00:00Z' },
  ],
  proyectos: [
    { id: 'p1', nombre: 'Rediseño de la web', estado: 'activo', fechaInicio: '2026-09-01', queQueremos: 'Web nueva', tareas: [
      { id: 't1', texto: 'Brief al diseñador', asignados: ['Sofi', 'Bauti'], hecho: false },
      { id: 't2', texto: 'Comprar dominio', asignado: 'Santi y Bauti', hecho: true },
    ] },
    { id: 'p2', nombre: 'LinkedIn', estado: 'propuesta', tareas: [] },
    { id: 'p3', nombre: 'Viejo', estado: 'activo', terminado: true, tareas: [] },
  ],
  calendar: {
    '2026-10-10': { quePublica: 'Reel POSTA', canales: { reelIG: true, tiktok: true, historiasIG: false, posteoIG: false }, linkPieza: 'https://drive.google.com/p', referencias: 'https://a.com\nhttps://b.com' },
    '2026-10-11': { quePublica: '', canales: {}, linkPieza: '', referencias: '' },
  },
};

let ctx, users;
beforeAll(async () => {
  ctx = await createTestContext();
  const mk = (name) => ctx.createUser({ name, template: 'equipo' });
  const [sofi, santi, bauti] = await Promise.all([mk('Sofi'), mk('Santi'), mk('Bauti')]);
  users = { Sofi: sofi.id, Santi: santi.id, Bauti: bauti.id };
});
afterAll(() => ctx.close());

describe('migración del prototipo', () => {
  it('importa todo con los mapeos correctos', async () => {
    const summary = await importPrototype(ctx.db, data, { users });
    expect(summary).toEqual({ ideas: 4, projects: 3, tasks: 2, calendar: 1, skipped: 1 });

    const { rows: ideas } = await ctx.db.query('SELECT i.*, c.name AS client_name FROM ideas i LEFT JOIN clients c ON c.id = i.client_id ORDER BY legacy_id');
    const by = Object.fromEntries(ideas.map((i) => [i.legacy_id, i]));
    expect(by['idea:i1']).toMatchObject({ kind: 'idea', decision: 'pending', category: 'domingo', assignee_id: users.Santi, created_by: users.Sofi });
    expect(by['idea:i2']).toMatchObject({ decision: 'yes', client_name: 'POSTA', result_url: 'https://drive.google.com/x', note_santi: 'Grabado con Santi\n2 tomas', note_santi_by: users.Santi, note_sofi_by: users.Sofi });
    expect(by['idea:i2'].done_at).toBeTruthy();
    expect(by['idea:i3']).toMatchObject({ kind: 'must', format: 'photo', due_date: '2026-10-20', reference_url: null });
    expect(by['idea:i4']).toMatchObject({ category: 'otra', decision: 'no' });

    const { rows: projects } = await ctx.db.query('SELECT legacy_id, status, goal_text FROM projects ORDER BY legacy_id');
    expect(projects.map((p) => p.status)).toEqual(['active', 'proposal', 'done']);
    const { rows: assignees } = await ctx.db.query(
      `SELECT t.legacy_id, array_agg(ta.user_id::text ORDER BY ta.user_id) AS ids, bool_and(t.done) AS done
       FROM project_tasks t JOIN task_assignees ta ON ta.task_id = t.id GROUP BY t.legacy_id ORDER BY t.legacy_id`,
    );
    expect(assignees[0].ids.sort()).toEqual([users.Sofi, users.Bauti].sort());
    expect(assignees[1]).toMatchObject({ done: true });
    expect(assignees[1].ids.sort()).toEqual([users.Santi, users.Bauti].sort());

    const { rows: cal } = await ctx.db.query('SELECT * FROM calendar_items');
    expect(cal).toHaveLength(1);
    expect(cal[0]).toMatchObject({ date: '2026-10-10', title: 'Reel POSTA', channels: ['ig_reel', 'tiktok'], refs: 'https://a.com\nhttps://b.com', status: 'draft' });
  });

  it('correrla dos veces no duplica', async () => {
    const again = await importPrototype(ctx.db, data, { users });
    expect(again).toEqual({ ideas: 0, projects: 0, tasks: 0, calendar: 0, skipped: 1 });
    const { rows } = await ctx.db.query('SELECT count(*)::int AS n FROM ideas');
    expect(rows[0].n).toBe(4);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd backend && npx vitest run test/importPrototype.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`backend/src/migration/importPrototype.js`:
```js
const isHttp = (v) => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());
const url = (v) => (isHttp(v) ? v.trim() : null);
const dateOnly = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const CHANNEL_MAP = { historiasIG: 'ig_story', posteoIG: 'ig_post', reelIG: 'ig_reel', tiktok: 'tiktok' };
const STATUS_MAP = { activo: 'active', propuesta: 'proposal', proximo: 'upcoming', próximo: 'upcoming', terminado: 'done' };

async function insertIgnore(q, table, values) {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  const { rows } = await q.query(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (legacy_id) DO NOTHING RETURNING id`,
    keys.map((k) => values[k]),
  );
  return rows[0]?.id ?? null;
}

async function upsertClient(q, name) {
  const n = name.trim().replace(/\s+/g, ' ');
  const found = await q.query('SELECT id FROM clients WHERE lower(name) = lower($1)', [n]);
  if (found.rows[0]) return found.rows[0].id;
  return (await q.query('INSERT INTO clients (name) VALUES ($1) RETURNING id', [n])).rows[0].id;
}

export async function importPrototype(db, data, { users, defaultAssignee = 'Santi', creator = 'Sofi' }) {
  const userByName = (n) => {
    const key = Object.keys(users).find((k) => k.toLowerCase() === String(n ?? '').trim().toLowerCase());
    return key ? users[key] : null;
  };
  const namesIn = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/,|\by\b|\//)).map((s) => s.trim()).filter(Boolean);
  const summary = { ideas: 0, projects: 0, tasks: 0, calendar: 0, skipped: 0 };

  await db.tx(async (q) => {
    for (const it of data.ideas ?? []) {
      const kind = it.encargo ? 'must' : 'idea';
      const category = ['domingo', 'viernes', 'producto'].includes(it.categoria) ? it.categoria : 'otra';
      let decision = { si: 'yes', no: 'no' }[it.decision] ?? 'pending';
      if (kind === 'must') decision = 'pending';
      if (it.hecha && kind === 'idea' && decision === 'pending') decision = 'yes';
      const id = await insertIgnore(q, 'ideas', {
        legacy_id: `idea:${it.id}`,
        kind,
        format: it.formato === 'foto' ? 'photo' : 'video',
        category,
        client_id: category === 'viernes' && text(it.cliente) ? await upsertClient(q, it.cliente) : null,
        assignee_id: userByName(it.responsable) ?? userByName(defaultAssignee),
        text: text(it.texto) ?? '(sin texto)',
        reference_url: url(it.link),
        decision,
        done_at: it.hecha ? (it.hechaEn || it.creado || new Date().toISOString()) : null,
        result_url: url(it.linkResultado),
        due_date: kind === 'must' ? dateOnly(it.fechaLimite) : null,
        note_santi: text(it.nota),
        note_santi_by: text(it.nota) ? userByName('Santi') : null,
        note_sofi: text(it.notaSofi),
        note_sofi_by: text(it.notaSofi) ? userByName('Sofi') : null,
        created_by: userByName(creator),
        created_at: it.creado || undefined,
      });
      if (id) summary.ideas++;
    }

    for (const p of data.proyectos ?? []) {
      const projectId = await insertIgnore(q, 'projects', {
        legacy_id: `project:${p.id}`,
        name: text(p.nombre) ?? '(sin nombre)',
        status: p.terminado ? 'done' : STATUS_MAP[p.estado] ?? 'active',
        start_date: dateOnly(p.fechaInicio),
        end_date: dateOnly(p.fechaCierre),
        goal_text: p.queQueremos ?? '',
        doing_text: p.queSeEsta ?? '',
        how_text: p.comoSeVa ?? '',
        created_by: userByName(creator),
        created_at: p.creado || undefined,
      });
      if (!projectId) continue;
      summary.projects++;
      for (const [i, t] of (p.tareas ?? []).entries()) {
        const taskId = await insertIgnore(q, 'project_tasks', {
          legacy_id: `task:${p.id}:${t.id}`,
          project_id: projectId,
          text: text(t.texto) ?? '(sin texto)',
          done: Boolean(t.hecho),
          done_at: t.hecho ? new Date().toISOString() : null,
          sort: i,
          created_at: t.creado || undefined,
        });
        if (!taskId) continue;
        summary.tasks++;
        const ids = new Set([...namesIn(t.asignados), ...namesIn(t.asignado)].map(userByName).filter(Boolean));
        for (const userId of ids) await q.query('INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [taskId, userId]);
      }
    }

    const days = Array.isArray(data.calendar)
      ? data.calendar
      : Object.entries(data.calendar ?? {}).map(([id, d]) => ({ id, ...d }));
    for (const d of days) {
      const date = dateOnly(d.id ?? d.fecha);
      const channels = Object.entries(d.canales ?? {}).filter(([, on]) => on).map(([k]) => CHANNEL_MAP[k]).filter(Boolean);
      const empty = !text(d.quePublica) && !channels.length && !url(d.linkPieza) && !text(d.referencias);
      if (!date || empty) { summary.skipped++; continue; }
      const id = await insertIgnore(q, 'calendar_items', {
        legacy_id: `cal:${date}`,
        date,
        title: d.quePublica ?? '',
        channels,
        piece_url: url(d.linkPieza),
        refs: text(d.referencias),
        status: 'draft',
        created_by: userByName(creator),
      });
      if (id) summary.calendar++;
    }
  });

  return summary;
}
```

`backend/scripts/migrateFromPrototype.js`:
```js
// Uso: node scripts/migrateFromPrototype.js --file export.json --map "Sofi=sofi@x.com,Santi=santi@x.com,Bauti=bauti@x.com"
// Requiere DATABASE_URL. Los usuarios tienen que existir antes (crearlos desde el panel).
import 'dotenv/config';
import fs from 'node:fs/promises';
import { createPgDb } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createUsersRepo } from '../src/repo/users.js';
import { importPrototype } from '../src/migration/importPrototype.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const file = arg('file');
const map = arg('map');
if (!file || !map || !process.env.DATABASE_URL) {
  console.error('Uso: DATABASE_URL=... node scripts/migrateFromPrototype.js --file export.json --map "Sofi=email,Santi=email,Bauti=email"');
  process.exit(1);
}

const db = createPgDb(process.env.DATABASE_URL);
await migrate(db);
const usersRepo = createUsersRepo(db);
const users = {};
const missing = [];
for (const pair of map.split(',')) {
  const [name, email] = pair.split('=').map((s) => s.trim());
  const u = await usersRepo.findByEmail(email);
  if (u) users[name] = u.id;
  else missing.push(`${name} (${email})`);
}
if (missing.length) {
  console.error('No existen estos usuarios, crealos primero desde el panel:', missing.join(', '));
  process.exit(1);
}
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const summary = await importPrototype(db, data, { users });
console.table(summary);
await db.close();
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat: migración idempotente de los datos del prototipo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Arranque del servidor, configuración y documentación

**Files:**
- Create: `backend/src/index.js`, `backend/.env.example`, `README.md`
- Modify: `backend/src/buildApp.js` (verificar que quede como el listado final)
- Test: `backend/test/buildApp.test.js`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: proceso Node que migra, crea el superadmin, sirve API + `frontend/dist`, y reintenta borrados pendientes cada hora.

- [ ] **Step 1: Test que falla**

`backend/test/buildApp.test.js`:
```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDb } from './helpers/testDb.js';
import { buildApp } from '../src/buildApp.js';
import { createLocalStorage } from '../src/services/storage.js';

let db;
afterAll(() => db?.close());

describe('buildApp', () => {
  it('sirve el frontend y su fallback, sin tapar /api ni /health', async () => {
    db = await createTestDb();
    const staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uf-dist-'));
    await fs.writeFile(path.join(staticDir, 'index.html'), '<!doctype html><title>Uniform.ar</title>');
    const app = buildApp({ db, jwtSecret: 'x', storage: createLocalStorage({ dir: os.tmpdir() }), staticDir });
    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.text).toContain('Uniform.ar');
    expect(home.headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/cualquier/ruta')).text).toContain('Uniform.ar');
    expect((await request(app).get('/api/ideas')).status).toBe(401);
    expect((await request(app).get('/health')).body).toEqual({ ok: true, db: true });
    expect(app.locals.files).toBeDefined();
  });

  it('exige jwtSecret y storage', () => {
    expect(() => buildApp({ db, storage: {} })).toThrow('Falta jwtSecret');
    expect(() => buildApp({ db, jwtSecret: 'x' })).toThrow('Falta storage');
  });
});
```

- [ ] **Step 2: Correr y ver el estado**

Run: `cd backend && npx vitest run test/buildApp.test.js`
Expected: PASS si `buildApp.js` quedó como el listado de abajo; si falla, corregir `buildApp.js` hasta que coincida.

`backend/src/buildApp.js` — **listado final completo**:
```js
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

export function buildApp({ db, jwtSecret, storage, secureCookies = false, staticDir, loginLimit = 10 }) {
  if (!jwtSecret) throw new Error('Falta jwtSecret');
  if (!storage) throw new Error('Falta storage');

  const usersRepo = createUsersRepo(db);
  const clientsRepo = createClientsRepo(db);
  const activityRepo = createActivityRepo(db);
  const ideasRepo = createIdeasRepo(db);
  const calendarRepo = createCalendarRepo(db);
  const projectsRepo = createProjectsRepo(db);
  const files = createFilesService({ db, storage });
  const authenticate = createAuthenticate({ usersRepo, secret: jwtSecret, secureCookies });

  const api = Router();
  api.use('/auth', createAuthRouter({ usersRepo, secret: jwtSecret, secureCookies, authenticate, loginLimit }));
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
    health: async () => {
      await db.query('SELECT 1');
      return { db: true };
    },
  });
  app.locals.files = files;
  return app;
}
```

- [ ] **Step 3: Arranque**

`backend/src/index.js`:
```js
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { createPgDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { buildApp } from './buildApp.js';
import { createUsersRepo } from './repo/users.js';
import { ensureSuperadmin } from './services/bootstrap.js';
import { createLocalStorage, createS3Storage } from './services/storage.js';

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta env var: ${k}`);
  return v;
};
const isProd = process.env.NODE_ENV === 'production';
const here = path.dirname(fileURLToPath(import.meta.url));

const jwtSecret = env('JWT_SECRET');
if (isProd && jwtSecret.length < 32) throw new Error('JWT_SECRET tiene que tener al menos 32 caracteres');

const db = createPgDb(env('DATABASE_URL'));
const applied = await migrate(db);
if (applied.length) console.log('[db] migraciones aplicadas:', applied.join(', '));

const driver = process.env.STORAGE_DRIVER ?? (isProd ? 's3' : 'local');
const storage = driver === 's3'
  ? createS3Storage({
    endpoint: env('S3_ENDPOINT'),
    region: process.env.S3_REGION || 'auto',
    bucket: env('S3_BUCKET'),
    accessKeyId: env('S3_ACCESS_KEY_ID'),
    secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
  })
  : createLocalStorage({ dir: process.env.UPLOADS_DIR || path.resolve(here, '../.uploads') });

const admin = await ensureSuperadmin({
  usersRepo: createUsersRepo(db),
  email: process.env.ADMIN_EMAIL || 'jdilernia99@gmail.com',
  password: process.env.ADMIN_INITIAL_PASSWORD,
});
if (!admin) console.warn('[auth] ADMIN_INITIAL_PASSWORD no está definida: no se creó el superadmin');

const distDir = path.resolve(here, '../../frontend/dist');
const app = buildApp({
  db,
  jwtSecret,
  storage,
  secureCookies: isProd,
  staticDir: fs.existsSync(path.join(distDir, 'index.html')) ? distDir : undefined,
});

// Borrados de archivos que fallaron: al arrancar y cada hora
const { files } = app.locals;
const retry = () => files.retryPending()
  .then((n) => n && console.log(`[storage] ${n} borrados pendientes completados`))
  .catch((err) => console.error('[storage] reintento falló:', err.message));
retry();
cron.schedule('17 * * * *', retry, { timezone: 'America/Argentina/Buenos_Aires' });

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`uniformar escuchando en :${port} (storage: ${storage.driver})`));
```

`backend/.env.example`:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/uniformar
JWT_SECRET=cambiar-por-un-string-largo-de-al-menos-32-caracteres
ADMIN_EMAIL=jdilernia99@gmail.com
ADMIN_INITIAL_PASSWORD=cambiar
# local (carpeta backend/.uploads) o s3 (Cloudflare R2)
STORAGE_DRIVER=local
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=uniformar
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

`README.md`:
````markdown
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
````

- [ ] **Step 4: Smoke test local (si hay Postgres local; si no, saltar y dejarlo para Task 24)**

Run: `cd backend && DATABASE_URL=<postgres local> JWT_SECRET=dev ADMIN_INITIAL_PASSWORD=dev12345 node src/index.js` y en otra terminal `curl -s localhost:3000/health`
Expected: `{"ok":true,"db":true}` y en el log `uniformar escuchando en :3000 (storage: local)`.

- [ ] **Step 5: Correr toda la suite**

Run: `cd backend && npx vitest run`
Expected: PASS (todos los archivos).

- [ ] **Step 6: Commit**

```bash
git add backend README.md
git commit -m "feat: arranque del servidor con superadmin, storage configurable y reintento de borrados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## FRONTEND

> Convenciones de todo el frontend:
> - Componentes en `.jsx` con CSS Modules (`X.module.css` al lado). Nada de librerías de UI.
> - Datos con `@tanstack/react-query`. Cada feature tiene su `api.js` con hooks (`useX`, `useUpdateX`).
> - Toda mutación pasa por react-query → el `MutationCache` muestra el toast de éxito/error (Task 14). Para no mostrar "Guardado ✓" se pasa `meta: { success: false }`; para un texto propio, `meta: { success: 'Idea creada ✓' }`.
> - Textos largos siempre con la clase global `prewrap`.
> - Inputs con `font-size: 16px` (evita el zoom de iOS).
> - Correr tests: `cd frontend && npx vitest run`.

### Task 14: Scaffold del frontend, tokens, cliente de API, toasts y hooks base

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.js`, `frontend/index.html`, `frontend/pwa-assets.config.js`, `frontend/test/setup.js`
- Create: `frontend/public/logo-negro.png`, `logo-blanco.png`, `logo-ciruela.png` (copiados del zip de logos)
- Create: `frontend/src/main.jsx`, `frontend/src/styles/tokens.css`, `frontend/src/styles/global.css`
- Create: `frontend/src/api/client.js`, `frontend/src/api/queryClient.js`
- Create: `frontend/src/state/toastBus.js`, `frontend/src/state/Toasts.jsx`, `frontend/src/state/Toasts.module.css`
- Create: `frontend/src/hooks/useOptimisticMutation.js`, `useDraft.js`, `usePersistentState.js`, `useMediaQuery.js`, `useOnline.js`
- Create: `frontend/src/components/ui/Button.jsx`, `Button.module.css`, `Field.jsx`, `Field.module.css`, `Spinner.jsx`, `Spinner.module.css`, `PageHeader.jsx`, `PageHeader.module.css`
- Test: `frontend/src/api/client.test.js`, `frontend/src/state/Toasts.test.jsx`, `frontend/src/hooks/hooks.test.jsx`

**Interfaces:**
- Produces (`api/client.js`): `class ApiError extends Error { status, code, fields }`; `api.get(path)`, `api.post(path, body?)`, `api.patch(path, body)`, `api.put(path, body)`, `api.del(path)`, `api.upload(path, formData)` — `path` sin `/api` (ej. `'/ideas'`); `setUnauthenticatedHandler(fn)`. Errores de red → `ApiError(0, 'NETWORK', 'Sin conexión. Revisá internet y probá de nuevo.')`.
- Produces (`api/queryClient.js`): `createQueryClient()`.
- Produces (`state/toastBus.js`): `toastBus.success(msg)`, `toastBus.error(msg)`, `toastBus.info(msg)`, `toastBus.subscribe(fn)`. (`state/Toasts.jsx`): `<ToastViewport />`.
- Produces hooks: `useOptimisticMutation({ mutationFn, queryKey?, apply?, invalidate?: QueryKey[], meta? })`, `useDraft(key, initial) → [value, setValue, clear]`, `usePersistentState(key, initial) → [value, setValue]`, `useMediaQuery(query) → bool`, `useIsDesktop() → bool` (≥ 900 px), `useOnline() → bool`.
- Produces UI: `<Button variant="primary|secondary|ghost|danger" size="md|sm" loading icon={LucideIcon} full>`, `<IconButton icon label variant size>`, `<Field label hint error required htmlFor?>{<Input|Textarea|Select />}</Field>` (con `htmlFor` el hijo puede ser un wrapper y no se clona), `<Spinner size>`, `<PageHeader title subtitle actions back>`.

- [ ] **Step 1: Scaffold**

`frontend/package.json`:
```json
{
  "name": "uniformar-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "generate-pwa-assets": "pwa-assets-generator"
  },
  "dependencies": {
    "@fontsource-variable/inter": "^5.1.0",
    "@fontsource-variable/outfit": "^5.1.0",
    "@tanstack/react-query": "^5.59.0",
    "lucide-react": "^0.460.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@vite-pwa/assets-generator": "^0.2.6",
    "@vitejs/plugin-react": "^4.3.3",
    "jsdom": "^25.0.1",
    "vite": "^5.4.10",
    "vite-plugin-pwa": "^0.20.5",
    "vitest": "^2.1.4"
  }
}
```

`frontend/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo-ciruela.png'],
      manifest: {
        name: 'Uniform.ar',
        short_name: 'Uniform.ar',
        description: 'Contenidos, calendario y proyectos de Uniform.ar',
        lang: 'es-AR',
        start_url: './',
        display: 'standalone',
        theme_color: '#775D66',
        background_color: '#F6F4F3',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo se cachea el shell; los datos siempre van a la red
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        runtimeCaching: [],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: './test/setup.js', globals: true, css: { modules: { classNameStrategy: 'non-scoped' } } },
});
```

`frontend/index.html`:
```html
<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#775D66" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
    <title>Uniform.ar</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`frontend/pwa-assets.config.js`:
```js
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#FFFFFF' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#FFFFFF' } },
  },
  images: ['public/logo-ciruela.png'],
});
```

`frontend/test/setup.js`:
```js
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  });
}
```

Logos (desde la raíz del repo; el zip está en Descargas):
```bash
mkdir -p "$TEMP/uf-logos" && unzip -oq "/c/Users/Usuario/Downloads/LOGOS-20261007T112226Z-1-001.zip" -d "$TEMP/uf-logos"
mkdir -p frontend/public
cp "$TEMP/uf-logos/LOGOS/Logo Uniform-ar.png- NEGRO.png" frontend/public/logo-negro.png
cp "$TEMP/uf-logos/LOGOS/Logo Uniform-ar.png-BLANCO.png" frontend/public/logo-blanco.png
cp "$TEMP/uf-logos/LOGOS/despues .png" frontend/public/logo-ciruela.png
cd frontend && npm install && npm run generate-pwa-assets
```
Expected: en `frontend/public/` aparecen `favicon.ico`, `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`.

- [ ] **Step 2: Estilos base**

`frontend/src/styles/tokens.css`:
```css
:root {
  color-scheme: light;
  --c-bg: #f6f4f3;
  --c-surface: #ffffff;
  --c-surface-2: #f1eeed;
  --c-surface-3: #e9e5e4;
  --c-border: #e3dedc;
  --c-border-strong: #cfc8c6;
  --c-text: #1d1a1b;
  --c-text-2: #5d5658;
  --c-text-3: #8a8285;
  --c-accent: #775d66;
  --c-accent-hover: #654e57;
  --c-accent-soft: #f0e9eb;
  --c-accent-text: #5e4750;
  --c-on-accent: #ffffff;
  --c-success: #2d7a57;
  --c-success-soft: #e2f1e9;
  --c-warn: #9a640f;
  --c-warn-soft: #faefd9;
  --c-info: #366497;
  --c-info-soft: #e4edf7;
  --c-danger: #b23a3c;
  --c-danger-soft: #fbe7e7;
  --c-overlay: rgb(29 26 27 / 0.42);
  --shadow-1: 0 1px 2px rgb(29 26 27 / 0.05), 0 1px 3px rgb(29 26 27 / 0.07);
  --shadow-2: 0 10px 30px rgb(29 26 27 / 0.14), 0 2px 6px rgb(29 26 27 / 0.06);
  --radius-s: 8px;
  --radius-m: 12px;
  --radius-l: 18px;
  --radius-pill: 999px;
  --font-ui: 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-display: 'Outfit Variable', var(--font-ui);
  --fs-xs: 0.75rem;
  --fs-s: 0.8125rem;
  --fs-m: 0.9375rem;
  --fs-l: 1.0625rem;
  --fs-xl: 1.375rem;
  --fs-2xl: 1.75rem;
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 48px;
  --tap: 44px;
  --nav-h: 64px;
  --sidebar-w: 248px;
  --content-max: 1120px;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur: 180ms;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --c-bg: #151314;
    --c-surface: #1e1b1c;
    --c-surface-2: #262223;
    --c-surface-3: #2f2a2c;
    --c-border: #342f31;
    --c-border-strong: #4a4346;
    --c-text: #f3eff0;
    --c-text-2: #bfb6b9;
    --c-text-3: #8f8689;
    --c-accent: #b997a3;
    --c-accent-hover: #c9aab5;
    --c-accent-soft: #34292d;
    --c-accent-text: #d8bfc8;
    --c-on-accent: #1d1a1b;
    --c-success: #6cc79b;
    --c-success-soft: #1d3329;
    --c-warn: #e2b05a;
    --c-warn-soft: #3a2f1b;
    --c-info: #84b0e3;
    --c-info-soft: #1f2c3b;
    --c-danger: #ef8a8b;
    --c-danger-soft: #3d2223;
    --c-overlay: rgb(0 0 0 / 0.6);
    --shadow-1: 0 1px 2px rgb(0 0 0 / 0.4);
    --shadow-2: 0 12px 32px rgb(0 0 0 / 0.5);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur: 0ms; }
}
```

`frontend/src/styles/global.css`:
```css
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--c-bg);
  color: var(--c-text);
  font-family: var(--font-ui);
  font-size: var(--fs-m);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}
h1, h2, h3, h4 { font-family: var(--font-display); line-height: 1.2; margin: 0; letter-spacing: -0.01em; font-weight: 600; }
p { margin: 0; }
button, input, textarea, select { font: inherit; color: inherit; }
a { color: var(--c-accent-text); text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
img { max-width: 100%; display: block; }
.prewrap { white-space: pre-wrap; overflow-wrap: anywhere; }
.muted { color: var(--c-text-2); }
.visually-hidden {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.desktop-only { display: none !important; }
@media (min-width: 900px) {
  .desktop-only { display: revert !important; }
  .mobile-only { display: none !important; }
}
```

- [ ] **Step 3: Tests que fallan**

`frontend/src/api/client.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError, setUnauthenticatedHandler } from './client.js';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('cliente de API', () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it('GET devuelve el JSON y manda cookies', async () => {
    fetch.mockReturnValue(json(200, { ideas: [] }));
    expect(await api.get('/ideas')).toEqual({ ideas: [] });
    expect(fetch).toHaveBeenCalledWith('/api/ideas', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }));
  });

  it('POST manda JSON', async () => {
    fetch.mockReturnValue(json(201, { idea: { id: 1 } }));
    await api.post('/ideas', { text: 'x' });
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.body).toBe('{"text":"x"}');
  });

  it('error del backend → ApiError con code, message y fields', async () => {
    fetch.mockReturnValue(json(400, { error: { code: 'VALIDATION', message: 'Revisá los datos: Escribí la idea', fields: { text: 'Escribí la idea' } } }));
    const err = await api.post('/ideas', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION', message: 'Revisá los datos: Escribí la idea', fields: { text: 'Escribí la idea' } });
  });

  it('sin conexión → NETWORK con mensaje claro', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await api.get('/ideas').catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK', message: 'Sin conexión. Revisá internet y probá de nuevo.' });
  });

  it('401 avisa al handler de sesión (salvo en el login)', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    fetch.mockReturnValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'Tu sesión expiró. Volvé a entrar.' } }));
    await api.get('/ideas').catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
    fetch.mockReturnValue(json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos' } }));
    await api.post('/auth/login', {}).catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('respuesta no JSON con error → mensaje genérico con el status', async () => {
    fetch.mockReturnValue(Promise.resolve(new Response('<html>502</html>', { status: 502 })));
    const err = await api.get('/ideas').catch((e) => e);
    expect(err.message).toBe('El servidor no respondió bien (502). Probá de nuevo en un momento.');
  });
});
```

`frontend/src/state/Toasts.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastViewport } from './Toasts.jsx';
import { toastBus } from './toastBus.js';

describe('toasts', () => {
  it('muestra éxito y error, y el éxito se va solo', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);
    act(() => { toastBus.success('Guardado ✓'); toastBus.error('No tenés permiso para editar Proyectos'); });
    expect(screen.getByText('Guardado ✓')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No tenés permiso para editar Proyectos');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('Guardado ✓')).not.toBeInTheDocument();
    expect(screen.getByText('No tenés permiso para editar Proyectos')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText('No tenés permiso para editar Proyectos')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
```

`frontend/src/hooks/hooks.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../api/queryClient.js';
import { useOptimisticMutation } from './useOptimisticMutation.js';
import { useDraft } from './useDraft.js';
import { toastBus } from '../state/toastBus.js';
import { ApiError } from '../api/client.js';

function wrapperWith(qc) {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useOptimisticMutation', () => {
  it('aplica el cambio al instante y lo revierte si falla, mostrando el error', async () => {
    const qc = createQueryClient();
    qc.setQueryData(['ideas'], [{ id: 1, text: 'viejo' }]);
    const errors = [];
    const unsub = toastBus.subscribe((t) => t.kind === 'error' && errors.push(t.message));
    let reject;
    const { result } = renderHook(() => useOptimisticMutation({
      mutationFn: () => new Promise((_, r) => { reject = r; }),
      queryKey: ['ideas'],
      apply: (old, vars) => old.map((i) => (i.id === vars.id ? { ...i, text: vars.text } : i)),
    }), { wrapper: wrapperWith(qc) });
    act(() => { result.current.mutate({ id: 1, text: 'nuevo' }); });
    await waitFor(() => expect(qc.getQueryData(['ideas'])[0].text).toBe('nuevo'));
    await act(async () => { reject(new ApiError(403, 'FORBIDDEN', 'No tenés permiso para editar Ideas')); });
    await waitFor(() => expect(qc.getQueryData(['ideas'])[0].text).toBe('viejo'));
    expect(errors).toContain('No tenés permiso para editar Ideas');
    unsub();
  });

  it('éxito muestra "Guardado ✓" salvo que se pida otra cosa', async () => {
    const qc = createQueryClient();
    const seen = [];
    const unsub = toastBus.subscribe((t) => seen.push(t.message));
    const { result } = renderHook(() => useOptimisticMutation({ mutationFn: async () => ({}) }), { wrapper: wrapperWith(qc) });
    await act(async () => { await result.current.mutateAsync({}); });
    const { result: r2 } = renderHook(() => useOptimisticMutation({ mutationFn: async () => ({}), meta: { success: false } }), { wrapper: wrapperWith(qc) });
    await act(async () => { await r2.current.mutateAsync({}); });
    expect(seen).toEqual(['Guardado ✓']);
    unsub();
  });
});

describe('useDraft', () => {
  it('guarda lo escrito y lo recupera si se recarga (p. ej. sesión vencida)', () => {
    const first = renderHook(() => useDraft('idea-nueva', { text: '' }));
    act(() => first.result.current[1]({ text: 'Lo que estaba escribiendo' }));
    first.unmount();
    const second = renderHook(() => useDraft('idea-nueva', { text: '' }));
    expect(second.result.current[0].text).toBe('Lo que estaba escribiendo');
    act(() => second.result.current[2]());
    second.unmount();
    const third = renderHook(() => useDraft('idea-nueva', { text: '' }));
    expect(third.result.current[0].text).toBe('');
  });

  it('si localStorage falla, funciona igual en memoria', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const { result } = renderHook(() => useDraft('x', { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
    spy.mockRestore();
  });
});
```

- [ ] **Step 4: Correr y ver que fallan**

Run: `cd frontend && npx vitest run`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 5: Implementar**

`frontend/src/api/client.js`:
```js
export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let onUnauthenticated = () => {};
export const setUnauthenticatedHandler = (fn) => { onUnauthenticated = fn; };

async function request(path, { method = 'GET', body, form } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sin conexión. Revisá internet y probá de nuevo.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    const err = e
      ? new ApiError(res.status, e.code, e.message, e.fields)
      : new ApiError(res.status, `HTTP_${res.status}`, `El servidor no respondió bien (${res.status}). Probá de nuevo en un momento.`);
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthenticated(err);
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, form) => request(path, { method: 'POST', form }),
};
```

`frontend/src/state/toastBus.js`:
```js
// Bus fuera de React para que el QueryClient (y cualquier módulo) pueda mostrar toasts
const listeners = new Set();
let seq = 0;

function show(kind, message, opts = {}) {
  const toast = { id: ++seq, kind, message, ...opts };
  listeners.forEach((fn) => fn(toast));
  return toast.id;
}

export const toastBus = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  success: (message, opts) => show('success', message, opts),
  error: (message, opts) => show('error', message, opts),
  info: (message, opts) => show('info', message, opts),
};
```

`frontend/src/state/Toasts.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { toastBus } from './toastBus.js';
import s from './Toasts.module.css';

const DURATION = { success: 2500, info: 4000, error: 7000 };
const ICON = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastViewport() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => toastBus.subscribe((t) => {
    setToasts((list) => [...list.filter((x) => x.message !== t.message), t].slice(-4));
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), DURATION[t.kind]);
  }), []);

  const dismiss = (id) => setToasts((list) => list.filter((x) => x.id !== id));

  return (
    <div className={s.viewport} aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div key={t.id} className={`${s.toast} ${s[t.kind]}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon size={18} aria-hidden className={s.icon} />
            <p className={s.msg}>{t.message}</p>
            <button type="button" className={s.close} onClick={() => dismiss(t.id)} aria-label="Cerrar aviso"><X size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}
```

`frontend/src/state/Toasts.module.css`:
```css
.viewport {
  position: fixed; z-index: 100; left: 50%; transform: translateX(-50%);
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--sp-3));
  display: flex; flex-direction: column; gap: var(--sp-2);
  width: min(440px, calc(100vw - 2 * var(--sp-4))); pointer-events: none;
}
@media (min-width: 900px) { .viewport { bottom: var(--sp-5); left: auto; right: var(--sp-5); transform: none; } }
.toast {
  pointer-events: auto; display: flex; align-items: flex-start; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4); border-radius: var(--radius-m);
  background: var(--c-text); color: var(--c-surface); box-shadow: var(--shadow-2);
  animation: in var(--dur) var(--ease);
}
.error { background: var(--c-danger); color: #fff; }
.icon { flex: none; margin-top: 2px; }
.success .icon { color: var(--c-success-soft); }
.msg { flex: 1; font-size: var(--fs-m); line-height: 1.4; }
.close { flex: none; border: 0; background: transparent; color: inherit; opacity: 0.8; padding: 2px; cursor: pointer; border-radius: var(--radius-s); }
@keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
```

`frontend/src/api/queryClient.js`:
```js
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toastBus } from '../state/toastBus.js';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (n, err) => (err?.status === 0 || err?.status >= 500) && n < 2,
      },
      mutations: { retry: false },
    },
    queryCache: new QueryCache({
      onError: (err, query) => {
        if (err?.status === 401 || query.meta?.silent) return;
        toastBus.error(err?.message ?? 'No se pudieron cargar los datos.');
      },
    }),
    mutationCache: new MutationCache({
      onSuccess: (_data, _vars, _ctx, mutation) => {
        const msg = mutation.options.meta?.success;
        if (msg !== false) toastBus.success(msg ?? 'Guardado ✓');
      },
      onError: (err, _vars, _ctx, mutation) => {
        if (err?.status === 401) return; // lo maneja la sesión
        toastBus.error(mutation.options.meta?.error ?? err?.message ?? 'No se pudo guardar. Probá de nuevo.');
      },
    }),
  });
}
```

`frontend/src/hooks/useOptimisticMutation.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query';

// Cambia la caché al instante; si el backend falla, vuelve atrás (el toast de error lo pone el MutationCache)
export function useOptimisticMutation({ mutationFn, queryKey, apply, invalidate = [], meta }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    meta,
    onMutate: async (vars) => {
      if (!queryKey || !apply) return {};
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData(queryKey);
      if (previous !== undefined) qc.setQueryData(queryKey, (old) => apply(old, vars));
      return { previous, hadPrevious: previous !== undefined };
    },
    onError: (_err, _vars, ctx) => {
      if (queryKey && ctx?.hadPrevious) qc.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => Promise.all([queryKey, ...invalidate].filter(Boolean).map((k) => qc.invalidateQueries({ queryKey: k }))),
  });
}
```

`frontend/src/hooks/useDraft.js`:
```js
import { useCallback, useEffect, useRef, useState } from 'react';

const read = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Borrador local: sobrevive a recargas y a una sesión vencida a mitad de la edición
export function useDraft(key, initial) {
  const storageKey = `uf:draft:${key}`;
  const initialRef = useRef(initial);
  const [value, setValue] = useState(() => {
    const saved = read(storageKey);
    return saved ? { ...initial, ...saved } : initial;
  });

  useEffect(() => {
    if (value === initialRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch { /* sin storage: queda en memoria */ }
  }, [storageKey, value]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch { /* nada */ }
    initialRef.current = initial;
    setValue(initial);
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue, clear];
}
```

`frontend/src/hooks/usePersistentState.js`:
```js
import { useEffect, useState } from 'react';

// Preferencias del usuario (filtros, grupos abiertos). Si el storage falla, queda en memoria.
export function usePersistentState(key, initial) {
  const storageKey = `uf:pref:${key}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch { /* nada */ }
  }, [storageKey, value]);
  return [value, setValue];
}
```

`frontend/src/hooks/useMediaQuery.js`:
```js
import { useEffect, useState } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const useIsDesktop = () => useMediaQuery('(min-width: 900px)');
```

`frontend/src/hooks/useOnline.js`:
```js
import { useEffect, useState } from 'react';

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
```

`frontend/src/components/ui/Spinner.jsx`:
```jsx
import s from './Spinner.module.css';

export function Spinner({ size = 20, label }) {
  return <span className={s.spinner} style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label} />;
}
```

`frontend/src/components/ui/Spinner.module.css`:
```css
.spinner {
  display: inline-block; flex: none; border-radius: 50%;
  border: 2px solid currentColor; border-right-color: transparent; opacity: 0.8;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

`frontend/src/components/ui/Button.jsx`:
```jsx
import { Spinner } from './Spinner.jsx';
import s from './Button.module.css';

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, full = false, className = '', disabled, type = 'button', children, ...rest }) {
  return (
    <button
      type={type}
      className={[s.btn, s[variant], s[size], full && s.full, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : Icon ? <Icon size={18} aria-hidden /> : null}
      {children != null && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className = '', ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className={[s.btn, s.iconOnly, s[variant], s[size], className].join(' ')} {...rest}>
      <Icon size={size === 'sm' ? 18 : 20} aria-hidden />
    </button>
  );
}
```

`frontend/src/components/ui/Button.module.css`:
```css
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2);
  min-height: var(--tap); padding: 0 var(--sp-4); border-radius: var(--radius-m);
  border: 1px solid transparent; font-weight: 600; font-size: var(--fs-m); line-height: 1;
  cursor: pointer; white-space: nowrap; user-select: none;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.btn:active:not(:disabled) { transform: scale(0.98); }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.sm { min-height: 36px; padding: 0 var(--sp-3); font-size: var(--fs-s); border-radius: var(--radius-s); }
.full { width: 100%; }
.primary { background: var(--c-accent); color: var(--c-on-accent); }
.primary:hover:not(:disabled) { background: var(--c-accent-hover); }
.secondary { background: var(--c-surface); color: var(--c-text); border-color: var(--c-border-strong); }
.secondary:hover:not(:disabled) { background: var(--c-surface-2); }
.ghost { background: transparent; color: var(--c-text-2); }
.ghost:hover:not(:disabled) { background: var(--c-surface-2); color: var(--c-text); }
.danger { background: var(--c-danger-soft); color: var(--c-danger); }
.danger:hover:not(:disabled) { background: var(--c-danger); color: #fff; }
.iconOnly { padding: 0; width: var(--tap); }
.iconOnly.sm { width: 36px; }
```

`frontend/src/components/ui/Field.jsx`:
```jsx
import { cloneElement, forwardRef, useId, useLayoutEffect, useRef } from 'react';
import s from './Field.module.css';

// Si el control va envuelto (p. ej. input + botón de ojo), pasar htmlFor y poner ese id en el input
export function Field({ label, hint, error, required, htmlFor, children, className = '' }) {
  const auto = useId();
  const id = htmlFor ?? children.props.id ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={`${s.field} ${className}`}>
      {label && (
        <label htmlFor={id} className={s.label}>
          {label}{required && <span className={s.req} aria-hidden> *</span>}
        </label>
      )}
      {htmlFor ? children : cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined,
      })}
      {hint && !error && <p id={hintId} className={s.hint}>{hint}</p>}
      {error && <p id={errId} className={s.error}>{error}</p>}
    </div>
  );
}

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`${s.input} ${className}`} {...props} />;
});

export const Select = forwardRef(function Select({ className = '', ...props }, ref) {
  return <select ref={ref} className={`${s.input} ${s.select} ${className}`} {...props} />;
});

// Crece con el contenido: los textos largos se ven completos mientras se escriben
export const Textarea = forwardRef(function Textarea({ minRows = 3, className = '', value, ...props }, ref) {
  const inner = useRef(null);
  const setRefs = (el) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={setRefs} rows={minRows} value={value} className={`${s.input} ${s.textarea} ${className}`} {...props} />;
});
```

`frontend/src/components/ui/Field.module.css`:
```css
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: var(--fs-s); font-weight: 600; color: var(--c-text-2); }
.req { color: var(--c-danger); }
.input {
  width: 100%; min-height: var(--tap); padding: 10px var(--sp-3);
  font-size: 16px; /* evita el zoom automático de iOS */
  background: var(--c-surface); color: var(--c-text);
  border: 1px solid var(--c-border-strong); border-radius: var(--radius-m);
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.input::placeholder { color: var(--c-text-3); }
.input:focus { outline: none; border-color: var(--c-accent); box-shadow: 0 0 0 3px var(--c-accent-soft); }
.input[aria-invalid='true'] { border-color: var(--c-danger); }
.textarea { resize: vertical; line-height: 1.5; overflow: hidden; }
.select { appearance: none; padding-right: 36px; background-image: linear-gradient(45deg, transparent 50%, var(--c-text-3) 50%), linear-gradient(135deg, var(--c-text-3) 50%, transparent 50%); background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
.hint { font-size: var(--fs-s); color: var(--c-text-3); }
.error { font-size: var(--fs-s); color: var(--c-danger); font-weight: 500; }
```

`frontend/src/components/ui/PageHeader.jsx`:
```jsx
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import s from './PageHeader.module.css';

export function PageHeader({ title, subtitle, actions, back }) {
  const navigate = useNavigate();
  return (
    <header className={s.header}>
      {back && (
        <button type="button" className={s.back} onClick={() => navigate(back)} aria-label="Volver">
          <ChevronLeft size={22} />
        </button>
      )}
      <div className={s.titles}>
        <h1 className={s.title}>{title}</h1>
        {subtitle && <p className={s.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}
```

`frontend/src/components/ui/PageHeader.module.css`:
```css
.header {
  position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: var(--sp-2);
  padding: calc(var(--sp-3) + env(safe-area-inset-top)) var(--sp-4) var(--sp-3);
  background: color-mix(in srgb, var(--c-bg) 88%, transparent); backdrop-filter: blur(10px);
}
@media (min-width: 900px) { .header { padding: var(--sp-5) var(--sp-6) var(--sp-4); } }
.back { display: grid; place-items: center; width: 40px; height: 40px; margin-left: -8px; border: 0; border-radius: 50%; background: transparent; color: var(--c-text); cursor: pointer; }
.back:hover { background: var(--c-surface-2); }
.titles { flex: 1; min-width: 0; }
.title { font-size: var(--fs-xl); }
@media (min-width: 900px) { .title { font-size: var(--fs-2xl); } }
.subtitle { color: var(--c-text-2); font-size: var(--fs-s); margin-top: 2px; }
.actions { display: flex; gap: var(--sp-2); flex: none; }
```

`frontend/src/main.jsx` (provisional; Task 15 lo completa con auth y rutas):
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import './styles/tokens.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><p>Uniform.ar</p></React.StrictMode>);
```

- [ ] **Step 6: Correr y ver que pasan**

Run: `cd frontend && npx vitest run && npx vite build`
Expected: tests PASS; build OK (genera `dist/` con `sw.js` y `manifest.webmanifest`).

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "feat(front): scaffold PWA, tokens de diseño, cliente de API, toasts y hooks base

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Sesión, login, cambio de contraseña y estructura de navegación

**Files:**
- Create: `frontend/src/lib/permissions.js`, `frontend/src/state/auth.jsx`
- Create: `frontend/src/pages/Login.jsx`, `Login.module.css`, `ChangePassword.jsx`
- Create: `frontend/src/components/shell/nav.js`, `AppShell.jsx`, `AppShell.module.css`, `Sidebar.jsx`, `BottomNav.jsx`, `Fab.jsx`, `OfflineBanner.jsx`, `Guard.jsx`
- Create: `frontend/src/pages/More.jsx`, `ComingSoon.jsx`, `Placeholder.jsx`, `pages.module.css`
- Create: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx`
- Test: `frontend/src/pages/Login.test.jsx`, `frontend/src/components/shell/nav.test.js`

**Interfaces:**
- Consumes: `api`, `setUnauthenticatedHandler`, `toastBus`, `createQueryClient`, `Button`, `Field`, `Input`, `PageHeader`, `useIsDesktop`, `useOnline`.
- Produces: `can(user, section, level = 'view') → bool` (`lib/permissions.js`); `AuthProvider`, `useAuth() → { user, status: 'loading'|'in'|'out'|'error', login(email, pw), logout(), setUser(user), retry() }`, `useCan() → (section, level?) => bool`.
- Produces: `NAV_ITEMS` y `visibleNav(user) → { primary: Item[4], more: Item[] }` (`nav.js`); `<AppShell>`, `<Fab icon label onClick>` (solo celular), `<Guard section level flag>`.
- Produces: `<ComingSoon kind="ads"|"web" />`, `<Placeholder title />` (reemplazado por las pantallas reales en Tasks 18–23).
- Rutas (HashRouter): `/`, `/ideas`, `/ideas/:id`, `/calendario`, `/calendario/:date`, `/proyectos`, `/proyectos/:id`, `/pauta`, `/web`, `/usuarios`, `/ajustes`, `/cuenta`, `/mas`.

- [ ] **Step 1: Tests que fallan**

`frontend/src/components/shell/nav.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { visibleNav } from './nav.js';
import { can } from '../../lib/permissions.js';

const user = (permissions, flags = {}) => ({ permissions: { home: 'none', ideas: 'none', calendar: 'none', projects: 'none', ads: 'none', web: 'none', ...permissions }, ...flags });

describe('navegación', () => {
  it('equipo ve las 4 principales y en "Más" Pauta, Web, Mi cuenta (sin Usuarios)', () => {
    const nav = visibleNav(user({ home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' }));
    expect(nav.primary.map((i) => i.label)).toEqual(['Inicio', 'Ideas', 'Calendario', 'Proyectos']);
    expect(nav.more.map((i) => i.label)).toEqual(['Agente de pauta', 'Admin web', 'Ajustes', 'Mi cuenta']);
  });

  it('admin ve Usuarios; lectura no ve Ajustes', () => {
    const admin = visibleNav(user({ home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'edit', web: 'edit' }, { manage_users: true }));
    expect(admin.more.map((i) => i.label)).toContain('Usuarios');
    const lectura = visibleNav(user({ home: 'view', ideas: 'view', calendar: 'view', projects: 'view' }));
    expect(lectura.more.map((i) => i.label)).not.toContain('Ajustes');
  });

  it('sin acceso a una sección, no aparece', () => {
    const nav = visibleNav(user({ home: 'view', ideas: 'edit' }));
    expect(nav.primary.map((i) => i.label)).toEqual(['Inicio', 'Ideas']);
  });

  it('can respeta niveles', () => {
    expect(can(user({ ideas: 'view' }), 'ideas')).toBe(true);
    expect(can(user({ ideas: 'view' }), 'ideas', 'edit')).toBe(false);
    expect(can(null, 'ideas')).toBe(false);
  });
});
```

`frontend/src/pages/Login.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../api/queryClient.js';
import { AuthProvider } from '../state/auth.jsx';
import { Login } from './Login.jsx';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function renderLogin() {
  return render(<QueryClientProvider client={createQueryClient()}><AuthProvider><Login /></AuthProvider></QueryClientProvider>);
}

describe('Login', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => (url === '/api/auth/me'
      ? json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })
      : json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos' } })));
  });

  it('muestra el error del backend debajo del formulario', async () => {
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'sofi@uniform.ar');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos');
  });

  it('no deja enviar vacío', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(fetch).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd frontend && npx vitest run src/pages/Login.test.jsx src/components/shell/nav.test.js`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar sesión y permisos**

`frontend/src/lib/permissions.js`:
```js
const RANK = { none: 0, view: 1, edit: 2 };

export function can(user, section, level = 'view') {
  if (!user) return false;
  return RANK[user.permissions?.[section] ?? 'none'] >= RANK[level];
}
```

`frontend/src/state/auth.jsx`:
```jsx
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setUnauthenticatedHandler } from '../api/client.js';
import { toastBus } from './toastBus.js';
import { can } from '../lib/permissions.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get('/auth/me')).user;
      } catch (err) {
        if (err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
    meta: { silent: true },
  });

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      if (qc.getQueryData(['me'])) {
        toastBus.error('Tu sesión expiró. Volvé a entrar: lo que estabas escribiendo quedó guardado.');
      }
      qc.setQueryData(['me'], null);
    });
  }, [qc]);

  const login = useCallback(async (email, password) => {
    const { user } = await api.post('/auth/login', { email, password });
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], user);
    return user;
  }, [qc]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], null);
  }, [qc]);

  const setUser = useCallback((user) => qc.setQueryData(['me'], user), [qc]);

  const value = useMemo(() => ({
    user: me.data ?? null,
    status: me.isPending ? 'loading' : me.isError ? 'error' : me.data ? 'in' : 'out',
    login, logout, setUser, retry: me.refetch,
  }), [me.data, me.isPending, me.isError, me.refetch, login, logout, setUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function useCan() {
  const { user } = useAuth();
  return useCallback((section, level = 'view') => can(user, section, level), [user]);
}
```

- [ ] **Step 4: Login y cambio de contraseña**

`frontend/src/pages/Login.jsx`:
```jsx
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../state/auth.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import s from './Login.module.css';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Completá tu email y tu contraseña.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className={s.page}>
      <form className={s.card} onSubmit={onSubmit} noValidate>
        <img src="/logo-ciruela.png" alt="Uniform.ar — Indumentaria de trabajo" className={s.logo} />
        <h1 className={s.title}>Entrá a la plataforma</h1>
        <Field label="Email">
          <Input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Contraseña" htmlFor="login-password">
          <div className={s.pwWrap}>
            <Input id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className={s.eye} onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        {error && <p role="alert" className={s.error}>{error}</p>}
        <Button type="submit" loading={loading} full>Entrar</Button>
        <p className={s.help}>¿Olvidaste tu contraseña? Pedile a Sofi que te la resetee.</p>
      </form>
    </main>
  );
}
```

`frontend/src/pages/Login.module.css`:
```css
.page {
  min-height: 100dvh; display: grid; place-items: center; padding: var(--sp-4);
  background: radial-gradient(120% 80% at 50% 0%, var(--c-accent-soft), var(--c-bg) 60%);
}
.card {
  width: min(400px, 100%); display: flex; flex-direction: column; gap: var(--sp-4);
  padding: var(--sp-6) var(--sp-5); background: var(--c-surface); border-radius: var(--radius-l); box-shadow: var(--shadow-2);
}
.logo { width: 120px; margin: 0 auto var(--sp-2); }
@media (prefers-color-scheme: dark) { .logo { content: url('/logo-blanco.png'); } }
.title { font-size: var(--fs-xl); text-align: center; }
.pwWrap { position: relative; }
.pwWrap input { padding-right: 48px; }
.eye { position: absolute; right: 2px; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; display: grid; place-items: center; border: 0; background: transparent; color: var(--c-text-3); cursor: pointer; border-radius: var(--radius-s); }
.error { padding: var(--sp-3); border-radius: var(--radius-m); background: var(--c-danger-soft); color: var(--c-danger); font-size: var(--fs-s); font-weight: 500; }
.help { text-align: center; font-size: var(--fs-s); color: var(--c-text-3); }
```

`frontend/src/pages/ChangePassword.jsx`:
```jsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../state/auth.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import s from './Login.module.css';

export function ChangePasswordForm({ onDone }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const mutation = useMutation({
    mutationFn: (body) => api.post('/auth/change-password', body),
    meta: { success: 'Contraseña actualizada ✓' },
    onSuccess: ({ user }) => {
      setUser(user);
      onDone?.();
    },
    onError: (err) => setErrors(err.fields ?? {}),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function onSubmit(e) {
    e.preventDefault();
    if (form.newPassword.length < 8) return setErrors({ newPassword: 'Mínimo 8 caracteres' });
    if (form.newPassword !== form.confirm) return setErrors({ confirm: 'No coincide con la nueva contraseña' });
    setErrors({});
    mutation.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword });
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <Field label="Contraseña actual" error={errors.currentPassword}>
        <Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} />
      </Field>
      <Field label="Contraseña nueva" hint="Mínimo 8 caracteres." error={errors.newPassword}>
        <Input type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} />
      </Field>
      <Field label="Repetí la contraseña nueva" error={errors.confirm}>
        <Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
      </Field>
      <Button type="submit" loading={mutation.isPending} full>Guardar contraseña</Button>
    </form>
  );
}

export function ChangePassword() {
  const { user, logout } = useAuth();
  return (
    <main className={s.page}>
      <div className={s.card}>
        <img src="/logo-ciruela.png" alt="Uniform.ar" className={s.logo} />
        <h1 className={s.title}>Hola, {user.name.split(' ')[0]}</h1>
        <p className="muted" style={{ textAlign: 'center' }}>Por seguridad, elegí una contraseña nueva para tu cuenta.</p>
        <ChangePasswordForm />
        <Button variant="ghost" onClick={logout}>Salir</Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Shell y navegación**

`frontend/src/components/shell/nav.js`:
```js
import { Home, Lightbulb, CalendarDays, FolderKanban, Megaphone, Globe, Users, Settings2, UserCircle } from 'lucide-react';
import { can } from '../../lib/permissions.js';

export const NAV_ITEMS = [
  { to: '/', label: 'Inicio', icon: Home, section: 'home', primary: true },
  { to: '/ideas', label: 'Ideas', icon: Lightbulb, section: 'ideas', primary: true },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays, section: 'calendar', primary: true },
  { to: '/proyectos', label: 'Proyectos', icon: FolderKanban, section: 'projects', primary: true },
  { to: '/pauta', label: 'Agente de pauta', icon: Megaphone, section: 'ads', soon: true },
  { to: '/web', label: 'Admin web', icon: Globe, section: 'web', soon: true },
  { to: '/usuarios', label: 'Usuarios', icon: Users, flag: 'manage_users' },
  { to: '/ajustes', label: 'Ajustes', icon: Settings2, section: 'calendar', level: 'edit' },
  { to: '/cuenta', label: 'Mi cuenta', icon: UserCircle },
];

function allowed(user, item) {
  if (item.flag) return Boolean(user?.[item.flag]);
  if (item.section) return can(user, item.section, item.level ?? 'view');
  return true;
}

export function visibleNav(user) {
  const items = NAV_ITEMS.filter((i) => allowed(user, i));
  return { primary: items.filter((i) => i.primary), more: items.filter((i) => !i.primary), all: items };
}
```

`frontend/src/components/shell/AppShell.jsx`:
```jsx
import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import { ToastViewport } from '../../state/Toasts.jsx';
import { Sidebar } from './Sidebar.jsx';
import { BottomNav } from './BottomNav.jsx';
import { OfflineBanner } from './OfflineBanner.jsx';
import s from './AppShell.module.css';

export function AppShell({ children }) {
  const desktop = useIsDesktop();
  return (
    <div className={s.shell}>
      {desktop && <Sidebar />}
      <main className={s.main}>
        <OfflineBanner />
        <div className={s.content}>{children}</div>
      </main>
      {!desktop && <BottomNav />}
      <ToastViewport />
    </div>
  );
}
```

`frontend/src/components/shell/Sidebar.jsx`:
```jsx
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { visibleNav } from './nav.js';
import s from './AppShell.module.css';

export function Sidebar() {
  const { user, logout } = useAuth();
  const { all } = visibleNav(user);
  return (
    <aside className={s.sidebar}>
      <img src="/logo-ciruela.png" alt="Uniform.ar" className={s.sideLogo} />
      <nav className={s.sideNav} aria-label="Secciones">
        {all.map(({ to, label, icon: Icon, soon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `${s.sideLink} ${isActive ? s.active : ''}`}>
            <Icon size={20} aria-hidden />
            <span>{label}</span>
            {soon && <span className={s.soon}>Pronto</span>}
          </NavLink>
        ))}
      </nav>
      <div className={s.me}>
        <span className={s.meAvatar} style={{ background: user.avatar_color }} aria-hidden>{user.name[0]}</span>
        <span className={s.meName}>{user.name}</span>
        <button type="button" className={s.logout} onClick={logout} aria-label="Salir" title="Salir"><LogOut size={18} /></button>
      </div>
    </aside>
  );
}
```

`frontend/src/components/shell/BottomNav.jsx`:
```jsx
import { NavLink } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { visibleNav } from './nav.js';
import s from './AppShell.module.css';

export function BottomNav() {
  const { user } = useAuth();
  const { primary } = visibleNav(user);
  return (
    <nav className={s.bottom} aria-label="Secciones">
      {[...primary, { to: '/mas', label: 'Más', icon: MoreHorizontal }].map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `${s.tab} ${isActive ? s.active : ''}`}>
          <Icon size={22} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
```

`frontend/src/components/shell/Fab.jsx`:
```jsx
import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import s from './AppShell.module.css';

// Botón flotante contextual, solo en celular (en escritorio la acción va en el encabezado)
export function Fab({ icon: Icon, label, onClick }) {
  const desktop = useIsDesktop();
  if (desktop) return null;
  return (
    <button type="button" className={s.fab} onClick={onClick} aria-label={label}>
      <Icon size={26} aria-hidden />
    </button>
  );
}
```

`frontend/src/components/shell/OfflineBanner.jsx`:
```jsx
import { WifiOff } from 'lucide-react';
import { useOnline } from '../../hooks/useOnline.js';
import s from './AppShell.module.css';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className={s.offline} role="status">
      <WifiOff size={16} aria-hidden /> Sin conexión. Lo que cambies no se va a guardar hasta que vuelva internet.
    </div>
  );
}
```

`frontend/src/components/shell/Guard.jsx`:
```jsx
import { Lock } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { can } from '../../lib/permissions.js';
import s from '../../pages/pages.module.css';

export function Guard({ section, level = 'view', flag, children }) {
  const { user } = useAuth();
  const ok = flag ? Boolean(user?.[flag]) : section ? can(user, section, level) : true;
  if (ok) return children;
  return (
    <div className={s.center}>
      <Lock size={32} aria-hidden className={s.centerIcon} />
      <h2>No tenés acceso a esta sección</h2>
      <p className="muted">Si lo necesitás, pedile a Sofi que te habilite el permiso.</p>
    </div>
  );
}
```

`frontend/src/components/shell/AppShell.module.css`:
```css
.shell { min-height: 100dvh; display: flex; }
.main { flex: 1; min-width: 0; padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom)); }
@media (min-width: 900px) { .main { padding-bottom: 0; margin-left: var(--sidebar-w); } }
.content { max-width: var(--content-max); margin: 0 auto; }

.sidebar {
  position: fixed; inset: 0 auto 0 0; width: var(--sidebar-w); display: flex; flex-direction: column;
  padding: var(--sp-5) var(--sp-3); background: var(--c-surface); border-right: 1px solid var(--c-border);
}
.sideLogo { width: 96px; margin: 0 var(--sp-3) var(--sp-5); }
@media (prefers-color-scheme: dark) { .sideLogo { content: url('/logo-blanco.png'); } }
.sideNav { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
.sideLink {
  display: flex; align-items: center; gap: var(--sp-3); min-height: var(--tap); padding: 0 var(--sp-3);
  border-radius: var(--radius-m); color: var(--c-text-2); text-decoration: none; font-weight: 500;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.sideLink:hover { background: var(--c-surface-2); color: var(--c-text); }
.sideLink.active { background: var(--c-accent-soft); color: var(--c-accent-text); font-weight: 600; }
.soon { margin-left: auto; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 6px; border-radius: var(--radius-pill); background: var(--c-surface-3); color: var(--c-text-3); }
.me { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3); border-top: 1px solid var(--c-border); }
.meAvatar { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: var(--fs-s); }
.meName { flex: 1; font-weight: 600; font-size: var(--fs-s); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logout { border: 0; background: transparent; color: var(--c-text-3); width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--radius-s); cursor: pointer; }
.logout:hover { background: var(--c-surface-2); color: var(--c-text); }

.bottom {
  position: fixed; z-index: 20; inset: auto 0 0 0; height: calc(var(--nav-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom); display: flex;
  background: color-mix(in srgb, var(--c-surface) 92%, transparent); backdrop-filter: blur(12px);
  border-top: 1px solid var(--c-border);
}
.tab {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  color: var(--c-text-3); text-decoration: none; font-size: 11px; font-weight: 600;
}
.tab.active { color: var(--c-accent); }

.fab {
  position: fixed; z-index: 15; right: var(--sp-4); bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--sp-4));
  width: 56px; height: 56px; border-radius: 18px; border: 0; display: grid; place-items: center;
  background: var(--c-accent); color: var(--c-on-accent); box-shadow: var(--shadow-2); cursor: pointer;
}
.fab:active { transform: scale(0.96); }

.offline {
  display: flex; align-items: center; gap: var(--sp-2); justify-content: center;
  padding: var(--sp-2) var(--sp-4); background: var(--c-warn-soft); color: var(--c-warn); font-size: var(--fs-s); font-weight: 600;
}
```

- [ ] **Step 6: Páginas provisorias y App**

`frontend/src/pages/pages.module.css`:
```css
.page { padding: 0 var(--sp-4) var(--sp-6); }
@media (min-width: 900px) { .page { padding: 0 var(--sp-6) var(--sp-7); } }
.center { min-height: 50dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2); text-align: center; padding: var(--sp-6) var(--sp-4); }
.centerIcon { color: var(--c-text-3); margin-bottom: var(--sp-2); }
.list { display: flex; flex-direction: column; background: var(--c-surface); border-radius: var(--radius-l); border: 1px solid var(--c-border); overflow: hidden; }
.listItem { display: flex; align-items: center; gap: var(--sp-3); min-height: 56px; padding: 0 var(--sp-4); color: var(--c-text); text-decoration: none; border-bottom: 1px solid var(--c-border); }
.listItem:last-child { border-bottom: 0; }
.listItem:active { background: var(--c-surface-2); }
.listItem .grow { flex: 1; font-weight: 500; }
.soonCard { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); padding: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-3); }
.soonCard ul { margin: 0; padding-left: 1.2em; color: var(--c-text-2); display: grid; gap: 6px; }
```

`frontend/src/pages/Placeholder.jsx`:
```jsx
import { PageHeader } from '../components/ui/PageHeader.jsx';

export function Placeholder({ title }) {
  return <PageHeader title={title} subtitle="En construcción" />;
}
```

`frontend/src/pages/ComingSoon.jsx`:
```jsx
import { Megaphone, Globe } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import s from './pages.module.css';

const CONTENT = {
  ads: {
    title: 'Agente de pauta', icon: Megaphone,
    intro: 'Un agente de IA que maneja la pauta de Meta y Google de Uniform.ar, con tope de $300.000 por mes.',
    items: ['Gasto del mes contra el tope, por plataforma', 'Campañas activas, consultas al WhatsApp y estadísticas', 'Recomendaciones del agente para aprobar o rechazar', 'Activar, pausar y ajustar presupuestos desde acá'],
  },
  web: {
    title: 'Admin web', icon: Globe,
    intro: 'El panel de la web nueva de Uniform.ar: cambiás banners, productos y trabajos sin tocar código.',
    items: ['Banners y textos de la home', 'Catálogo por rubro', 'Trabajos realizados con fotos y videos', 'Consultas y pedidos de cotización'],
  },
};

export function ComingSoon({ kind }) {
  const c = CONTENT[kind];
  const Icon = c.icon;
  return (
    <>
      <PageHeader title={c.title} subtitle="Próximamente" />
      <div className={s.page}>
        <div className={s.soonCard}>
          <Icon size={28} aria-hidden style={{ color: 'var(--c-accent)' }} />
          <p>{c.intro}</p>
          <ul>{c.items.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      </div>
    </>
  );
}
```

`frontend/src/pages/More.jsx`:
```jsx
import { Link } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../state/auth.jsx';
import { visibleNav } from '../components/shell/nav.js';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import s from './pages.module.css';

export function MorePage() {
  const { user, logout } = useAuth();
  const { more } = visibleNav(user);
  return (
    <>
      <PageHeader title="Más" subtitle={user.name} />
      <div className={s.page}>
        <div className={s.list}>
          {more.map(({ to, label, icon: Icon, soon }) => (
            <Link key={to} to={to} className={s.listItem}>
              <Icon size={20} aria-hidden />
              <span className={s.grow}>{label}</span>
              {soon && <span className="muted" style={{ fontSize: 'var(--fs-s)' }}>Próximamente</span>}
              <ChevronRight size={18} aria-hidden className="muted" />
            </Link>
          ))}
          <button type="button" className={s.listItem} onClick={logout} style={{ border: 0, background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
            <LogOut size={20} aria-hidden />
            <span className={s.grow}>Salir</span>
          </button>
        </div>
      </div>
    </>
  );
}
```

`frontend/src/App.jsx`:
```jsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/auth.jsx';
import { can } from './lib/permissions.js';
import { visibleNav } from './components/shell/nav.js';
import { AppShell } from './components/shell/AppShell.jsx';
import { Guard } from './components/shell/Guard.jsx';
import { Spinner } from './components/ui/Spinner.jsx';
import { Button } from './components/ui/Button.jsx';
import { ToastViewport } from './state/Toasts.jsx';
import { Login } from './pages/Login.jsx';
import { ChangePassword } from './pages/ChangePassword.jsx';
import { MorePage } from './pages/More.jsx';
import { ComingSoon } from './pages/ComingSoon.jsx';
import { Placeholder } from './pages/Placeholder.jsx';
import s from './pages/pages.module.css';

// Las pantallas reales reemplazan a estos placeholders en las Tasks 18–23
const HomePage = () => <Placeholder title="Inicio" />;
const IdeasPage = () => <Placeholder title="Ideas" />;
const CalendarPage = () => <Placeholder title="Calendario" />;
const ProjectsPage = () => <Placeholder title="Proyectos" />;
const ProjectDetail = () => <Placeholder title="Proyecto" />;
const UsersPage = () => <Placeholder title="Usuarios" />;
const SettingsPage = () => <Placeholder title="Ajustes" />;
const AccountPage = () => <Placeholder title="Mi cuenta" />;

function Home() {
  const { user } = useAuth();
  if (can(user, 'home')) return <HomePage />;
  const first = visibleNav(user).all[0];
  return <Navigate to={first?.to && first.to !== '/' ? first.to : '/cuenta'} replace />;
}

export default function App() {
  const { status, user, retry } = useAuth();
  if (status === 'loading') return <div className={s.center}><Spinner size={28} label="Cargando" /></div>;
  if (status === 'error') {
    return (
      <div className={s.center}>
        <h2>No pudimos conectarnos</h2>
        <p className="muted">Revisá tu conexión y probá de nuevo.</p>
        <Button onClick={() => retry()}>Reintentar</Button>
      </div>
    );
  }
  if (status === 'out') return <><Login /><ToastViewport /></>;
  if (user.must_change_password) return <><ChangePassword /><ToastViewport /></>;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ideas" element={<Guard section="ideas"><IdeasPage /></Guard>} />
        <Route path="/ideas/:id" element={<Guard section="ideas"><IdeasPage /></Guard>} />
        <Route path="/calendario" element={<Guard section="calendar"><CalendarPage /></Guard>} />
        <Route path="/calendario/:date" element={<Guard section="calendar"><CalendarPage /></Guard>} />
        <Route path="/proyectos" element={<Guard section="projects"><ProjectsPage /></Guard>} />
        <Route path="/proyectos/:id" element={<Guard section="projects"><ProjectDetail /></Guard>} />
        <Route path="/pauta" element={<Guard section="ads"><ComingSoon kind="ads" /></Guard>} />
        <Route path="/web" element={<Guard section="web"><ComingSoon kind="web" /></Guard>} />
        <Route path="/usuarios" element={<Guard flag="manage_users"><UsersPage /></Guard>} />
        <Route path="/ajustes" element={<Guard section="calendar" level="edit"><SettingsPage /></Guard>} />
        <Route path="/cuenta" element={<AccountPage />} />
        <Route path="/mas" element={<MorePage />} />
        <Route path="*" element={<div className={s.center}><h2>No encontramos esta página</h2></div>} />
      </Routes>
    </AppShell>
  );
}
```

`frontend/src/main.jsx` (reemplazar):
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import './styles/tokens.css';
import './styles/global.css';
import { createQueryClient } from './api/queryClient.js';
import { AuthProvider } from './state/auth.jsx';
import App from './App.jsx';

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 7: Correr tests y build**

Run: `cd frontend && npx vitest run && npx vite build`
Expected: PASS y build OK.

- [ ] **Step 8: Verificación manual rápida**

Con el backend corriendo (Task 13, Step 4) y `cd frontend && npm run dev`: abrir `http://localhost:5173`, entrar con el superadmin, verificar que pide cambiar la contraseña, cambiarla y ver la barra inferior a 390 px y el sidebar a 1440 px.

- [ ] **Step 9: Commit**

```bash
git add frontend
git commit -m "feat(front): login, cambio de contraseña obligatorio, navegación con permisos y pantallas próximamente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Kit de UI (hojas, confirmación, chips, avatares, estados)

**Files:**
- Create: `frontend/src/components/ui/Sheet.jsx`, `Sheet.module.css`, `ConfirmDialog.jsx`, `ConfirmDialog.module.css`, `Chip.jsx`, `Chip.module.css`, `Segmented.jsx`, `Avatar.jsx`, `Avatar.module.css`, `Progress.jsx`, `Collapsible.jsx`, `Collapsible.module.css`, `EmptyState.jsx`, `StatusBadge.jsx`, `StatusBadge.module.css`, `Card.jsx`, `Card.module.css`
- Create: `frontend/src/lib/ideaStatus.js`
- Modify: `frontend/src/main.jsx` (envolver con `ConfirmProvider`)
- Test: `frontend/src/components/ui/ui.test.jsx`, `frontend/src/lib/ideaStatus.test.js`

**Interfaces:**
- Produces: `<Sheet open onClose title footer size="md|lg">` (hoja inferior en celular, panel lateral en escritorio; Esc y clic afuera cierran; bloquea el scroll del fondo).
- Produces: `ConfirmProvider`, `useConfirm() → (opts: { title, message?, confirmLabel?, danger? }) => Promise<boolean>`.
- Produces: `<Chip selected onClick count>`, `<ChipGroup label>`, `<Segmented options={[{ value, label }]} value onChange label>`, `<Avatar user size>`, `<AvatarStack users max>`, `<Progress value max label>`, `<Collapsible title summary count defaultOpen open onToggle>`, `<EmptyState icon title action>`, `<StatusBadge kind="idea"|"calendar"|"day"|"project" status>`, `<Card as padded>`.
- Produces (`lib/ideaStatus.js`): `deriveIdeaStatus`, `IDEA_STATUS_LABELS`, `IDEA_STATUS_ORDER`, `CATEGORY_LABELS`, `CALENDAR_STATUS_LABELS`, `CHANNEL_LABELS` (`ig_story: 'Historias IG', ig_post: 'Post IG', ig_reel: 'Reel IG', tiktok: 'TikTok'`).

- [ ] **Step 1: Tests que fallan**

`frontend/src/lib/ideaStatus.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { deriveIdeaStatus } from './ideaStatus.js';

describe('deriveIdeaStatus (espejo del backend)', () => {
  it.each([
    [{ kind: 'idea', decision: 'pending', done_at: null }, 'por_decidir'],
    [{ kind: 'idea', decision: 'yes', done_at: null }, 'por_hacer'],
    [{ kind: 'idea', decision: 'no', done_at: null }, 'no_se_hace'],
    [{ kind: 'idea', decision: 'yes', done_at: '2026-10-07T10:00:00Z' }, 'realizada'],
    [{ kind: 'must', decision: 'pending', done_at: null }, 'si_o_si'],
    [{ kind: 'must', decision: 'pending', done_at: '2026-10-07T10:00:00Z' }, 'realizada'],
  ])('%o → %s', (idea, expected) => expect(deriveIdeaStatus(idea)).toBe(expected));
});
```

`frontend/src/components/ui/ui.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet.jsx';
import { ConfirmProvider, useConfirm } from './ConfirmDialog.jsx';
import { Collapsible } from './Collapsible.jsx';
import { StatusBadge } from './StatusBadge.jsx';
import { Segmented } from './Segmented.jsx';

describe('Sheet', () => {
  it('se cierra con Esc y con el fondo, no con un clic adentro', async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="Idea"><button type="button">adentro</button></Sheet>);
    expect(screen.getByRole('dialog', { name: 'Idea' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('adentro'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('cerrada no renderiza nada', () => {
    render(<Sheet open={false} onClose={() => {}} title="X">contenido</Sheet>);
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
  });
});

describe('useConfirm', () => {
  function Probe({ onResult }) {
    const confirm = useConfirm();
    return <button type="button" onClick={async () => onResult(await confirm({ title: '¿Borrar la idea?', confirmLabel: 'Borrar', danger: true }))}>abrir</button>;
  }

  it('resuelve true al confirmar y false al cancelar', async () => {
    const onResult = vi.fn();
    render(<ConfirmProvider><Probe onResult={onResult} /></ConfirmProvider>);
    await userEvent.click(screen.getByText('abrir'));
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(onResult).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByText('abrir'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onResult).toHaveBeenLastCalledWith(false);
  });
});

describe('Collapsible', () => {
  it('arranca cerrado y muestra el resumen', async () => {
    render(<Collapsible title="Domingo · humor" count={4} summary="3 por decidir · 1 por hacer"><p>fila</p></Collapsible>);
    const btn = screen.getByRole('button', { name: /Domingo · humor/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('3 por decidir · 1 por hacer')).toBeInTheDocument();
    expect(screen.queryByText('fila')).not.toBeInTheDocument();
    await userEvent.click(btn);
    expect(screen.getByText('fila')).toBeInTheDocument();
  });
});

describe('StatusBadge y Segmented', () => {
  it('etiquetas en español', () => {
    render(<><StatusBadge kind="idea" status="por_decidir" /><StatusBadge kind="calendar" status="ready" /></>);
    expect(screen.getByText('Por decidir')).toBeInTheDocument();
    expect(screen.getByText('Listo para publicar')).toBeInTheDocument();
  });

  it('Segmented marca la opción activa', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Nivel" value="view" onChange={onChange} options={[{ value: 'none', label: 'Sin acceso' }, { value: 'view', label: 'Ver' }, { value: 'edit', label: 'Editar' }]} />);
    expect(screen.getByRole('radio', { name: 'Ver' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Editar' }));
    expect(onChange).toHaveBeenCalledWith('edit');
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd frontend && npx vitest run src/components/ui/ui.test.jsx src/lib/ideaStatus.test.js`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

`frontend/src/lib/ideaStatus.js`:
```js
// Espejo de backend/src/lib/ideaStatus.js — mantener iguales
export const IDEA_STATUS_LABELS = {
  si_o_si: 'Sí o sí', por_decidir: 'Por decidir', por_hacer: 'Por hacer', realizada: 'Realizada', no_se_hace: 'No se hace',
};
export const IDEA_STATUS_ORDER = ['si_o_si', 'por_decidir', 'por_hacer', 'realizada', 'no_se_hace'];

export function deriveIdeaStatus({ kind, decision, done_at }) {
  if (decision === 'no') return 'no_se_hace';
  if (done_at) return 'realizada';
  if (kind === 'must') return 'si_o_si';
  if (decision === 'yes') return 'por_hacer';
  return 'por_decidir';
}

export const CATEGORY_LABELS = { domingo: 'Domingo · humor', viernes: 'Viernes · cliente', producto: 'Producto · catálogo', otra: 'Otros' };
export const CALENDAR_STATUS_LABELS = { draft: 'Borrador', ready: 'Listo para publicar', published: 'Publicado' };
export const CHANNEL_LABELS = { ig_story: 'Historias IG', ig_post: 'Post IG', ig_reel: 'Reel IG', tiktok: 'TikTok' };
export const CHANNELS = ['ig_story', 'ig_post', 'ig_reel', 'tiktok'];
```

`frontend/src/components/ui/Sheet.jsx`:
```jsx
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import s from './Sheet.module.css';

export function Sheet({ open, onClose, title, footer, size = 'md', children }) {
  const titleId = useId();
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={s.root}>
      <div className={s.backdrop} data-testid="sheet-backdrop" onClick={onClose} />
      <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`${s.panel} ${s[size]}`}>
        <div className={s.handle} aria-hidden />
        <header className={s.header}>
          <h2 id={titleId} className={s.title}>{title}</h2>
          <button type="button" className={s.close} onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className={s.body}>{children}</div>
        {footer && <footer className={s.footer}>{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
```

`frontend/src/components/ui/Sheet.module.css`:
```css
.root { position: fixed; inset: 0; z-index: 50; }
.backdrop { position: absolute; inset: 0; background: var(--c-overlay); animation: fade var(--dur) var(--ease); }
.panel {
  position: absolute; left: 0; right: 0; bottom: 0; max-height: 92dvh; display: flex; flex-direction: column;
  background: var(--c-surface); border-radius: var(--radius-l) var(--radius-l) 0 0; box-shadow: var(--shadow-2);
  outline: none; animation: up 240ms var(--ease);
}
.handle { width: 40px; height: 4px; border-radius: 2px; background: var(--c-border-strong); margin: 8px auto 0; }
@media (min-width: 900px) {
  .panel { top: 0; left: auto; max-height: none; width: 520px; border-radius: 0; animation: side 240ms var(--ease); }
  .lg { width: 640px; }
  .handle { display: none; }
}
.header { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4) var(--sp-2); }
.title { flex: 1; font-size: var(--fs-l); }
.close { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--c-surface-2); color: var(--c-text-2); cursor: pointer; }
.body { flex: 1; overflow-y: auto; padding: var(--sp-2) var(--sp-4) var(--sp-5); overscroll-behavior: contain; }
.footer { display: flex; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4) calc(var(--sp-3) + env(safe-area-inset-bottom)); border-top: 1px solid var(--c-border); background: var(--c-surface); }
.footer > * { flex: 1; }
@keyframes fade { from { opacity: 0; } }
@keyframes up { from { transform: translateY(24px); opacity: 0; } }
@keyframes side { from { transform: translateX(24px); opacity: 0; } }
```

`frontend/src/components/ui/ConfirmDialog.jsx`:
```jsx
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.jsx';
import s from './ConfirmDialog.module.css';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((o) => new Promise((resolve) => {
    resolver.current = resolve;
    setOpts(o);
  }), []);

  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && createPortal(
        <div className={s.root} onKeyDown={(e) => e.key === 'Escape' && close(false)}>
          <div className={s.backdrop} onClick={() => close(false)} />
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className={s.dialog}>
            <h2 id="confirm-title" className={s.title}>{opts.title}</h2>
            {opts.message && <p className={s.message}>{opts.message}</p>}
            <div className={s.actions}>
              <Button variant="secondary" onClick={() => close(false)}>Cancelar</Button>
              <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{opts.confirmLabel ?? 'Confirmar'}</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
```

`frontend/src/components/ui/ConfirmDialog.module.css`:
```css
.root { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: var(--sp-4); }
.backdrop { position: absolute; inset: 0; background: var(--c-overlay); }
.dialog { position: relative; width: min(400px, 100%); background: var(--c-surface); border-radius: var(--radius-l); padding: var(--sp-5); box-shadow: var(--shadow-2); display: flex; flex-direction: column; gap: var(--sp-3); }
.title { font-size: var(--fs-l); }
.message { color: var(--c-text-2); }
.actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
.actions > * { flex: 1; }
```

`frontend/src/components/ui/Chip.jsx`:
```jsx
import s from './Chip.module.css';

export function Chip({ selected = false, count, children, ...rest }) {
  return (
    <button type="button" aria-pressed={selected} className={`${s.chip} ${selected ? s.selected : ''}`} {...rest}>
      {children}
      {count != null && <span className={s.count}>{count}</span>}
    </button>
  );
}

export function ChipGroup({ label, children }) {
  return (
    <div className={s.group} role="group" aria-label={label}>
      {children}
    </div>
  );
}
```

`frontend/src/components/ui/Chip.module.css`:
```css
.group { display: flex; gap: var(--sp-2); overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
.group::-webkit-scrollbar { display: none; }
.chip {
  flex: none; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 var(--sp-3);
  border-radius: var(--radius-pill); border: 1px solid var(--c-border-strong); background: var(--c-surface);
  color: var(--c-text-2); font-size: var(--fs-s); font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.selected { background: var(--c-accent); border-color: var(--c-accent); color: var(--c-on-accent); }
.count { font-size: var(--fs-xs); opacity: 0.8; }
```

`frontend/src/components/ui/Segmented.jsx`:
```jsx
import { useId } from 'react';
import s from './Chip.module.css';

export function Segmented({ options, value, onChange, label, disabled }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={s.group}>
      {options.map((o) => (
        <label key={o.value} className={`${s.chip} ${value === o.value ? s.selected : ''}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={disabled}
            onChange={() => onChange(o.value)} className="visually-hidden" />
          {o.label}
        </label>
      ))}
    </div>
  );
}
```

`frontend/src/components/ui/Avatar.jsx`:
```jsx
import s from './Avatar.module.css';

const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function Avatar({ user, size = 28 }) {
  return (
    <span className={s.avatar} style={{ width: size, height: size, fontSize: size * 0.4, background: user?.avatar_color ?? 'var(--c-text-3)' }} title={user?.name} aria-label={user?.name}>
      {initials(user?.name)}
    </span>
  );
}

export function AvatarStack({ users, max = 3, size = 24 }) {
  const shown = users.slice(0, max);
  return (
    <span className={s.stack}>
      {shown.map((u) => <Avatar key={u.id} user={u} size={size} />)}
      {users.length > max && <span className={s.more} style={{ width: size, height: size }}>+{users.length - max}</span>}
    </span>
  );
}
```

`frontend/src/components/ui/Avatar.module.css`:
```css
.avatar { display: inline-grid; place-items: center; flex: none; border-radius: 50%; color: #fff; font-weight: 700; letter-spacing: 0.02em; box-shadow: 0 0 0 2px var(--c-surface); }
.stack { display: inline-flex; }
.stack > * + * { margin-left: -6px; }
.more { display: inline-grid; place-items: center; border-radius: 50%; background: var(--c-surface-3); color: var(--c-text-2); font-size: 10px; font-weight: 700; box-shadow: 0 0 0 2px var(--c-surface); }
```

`frontend/src/components/ui/Progress.jsx`:
```jsx
export function Progress({ value, max, label }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}
      style={{ height: 6, borderRadius: 3, background: 'var(--c-surface-3)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--c-success)' : 'var(--c-accent)', transition: 'width var(--dur) var(--ease)' }} />
    </div>
  );
}
```

`frontend/src/components/ui/Collapsible.jsx`:
```jsx
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import s from './Collapsible.module.css';

export function Collapsible({ title, summary, count, defaultOpen = false, open: openProp, onToggle, children }) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const id = useId();
  const toggle = () => (onToggle ? onToggle(!open) : setInner(!open));
  return (
    <section className={s.box}>
      <button type="button" className={s.head} aria-expanded={open} aria-controls={id} onClick={toggle}>
        <span className={s.titles}>
          <span className={s.title}>{title}{count != null && <span className={s.count}>{count}</span>}</span>
          {summary && <span className={s.summary}>{summary}</span>}
        </span>
        <ChevronDown size={20} className={`${s.chev} ${open ? s.open : ''}`} aria-hidden />
      </button>
      {open && <div id={id} className={s.body}>{children}</div>}
    </section>
  );
}
```

`frontend/src/components/ui/Collapsible.module.css`:
```css
.box { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); overflow: hidden; }
.head { width: 100%; display: flex; align-items: center; gap: var(--sp-3); min-height: 60px; padding: var(--sp-3) var(--sp-4); border: 0; background: transparent; text-align: left; cursor: pointer; }
.titles { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.title { font-weight: 600; display: flex; align-items: center; gap: var(--sp-2); }
.count { font-size: var(--fs-xs); font-weight: 700; padding: 1px 8px; border-radius: var(--radius-pill); background: var(--c-surface-2); color: var(--c-text-2); }
.summary { font-size: var(--fs-s); color: var(--c-text-3); }
.chev { flex: none; color: var(--c-text-3); transition: transform var(--dur) var(--ease); }
.open { transform: rotate(180deg); }
.body { border-top: 1px solid var(--c-border); }
```

`frontend/src/components/ui/EmptyState.jsx`:
```jsx
export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-2)', textAlign: 'center', padding: 'var(--sp-6) var(--sp-4)', color: 'var(--c-text-2)' }}>
      {Icon && <Icon size={28} aria-hidden style={{ color: 'var(--c-text-3)' }} />}
      <p style={{ fontWeight: 600, color: 'var(--c-text)' }}>{title}</p>
      {children && <p style={{ fontSize: 'var(--fs-s)' }}>{children}</p>}
      {action}
    </div>
  );
}
```

`frontend/src/components/ui/StatusBadge.jsx`:
```jsx
import { IDEA_STATUS_LABELS, CALENDAR_STATUS_LABELS } from '../../lib/ideaStatus.js';
import s from './StatusBadge.module.css';

const TONE = {
  idea: { si_o_si: 'accent', por_decidir: 'warn', por_hacer: 'info', realizada: 'success', no_se_hace: 'neutral' },
  calendar: { draft: 'warn', ready: 'info', published: 'success' },
  day: { empty: 'neutral', planned: 'warn', ready: 'info', published: 'success' },
  project: { active: 'accent', proposal: 'warn', upcoming: 'info', done: 'success' },
};
const LABELS = {
  idea: IDEA_STATUS_LABELS,
  calendar: CALENDAR_STATUS_LABELS,
  day: { empty: 'Sin cargar', planned: 'Planificado', ready: 'Pieza lista', published: 'Publicado' },
  project: { active: 'Activo', proposal: 'Propuesta', upcoming: 'Próximo', done: 'Terminado' },
};

export function StatusBadge({ kind, status }) {
  return <span className={`${s.badge} ${s[TONE[kind][status]]}`}>{LABELS[kind][status]}</span>;
}
```

`frontend/src/components/ui/StatusBadge.module.css`:
```css
.badge { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; }
.accent { background: var(--c-accent-soft); color: var(--c-accent-text); }
.warn { background: var(--c-warn-soft); color: var(--c-warn); }
.info { background: var(--c-info-soft); color: var(--c-info); }
.success { background: var(--c-success-soft); color: var(--c-success); }
.neutral { background: var(--c-surface-2); color: var(--c-text-3); }
```

`frontend/src/components/ui/Card.jsx`:
```jsx
import s from './Card.module.css';

export function Card({ as: Tag = 'div', padded = true, className = '', children, ...rest }) {
  return <Tag className={`${s.card} ${padded ? s.padded : ''} ${className}`} {...rest}>{children}</Tag>;
}

export function SectionTitle({ children, action }) {
  return (
    <div className={s.sectionTitle}>
      <h2>{children}</h2>
      {action}
    </div>
  );
}
```

`frontend/src/components/ui/Card.module.css`:
```css
.card { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); }
.padded { padding: var(--sp-4); }
.sectionTitle { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); margin: var(--sp-5) 0 var(--sp-3); }
.sectionTitle h2 { font-size: var(--fs-l); }
```

Modify `frontend/src/main.jsx` — envolver `<App />` con el provider:
```jsx
import { ConfirmProvider } from './components/ui/ConfirmDialog.jsx';
// ...
        <AuthProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </AuthProvider>
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(front): kit de UI — hoja inferior/panel, confirmación, chips, avatares, grupos plegables, estados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Fechas, imágenes, medidas, embeds y componentes de archivos

**Files:**
- Create: `frontend/src/lib/dates.js`, `frontend/src/lib/imageCompress.js`, `frontend/src/lib/sizes.js`, `frontend/src/lib/embed.js`, `frontend/src/lib/upload.js`
- Create: `frontend/src/components/media/ImageUploader.jsx`, `Gallery.jsx`, `Lightbox.jsx`, `PdfList.jsx`, `EmbedPreview.jsx`, `SizeHint.jsx`, `media.module.css`
- Test: `frontend/src/lib/dates.test.js`, `imageCompress.test.js`, `sizes.test.js`, `embed.test.js`, `upload.test.js`, `frontend/src/components/media/EmbedPreview.test.jsx`

**Interfaces:**
- Produces (`dates.js`): `todayART()`, `addDays(date, n)`, `weekdayOf(date)`, `weekStart(date)` (lunes), `weekRange(date) → { start, end, days }`, `monthOf(date) → 'YYYY-MM'`, `addMonths(ym, n)`, `monthGrid(ym) → string[][]` (semanas de lunes a domingo), `formatShort(date) → '9 oct'`, `formatLong(date) → 'viernes, 9 de octubre'`, `formatMonth(ym) → 'octubre de 2026'`, `relativeTime(iso, now?)`, `WEEKDAY_SHORT` (índice 0 = domingo), `WEEK_HEADERS` (`['Lun', …, 'Dom']`).
- Produces (`imageCompress.js`): `MAX_SIDE = 2048`, `MAX_BYTES = 2 * 1024 * 1024`, `MAX_INPUT_BYTES = 25 * 1024 * 1024`, `QUALITY_STEPS = [0.82, 0.75, 0.68, 0.6]`, `fitWithin(w, h, max?)`, `encodeCanvas(canvas, quality, toBlob?) → Blob` (WebP con fallback a JPEG), `compressImage(file, { decode?, encode? }) → { blob, width, height, type }`.
- Produces (`sizes.js`): `PRESETS` (`ig_post`, `ig_story`, `ig_reel`, `tiktok`, `square`, `product`, `photo`), `presetForChannels(channels) → key`, `ratioLabel(w, h)`, `aspectWarning(w, h, presetKey) → string|null`.
- Produces (`embed.js`): `parseEmbed(url) → { provider: 'instagram'|'tiktok'|'youtube'|'drive'|'link', embedUrl?, openUrl, aspect?, host } | null`.
- Produces (`upload.js`): `PDF_MAX`, `uploadFile({ ownerType, ownerId, file, kind: 'image'|'pdf' }) → FileDTO`.
- Produces UI: `<ImageUploader ownerType ownerId files invalidate canEdit canDelete preset label max>`, `<Gallery files onOpen onDelete?>`, `<Lightbox files index onClose>`, `<PdfList ownerType ownerId files invalidate canEdit canDelete>`, `<EmbedPreview url>`, `<SizeHint preset>`.

- [ ] **Step 1: Tests que fallan**

`frontend/src/lib/dates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { todayART, weekRange, monthGrid, addMonths, formatShort, formatLong, formatMonth, relativeTime } from './dates.js';

describe('fechas', () => {
  it('hoy en Argentina', () => {
    expect(todayART(new Date('2026-10-12T02:30:00Z'))).toBe('2026-10-11');
  });
  it('semana lunes a domingo', () => {
    expect(weekRange('2026-10-11')).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
  });
  it('grilla de octubre 2026: arranca lunes 28/9 y termina domingo 1/11', () => {
    const weeks = monthGrid('2026-10');
    expect(weeks[0][0]).toBe('2026-09-28');
    expect(weeks.at(-1)[6]).toBe('2026-11-01');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it('addMonths cruza el año', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('formatos en español', () => {
    expect(formatShort('2026-10-09')).toBe('9 oct');
    expect(formatLong('2026-10-09')).toMatch(/viernes.*9.*octubre/);
    expect(formatMonth('2026-10')).toMatch(/octubre.*2026/);
  });
  it('tiempo relativo', () => {
    const now = new Date('2026-10-07T15:00:00Z');
    expect(relativeTime('2026-10-07T14:59:30Z', now)).toBe('recién');
    expect(relativeTime('2026-10-07T14:40:00Z', now)).toBe('hace 20 min');
    expect(relativeTime('2026-10-07T12:00:00Z', now)).toBe('hace 3 h');
    expect(relativeTime('2026-10-05T15:00:00Z', now)).toBe('hace 2 d');
  });
});
```

`frontend/src/lib/imageCompress.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { fitWithin, compressImage, encodeCanvas, MAX_BYTES } from './imageCompress.js';

const fakeFile = (size = 1000) => ({ size, name: 'foto.jpg', type: 'image/jpeg' });
const blob = (size, type = 'image/webp') => ({ size, type });

describe('compresión de imágenes', () => {
  it('fitWithin lleva el lado largo a 2048 manteniendo proporción', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(1080, 1920)).toEqual({ width: 1080, height: 1920 });
  });

  it('usa la primera calidad que entra en 2 MB', async () => {
    const encode = vi.fn()
      .mockResolvedValueOnce(blob(MAX_BYTES + 1))
      .mockResolvedValueOnce(blob(900_000));
    const out = await compressImage(fakeFile(), { decode: async () => ({ width: 4000, height: 3000 }), encode });
    expect(encode).toHaveBeenNthCalledWith(1, expect.anything(), 2048, 1536, 0.82);
    expect(encode).toHaveBeenNthCalledWith(2, expect.anything(), 2048, 1536, 0.75);
    expect(out).toMatchObject({ width: 2048, height: 1536, type: 'image/webp' });
  });

  it('si no entra ni a calidad 0,6, error claro', async () => {
    const encode = vi.fn().mockResolvedValue(blob(MAX_BYTES + 1));
    await expect(compressImage(fakeFile(), { decode: async () => ({ width: 100, height: 100 }), encode }))
      .rejects.toThrow('No pudimos achicar la imagen a menos de 2 MB. Probá con otra.');
    expect(encode).toHaveBeenCalledTimes(4);
  });

  it('rechaza originales de más de 25 MB', async () => {
    await expect(compressImage(fakeFile(26 * 1024 * 1024))).rejects.toThrow('La imagen pesa más de 25 MB. Elegí una más liviana.');
  });

  it('si no puede leer la imagen (p. ej. HEIC en Chrome), error claro', async () => {
    await expect(compressImage(fakeFile(), { decode: async () => { throw new Error('x'); } }))
      .rejects.toThrow('No pudimos leer esa imagen. Probá con una JPG o PNG.');
  });

  it('Safari sin WebP: cae a JPEG', async () => {
    const toBlob = vi.fn((canvas, type) => Promise.resolve(blob(1000, type === 'image/webp' ? 'image/png' : type)));
    const out = await encodeCanvas({}, 0.82, toBlob);
    expect(toBlob).toHaveBeenNthCalledWith(1, {}, 'image/webp', 0.82);
    expect(toBlob).toHaveBeenNthCalledWith(2, {}, 'image/jpeg', 0.82);
    expect(out.type).toBe('image/jpeg');
  });
});
```

`frontend/src/lib/sizes.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { aspectWarning, ratioLabel, presetForChannels } from './sizes.js';

describe('medidas recomendadas', () => {
  it('ratioLabel reconoce proporciones comunes', () => {
    expect(ratioLabel(1080, 1080)).toBe('1:1');
    expect(ratioLabel(1080, 1350)).toBe('4:5');
    expect(ratioLabel(1080, 1920)).toBe('9:16');
    expect(ratioLabel(1000, 1777)).toBe('9:16');
    expect(ratioLabel(1000, 1234)).toBe('1000×1234');
  });

  it('avisa si la proporción no coincide con el canal', () => {
    expect(aspectWarning(1080, 1080, 'ig_reel')).toBe('Esta imagen es 1:1; para Reel IG se recomienda 9:16 (1080×1920).');
    expect(aspectWarning(2048, 2560, 'ig_post')).toBeNull();
    expect(aspectWarning(1080, 1080, 'photo')).toBeNull();
  });

  it('preset según canales: historia/reel/tiktok → 9:16; post → 4:5', () => {
    expect(presetForChannels(['ig_story'])).toBe('ig_story');
    expect(presetForChannels(['ig_post', 'tiktok'])).toBe('ig_reel');
    expect(presetForChannels(['ig_post'])).toBe('ig_post');
    expect(presetForChannels([])).toBe('ig_post');
  });
});
```

`frontend/src/lib/embed.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parseEmbed } from './embed.js';

describe('embeds', () => {
  it('Instagram reel y post', () => {
    expect(parseEmbed('https://www.instagram.com/reel/C9abc_12/?igsh=xyz')).toMatchObject({ provider: 'instagram', embedUrl: 'https://www.instagram.com/reel/C9abc_12/embed' });
    expect(parseEmbed('https://instagram.com/p/XYZ123/')).toMatchObject({ embedUrl: 'https://www.instagram.com/p/XYZ123/embed' });
    expect(parseEmbed('https://www.instagram.com/reels/AbC/')).toMatchObject({ embedUrl: 'https://www.instagram.com/reel/AbC/embed' });
  });
  it('TikTok', () => {
    expect(parseEmbed('https://www.tiktok.com/@uniform.ar/video/7412345678901234567?lang=es')).toMatchObject({ provider: 'tiktok', embedUrl: 'https://www.tiktok.com/embed/v2/7412345678901234567' });
    expect(parseEmbed('https://vm.tiktok.com/ZMabc/')).toMatchObject({ provider: 'link' });
  });
  it('YouTube', () => {
    expect(parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ').embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(parseEmbed('https://youtu.be/dQw4w9WgXcQ').embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(parseEmbed('https://youtube.com/shorts/abcDEF12345').embedUrl).toBe('https://www.youtube.com/embed/abcDEF12345');
  });
  it('Drive y otros', () => {
    expect(parseEmbed('https://drive.google.com/file/d/1abc/view')).toMatchObject({ provider: 'drive', host: 'drive.google.com' });
    expect(parseEmbed('https://pinterest.com/pin/1')).toMatchObject({ provider: 'link', host: 'pinterest.com' });
    expect(parseEmbed('no es link')).toBeNull();
  });
});
```

`frontend/src/lib/upload.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client.js', () => ({ api: { upload: vi.fn(async () => ({ file: { id: 'f1' } })) } }));
vi.mock('./imageCompress.js', () => ({ compressImage: vi.fn(async () => ({ blob: new Blob(['x'], { type: 'image/webp' }), width: 10, height: 10 })) }));

const { uploadFile, PDF_MAX } = await import('./upload.js');
const { api } = await import('../api/client.js');

describe('uploadFile', () => {
  beforeEach(() => api.upload.mockClear());

  it('imagen: comprime y manda dueño + archivo .webp', async () => {
    const file = new File(['abc'], 'Foto Producto.JPG', { type: 'image/jpeg' });
    await uploadFile({ ownerType: 'idea_ref', ownerId: 'i1', file, kind: 'image' });
    const form = api.upload.mock.calls[0][1];
    expect(form.get('owner_type')).toBe('idea_ref');
    expect(form.get('owner_id')).toBe('i1');
    expect(form.get('file').name).toBe('Foto Producto.webp');
  });

  it('PDF de más de 10 MB se rechaza antes de subir', async () => {
    const big = { name: 'brief.pdf', type: 'application/pdf', size: PDF_MAX + 1 };
    await expect(uploadFile({ ownerType: 'project_pdf', ownerId: 'p1', file: big, kind: 'pdf' }))
      .rejects.toThrow('El PDF pesa más de 10 MB. Comprimilo antes de subirlo.');
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('si no es PDF, avisa', async () => {
    const doc = { name: 'brief.docx', type: 'application/msword', size: 10 };
    await expect(uploadFile({ ownerType: 'project_pdf', ownerId: 'p1', file: doc, kind: 'pdf' })).rejects.toThrow('Elegí un archivo PDF.');
  });
});
```

`frontend/src/components/media/EmbedPreview.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmbedPreview } from './EmbedPreview.jsx';

describe('EmbedPreview', () => {
  it('reel: iframe embebido + abrir en la app', () => {
    render(<EmbedPreview url="https://www.instagram.com/reel/ABC/" />);
    expect(screen.getByTitle('Vista previa de Instagram')).toHaveAttribute('src', 'https://www.instagram.com/reel/ABC/embed');
    expect(screen.getByRole('link', { name: /Abrir en Instagram/ })).toHaveAttribute('href', 'https://www.instagram.com/reel/ABC/');
  });

  it('Drive: tarjeta con link, sin iframe', () => {
    render(<EmbedPreview url="https://drive.google.com/file/d/1/view" />);
    expect(screen.queryByTitle(/Vista previa/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir en Drive/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd frontend && npx vitest run src/lib src/components/media`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar librerías**

`frontend/src/lib/dates.js`:
```js
// Argentina: UTC−3 fijo. Las fechas de negocio viajan como 'YYYY-MM-DD'.
const OFFSET_MS = 3 * 60 * 60 * 1000;

export const todayART = (now = new Date()) => new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 10);

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const weekStart = (date) => addDays(date, weekdayOf(date) === 0 ? -6 : 1 - weekdayOf(date));

export function weekRange(date) {
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6], days };
}

export const monthOf = (date) => date.slice(0, 7);

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthGrid(ym) {
  const first = `${ym}-01`;
  const last = addDays(`${addMonths(ym, 1)}-01`, -1);
  const weeks = [];
  for (let start = weekStart(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

const fmt = (date, opts) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T00:00:00Z`));
export const formatShort = (date) => fmt(date, { day: 'numeric', month: 'short' }).replace('.', '');
export const formatLong = (date) => fmt(date, { weekday: 'long', day: 'numeric', month: 'long' });
export const formatMonth = (ym) => fmt(`${ym}-01`, { month: 'long', year: 'numeric' });

export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEK_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function relativeTime(iso, now = new Date()) {
  const s = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `hace ${Math.floor(s / 86400)} d`;
  return formatShort(todayART(new Date(iso)));
}
```

`frontend/src/lib/imageCompress.js`:
```js
export const MAX_SIDE = 2048;
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const QUALITY_STEPS = [0.82, 0.75, 0.68, 0.6];

export function fitWithin(width, height, max = MAX_SIDE) {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const defaultToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Safari puede devolver PNG cuando se le pide WebP: en ese caso se usa JPEG
export async function encodeCanvas(canvas, quality, toBlob = defaultToBlob) {
  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;
  return toBlob(canvas, 'image/jpeg', quality);
}

async function decodeImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { width: bitmap.width, height: bitmap.height, source: bitmap };
}

function drawAndEncode(img, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img.source, 0, 0, width, height);
  return encodeCanvas(canvas, quality);
}

export async function compressImage(file, { decode = decodeImage, encode = drawAndEncode } = {}) {
  if (file.size > MAX_INPUT_BYTES) throw new Error('La imagen pesa más de 25 MB. Elegí una más liviana.');
  let img;
  try {
    img = await decode(file);
  } catch {
    throw new Error('No pudimos leer esa imagen. Probá con una JPG o PNG.');
  }
  const { width, height } = fitWithin(img.width, img.height);
  for (const q of QUALITY_STEPS) {
    const blob = await encode(img, width, height, q);
    if (blob && blob.size <= MAX_BYTES) return { blob, width, height, type: blob.type };
  }
  throw new Error('No pudimos achicar la imagen a menos de 2 MB. Probá con otra.');
}
```

`frontend/src/lib/sizes.js`:
```js
export const PRESETS = {
  ig_post: { w: 1080, h: 1350, name: 'Post / carrusel IG' },
  ig_story: { w: 1080, h: 1920, name: 'Historia IG' },
  ig_reel: { w: 1080, h: 1920, name: 'Reel IG' },
  tiktok: { w: 1080, h: 1920, name: 'TikTok' },
  square: { w: 1080, h: 1080, name: 'Post cuadrado' },
  product: { w: 1080, h: 1350, name: 'Foto de producto' },
  photo: { w: null, h: null, name: 'Foto' },
};

const COMMON = [[1, 1], [4, 5], [5, 4], [9, 16], [16, 9], [3, 4], [4, 3], [2, 3], [3, 2]];

export function ratioLabel(w, h) {
  const r = w / h;
  const hit = COMMON.find(([a, b]) => Math.abs(r - a / b) / (a / b) <= 0.02);
  return hit ? `${hit[0]}:${hit[1]}` : `${w}×${h}`;
}

export function aspectWarning(w, h, presetKey) {
  const p = PRESETS[presetKey];
  if (!p?.w) return null;
  const target = p.w / p.h;
  if (Math.abs(w / h - target) / target <= 0.03) return null;
  return `Esta imagen es ${ratioLabel(w, h)}; para ${p.name} se recomienda ${ratioLabel(p.w, p.h)} (${p.w}×${p.h}).`;
}

export function presetForChannels(channels = []) {
  if (channels.includes('ig_story') && channels.length === 1) return 'ig_story';
  if (channels.some((c) => c === 'ig_reel' || c === 'tiktok' || c === 'ig_story')) return 'ig_reel';
  return 'ig_post';
}
```

`frontend/src/lib/embed.js`:
```js
export function parseEmbed(url) {
  let u;
  try {
    u = new URL(String(url).trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const openUrl = u.toString();

  if (host === 'instagram.com') {
    const m = u.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)/);
    if (m) {
      const kind = m[1] === 'p' ? 'p' : 'reel';
      return { provider: 'instagram', host, openUrl: `https://www.instagram.com/${kind}/${m[2]}/`, embedUrl: `https://www.instagram.com/${kind}/${m[2]}/embed`, aspect: kind === 'p' ? 'post' : 'vertical' };
    }
  }
  if (host === 'tiktok.com') {
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) return { provider: 'tiktok', host, openUrl, embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}`, aspect: 'vertical' };
  }
  if (host === 'youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') ?? u.pathname.match(/^\/shorts\/([\w-]+)/)?.[1];
    if (id) return { provider: 'youtube', host, openUrl, embedUrl: `https://www.youtube.com/embed/${id}`, aspect: u.pathname.startsWith('/shorts') ? 'vertical' : 'wide' };
  }
  if (host === 'drive.google.com') return { provider: 'drive', host, openUrl };
  return { provider: 'link', host, openUrl };
}
```

`frontend/src/lib/upload.js`:
```js
import { api } from '../api/client.js';
import { compressImage } from './imageCompress.js';

export const PDF_MAX = 10 * 1024 * 1024;

export async function uploadFile({ ownerType, ownerId, file, kind }) {
  const form = new FormData();
  form.append('owner_type', ownerType);
  form.append('owner_id', ownerId);
  if (kind === 'pdf') {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('Elegí un archivo PDF.');
    if (file.size > PDF_MAX) throw new Error('El PDF pesa más de 10 MB. Comprimilo antes de subirlo.');
    form.append('file', file, file.name);
  } else {
    const { blob } = await compressImage(file);
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    form.append('file', blob, `${file.name.replace(/\.[^.]+$/, '')}.${ext}`);
  }
  return (await api.upload('/files', form)).file;
}
```

- [ ] **Step 4: Implementar componentes**

`frontend/src/components/media/SizeHint.jsx`:
```jsx
import { Ruler } from 'lucide-react';
import { PRESETS, ratioLabel } from '../../lib/sizes.js';
import s from './media.module.css';

export function SizeHint({ preset = 'photo', pdf = false }) {
  const p = PRESETS[preset];
  const text = pdf
    ? 'PDF de hasta 10 MB.'
    : p?.w
      ? `Medida recomendada: ${p.w}×${p.h} (${ratioLabel(p.w, p.h)}). Se comprime sola a 2 MB máx.`
      : 'JPG, PNG o WebP. Se comprime sola a 2 MB máx. Los videos van como link (Drive, IG, TikTok).';
  return <p className={s.hint}><Ruler size={14} aria-hidden /> {text}</p>;
}
```

`frontend/src/components/media/Lightbox.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ExternalLink } from 'lucide-react';
import s from './media.module.css';

export function Lightbox({ files, index, onClose }) {
  const [i, setI] = useState(index);
  const prev = () => setI((n) => (n - 1 + files.length) % files.length);
  const next = () => setI((n) => (n + 1) % files.length);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const file = files[i];
  return createPortal(
    <div className={s.lightbox} role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={onClose}>
      <img src={file.url} alt={file.original_name} className={s.lightboxImg} onClick={(e) => e.stopPropagation()} />
      <div className={s.lightboxBar} onClick={(e) => e.stopPropagation()}>
        <span>{i + 1} / {files.length}</span>
        <a href={file.url} target="_blank" rel="noreferrer" className={s.lbBtn} aria-label="Abrir original"><ExternalLink size={20} /></a>
        <button type="button" className={s.lbBtn} onClick={onClose} aria-label="Cerrar"><X size={22} /></button>
      </div>
      {files.length > 1 && (
        <>
          <button type="button" className={`${s.lbNav} ${s.lbPrev}`} onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Anterior"><ChevronLeft size={28} /></button>
          <button type="button" className={`${s.lbNav} ${s.lbNext}`} onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Siguiente"><ChevronRight size={28} /></button>
        </>
      )}
    </div>,
    document.body,
  );
}
```

`frontend/src/components/media/Gallery.jsx`:
```jsx
import { X } from 'lucide-react';
import s from './media.module.css';

export function Gallery({ files, onOpen, onDelete, children }) {
  return (
    <div className={s.grid}>
      {files.map((f, i) => (
        <div key={f.id} className={s.thumb}>
          <button type="button" className={s.thumbBtn} onClick={() => onOpen(i)} aria-label={`Ver foto ${i + 1}`}>
            <img src={f.url} alt="" loading="lazy" />
          </button>
          {onDelete && (
            <button type="button" className={s.thumbDel} onClick={() => onDelete(f)} aria-label="Borrar foto"><X size={14} /></button>
          )}
        </div>
      ))}
      {children}
    </div>
  );
}
```

`frontend/src/components/media/ImageUploader.jsx`:
```jsx
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { api } from '../../api/client.js';
import { uploadFile } from '../../lib/upload.js';
import { aspectWarning } from '../../lib/sizes.js';
import { toastBus } from '../../state/toastBus.js';
import { useConfirm } from '../ui/ConfirmDialog.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { Gallery } from './Gallery.jsx';
import { Lightbox } from './Lightbox.jsx';
import { SizeHint } from './SizeHint.jsx';
import s from './media.module.css';

export function ImageUploader({ ownerType, ownerId, files, invalidate = [], canEdit, canDelete, preset = 'photo', label = 'Agregar fotos', max = 20 }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const confirm = useConfirm();
  const [open, setOpen] = useState(null);
  const refresh = () => Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));

  const upload = useMutation({
    mutationFn: async (list) => {
      let ok = 0;
      try {
        for (const file of list) {
          const saved = await uploadFile({ ownerType, ownerId, file, kind: 'image' });
          ok++;
          const warn = saved.width && aspectWarning(saved.width, saved.height, preset);
          if (warn) toastBus.info(warn);
        }
      } finally {
        await refresh();
      }
      return ok;
    },
    meta: { success: false },
    onSuccess: (ok) => toastBus.success(ok === 1 ? 'Foto subida ✓' : `${ok} fotos subidas ✓`),
  });

  const remove = useMutation({
    mutationFn: (file) => api.del(`/files/${file.id}`),
    meta: { success: 'Foto borrada' },
    onSettled: refresh,
  });

  async function onDelete(file) {
    if (await confirm({ title: '¿Borrar esta foto?', confirmLabel: 'Borrar', danger: true })) remove.mutate(file);
  }

  function onPick(e) {
    const list = [...e.target.files];
    e.target.value = '';
    if (!list.length) return;
    if (files.length + list.length > max) {
      toastBus.error(`Máximo ${max} fotos acá.`);
      return;
    }
    upload.mutate(list);
  }

  return (
    <div className={s.uploader}>
      <Gallery files={files} onOpen={setOpen} onDelete={canEdit && canDelete ? onDelete : undefined}>
        {canEdit && files.length < max && (
          <button type="button" className={s.addTile} onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Spinner size={22} /> : <ImagePlus size={22} aria-hidden />}
            <span>{upload.isPending ? 'Subiendo…' : label}</span>
          </button>
        )}
      </Gallery>
      {canEdit && <SizeHint preset={preset} />}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={onPick} />
      {open != null && <Lightbox files={files} index={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
```

`frontend/src/components/media/PdfList.jsx`:
```jsx
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, Trash2, ExternalLink } from 'lucide-react';
import { api } from '../../api/client.js';
import { uploadFile } from '../../lib/upload.js';
import { useConfirm } from '../ui/ConfirmDialog.jsx';
import { Sheet } from '../ui/Sheet.jsx';
import { Button } from '../ui/Button.jsx';
import { SizeHint } from './SizeHint.jsx';
import s from './media.module.css';

// iOS no muestra bien PDFs dentro de un iframe: ahí se ofrece abrirlo
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function PdfList({ ownerType, ownerId, files, invalidate = [], canEdit, canDelete }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const confirm = useConfirm();
  const [viewing, setViewing] = useState(null);
  const refresh = () => Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));

  const upload = useMutation({
    mutationFn: (file) => uploadFile({ ownerType, ownerId, file, kind: 'pdf' }),
    meta: { success: 'PDF subido ✓' },
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (f) => api.del(`/files/${f.id}`), meta: { success: 'PDF borrado' }, onSettled: refresh });

  return (
    <div className={s.pdfs}>
      {files.map((f) => (
        <div key={f.id} className={s.pdfRow}>
          <button type="button" className={s.pdfOpen} onClick={() => setViewing(f)}>
            <FileText size={20} aria-hidden />
            <span className={s.pdfName}>{f.original_name || 'Documento.pdf'}</span>
            <span className={s.pdfSize}>{mb(f.bytes)}</span>
          </button>
          {canEdit && canDelete && (
            <button type="button" className={s.pdfDel} aria-label={`Borrar ${f.original_name}`}
              onClick={async () => (await confirm({ title: '¿Borrar este PDF?', confirmLabel: 'Borrar', danger: true })) && remove.mutate(f)}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <Button variant="secondary" size="sm" icon={Upload} loading={upload.isPending} onClick={() => input.current?.click()}>Subir PDF</Button>
          <SizeHint pdf />
          <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) upload.mutate(f); }} />
        </>
      )}
      <Sheet open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.original_name ?? 'PDF'} size="lg"
        footer={viewing && <Button variant="secondary" icon={ExternalLink} onClick={() => window.open(viewing.url, '_blank', 'noopener')}>Abrir en otra pestaña</Button>}>
        {viewing && (isIOS()
          ? <p className="muted">En iPhone el PDF se ve mejor fuera del sistema. Tocá “Abrir en otra pestaña”.</p>
          : <iframe title={`PDF ${viewing.original_name}`} src={viewing.url} className={s.pdfFrame} />)}
      </Sheet>
    </div>
  );
}
```

`frontend/src/components/media/EmbedPreview.jsx`:
```jsx
import { ExternalLink, Link2, HardDrive } from 'lucide-react';
import { parseEmbed } from '../../lib/embed.js';
import s from './media.module.css';

const NAMES = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', drive: 'Drive', link: null };

export function EmbedPreview({ url }) {
  const e = parseEmbed(url);
  if (!e) return <a href={url} target="_blank" rel="noreferrer">{url}</a>;
  const name = NAMES[e.provider] ?? e.host;
  return (
    <div className={s.embed}>
      {e.embedUrl && (
        <div className={`${s.embedFrame} ${s[e.aspect]}`}>
          <iframe title={`Vista previa de ${name}`} src={e.embedUrl} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      )}
      <a className={s.embedLink} href={e.openUrl} target="_blank" rel="noreferrer">
        {e.provider === 'drive' ? <HardDrive size={16} aria-hidden /> : e.embedUrl ? <ExternalLink size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
        <span>Abrir en {name}</span>
      </a>
    </div>
  );
}
```

`frontend/src/components/media/media.module.css`:
```css
.hint { display: flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--c-text-3); margin-top: var(--sp-2); }
.uploader { display: flex; flex-direction: column; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: var(--sp-2); }
.thumb { position: relative; aspect-ratio: 1; border-radius: var(--radius-m); overflow: hidden; background: var(--c-surface-2); }
.thumbBtn { width: 100%; height: 100%; padding: 0; border: 0; cursor: zoom-in; }
.thumbBtn img { width: 100%; height: 100%; object-fit: cover; }
.thumbDel { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; display: grid; place-items: center; border: 0; border-radius: 50%; background: rgb(0 0 0 / 0.55); color: #fff; cursor: pointer; }
.addTile { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 1.5px dashed var(--c-border-strong); border-radius: var(--radius-m); background: transparent; color: var(--c-text-2); font-size: var(--fs-xs); font-weight: 600; cursor: pointer; padding: var(--sp-2); text-align: center; }
.addTile:hover { border-color: var(--c-accent); color: var(--c-accent); }
.lightbox { position: fixed; inset: 0; z-index: 80; background: rgb(0 0 0 / 0.92); display: grid; place-items: center; }
.lightboxImg { max-width: 100vw; max-height: 100dvh; object-fit: contain; }
.lightboxBar { position: absolute; top: env(safe-area-inset-top); left: 0; right: 0; display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); color: #fff; font-size: var(--fs-s); }
.lightboxBar span { flex: 1; }
.lbBtn { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; background: rgb(255 255 255 / 0.12); color: #fff; cursor: pointer; }
.lbNav { position: absolute; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; display: grid; place-items: center; border: 0; border-radius: 50%; background: rgb(255 255 255 / 0.12); color: #fff; cursor: pointer; }
.lbPrev { left: var(--sp-3); }
.lbNext { right: var(--sp-3); }
.pdfs { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-start; }
.pdfRow { width: 100%; display: flex; align-items: center; gap: var(--sp-2); }
.pdfOpen { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--sp-3); min-height: 52px; padding: 0 var(--sp-3); border: 1px solid var(--c-border); border-radius: var(--radius-m); background: var(--c-surface); cursor: pointer; text-align: left; color: var(--c-text); }
.pdfOpen svg { color: var(--c-danger); flex: none; }
.pdfName { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.pdfSize { font-size: var(--fs-xs); color: var(--c-text-3); }
.pdfDel { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: var(--radius-m); background: transparent; color: var(--c-text-3); cursor: pointer; }
.pdfDel:hover { background: var(--c-danger-soft); color: var(--c-danger); }
.pdfFrame { width: 100%; height: 75dvh; border: 0; border-radius: var(--radius-m); background: var(--c-surface-2); }
.embed { display: flex; flex-direction: column; gap: var(--sp-2); }
.embedFrame { width: 100%; border-radius: var(--radius-m); overflow: hidden; background: var(--c-surface-2); }
.embedFrame iframe { width: 100%; height: 100%; border: 0; display: block; }
.vertical { max-width: 340px; height: 600px; }
.post { max-width: 400px; height: 560px; }
.wide { aspect-ratio: 16 / 9; }
.embedLink { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: var(--fs-s); }
```


- [ ] **Step 5: Correr y ver que pasan**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(front): compresión de imágenes con fallback JPEG, medidas recomendadas, embeds y archivos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Pantalla de Ideas

**Files:**
- Create: `frontend/src/lib/groupIdeas.js`
- Create: `frontend/src/pages/ideas/api.js`, `IdeasPage.jsx`, `IdeaRow.jsx`, `IdeaSheet.jsx`, `IdeaForm.jsx`, `IdeaActivity.jsx`, `ideas.module.css`
- Modify: `frontend/src/App.jsx` (reemplazar el placeholder `IdeasPage`)
- Test: `frontend/src/lib/groupIdeas.test.js`, `frontend/src/pages/ideas/IdeasPage.test.jsx`

**Interfaces:**
- Consumes: `api`, `useOptimisticMutation`, `usePersistentState`, `useDraft`, `useCan`, `useAuth`, UI kit, `ImageUploader`, `EmbedPreview`, `deriveIdeaStatus`, `CATEGORY_LABELS`, `formatShort`, `todayART`, `relativeTime`.
- Produces (`groupIdeas.js`): `FORMAT_FILTERS`, `TYPE_FILTERS`, `STATUS_FILTERS`, `filterIdeas(ideas, { format, category, status, q })`, `groupIdeas(ideas) → [{ key, title, ideas, summary }]`, `summarize(ideas) → '3 por decidir · 1 por hacer'`, `countByStatus(ideas)`.
- Produces (`pages/ideas/api.js`): `ideaKeys`, `useIdeas()`, `useIdea(id)`, `useIdeaActivity(id, enabled)`, `useClients()`, `useDirectory()`, `useCreateIdea()`, `useUpdateIdea(id, meta?)`, `useIdeaAction(id)` (`mutate({ action: 'decide'|'undecide'|'complete'|'reopen', body? })`), `useDeleteIdea()`.
- Produces: `IdeasPage` (rutas `/ideas`, `/ideas/:id`, `/ideas/nueva`).

- [ ] **Step 1: Tests que fallan**

`frontend/src/lib/groupIdeas.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { filterIdeas, groupIdeas, summarize } from './groupIdeas.js';

const idea = (o) => ({ id: Math.random().toString(36), kind: 'idea', format: 'video', category: 'domingo', status: 'por_decidir', text: 'x', client_name: null, created_at: '2026-10-01T10:00:00Z', ...o });

const ideas = [
  idea({ text: 'Fotos catálogo', kind: 'must', category: 'producto', format: 'photo', status: 'si_o_si' }),
  idea({ text: 'Humor delantal', status: 'por_hacer' }),
  idea({ text: 'Humor cocina', status: 'por_decidir' }),
  idea({ text: 'Entrega Wonder', category: 'viernes', client_name: 'Estudio Wonder' }),
  idea({ text: 'Entrega POSTA', category: 'viernes', client_name: 'POSTA', status: 'realizada' }),
  idea({ text: 'Sin cliente', category: 'viernes' }),
  idea({ text: 'Behind', category: 'otra', status: 'no_se_hace' }),
];

describe('agrupado de ideas', () => {
  it('orden: sí o sí → domingo → un grupo por cliente de viernes → producto → otros', () => {
    expect(groupIdeas(ideas).map((g) => g.title)).toEqual([
      '📌 Sí o sí', 'Domingo · humor', 'Viernes · Estudio Wonder', 'Viernes · POSTA', 'Viernes · sin cliente', 'Otros',
    ]);
  });

  it('dentro del grupo: por decidir antes que por hacer', () => {
    const domingo = groupIdeas(ideas).find((g) => g.key === 'domingo');
    expect(domingo.ideas.map((i) => i.text)).toEqual(['Humor cocina', 'Humor delantal']);
    expect(domingo.summary).toBe('1 por decidir · 1 por hacer');
  });

  it('filtros combinables y búsqueda sin acentos', () => {
    expect(filterIdeas(ideas, { format: 'photo' }).map((i) => i.text)).toEqual(['Fotos catálogo']);
    expect(filterIdeas(ideas, { category: 'viernes', status: 'realizada' }).map((i) => i.text)).toEqual(['Entrega POSTA']);
    expect(filterIdeas(ideas, { q: 'catalogo' }).map((i) => i.text)).toEqual(['Fotos catálogo']);
    expect(filterIdeas(ideas, { q: 'wonder' })).toHaveLength(1);
  });

  it('summarize omite estados en cero', () => {
    expect(summarize([idea({ status: 'realizada' })])).toBe('1 realizada');
    expect(summarize([idea({ status: 'no_se_hace' }), idea({ status: 'no_se_hace' })])).toBe('2 no se hacen');
  });
});
```

`frontend/src/pages/ideas/IdeasPage.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { AuthProvider } from '../../state/auth.jsx';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { IdeasPage } from './IdeasPage.jsx';

const me = { id: 'u1', name: 'Santi', can_delete: false, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' } };
const ideas = [
  { id: 'a', kind: 'idea', format: 'video', category: 'domingo', status: 'por_decidir', decision: 'pending', text: 'Reel humor delantal', created_at: '2026-10-01T10:00:00Z', ref_count: 0 },
  { id: 'b', kind: 'must', format: 'photo', category: 'producto', status: 'si_o_si', decision: 'pending', text: 'Fotos catálogo', due_date: '2026-10-20', created_at: '2026-10-02T10:00:00Z', ref_count: 2 },
];
const detail = { ...ideas[0], ref_files: [], result_files: [], calendar_links: [], note_santi: null, note_sofi: 'Grabar con luz natural\nfondo blanco' };
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function renderAt(path) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ConfirmProvider>
            <Routes>
              <Route path="/ideas" element={<IdeasPage />} />
              <Route path="/ideas/:id" element={<IdeasPage />} />
            </Routes>
          </ConfirmProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('IdeasPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: me });
      if (url === '/api/ideas') return json({ ideas });
      if (url === '/api/ideas/a' && (!opts.method || opts.method === 'GET')) return json({ idea: detail });
      if (url === '/api/ideas/a/complete') return json({ error: { code: 'X', message: 'no debería llamarse' } }, 500);
      if (url === '/api/users/directory') return json({ users: [] });
      if (url === '/api/clients') return json({ clients: [] });
      return json({});
    });
  });

  it('grupos cerrados con contador; al abrir se ven las filas', async () => {
    renderAt('/ideas');
    const group = await screen.findByRole('button', { name: /Domingo · humor/ });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Reel humor delantal')).not.toBeInTheDocument();
    await userEvent.click(group);
    expect(screen.getByText('Reel humor delantal')).toBeInTheDocument();
  });

  it('filtro por formato deja solo el grupo que corresponde', async () => {
    renderAt('/ideas');
    await screen.findByRole('button', { name: /Domingo · humor/ });
    await userEvent.click(within(screen.getByRole('group', { name: 'Formato' })).getByRole('button', { name: 'Fotos' }));
    expect(screen.queryByRole('button', { name: /Domingo · humor/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /📌 Sí o sí/ })).toBeInTheDocument();
  });

  it('detalle: notas completas y acciones "Sí, la hago / No la hago"', async () => {
    renderAt('/ideas/a');
    expect(await screen.findByRole('button', { name: 'Sí, la hago' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No la hago' })).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Grabar con luz natural\nfondo blanco/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd frontend && npx vitest run src/lib/groupIdeas.test.js src/pages/ideas`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Agrupado y API de ideas**

`frontend/src/lib/groupIdeas.js`:
```js
import { IDEA_STATUS_ORDER } from './ideaStatus.js';

export const FORMAT_FILTERS = [{ value: 'all', label: 'Todo' }, { value: 'video', label: 'Videos' }, { value: 'photo', label: 'Fotos' }];
export const TYPE_FILTERS = [
  { value: 'all', label: 'Todos' }, { value: 'domingo', label: 'Domingo' }, { value: 'viernes', label: 'Viernes' },
  { value: 'producto', label: 'Producto' }, { value: 'otra', label: 'Otros' },
];
export const STATUS_FILTERS = [
  { value: 'all', label: 'Todas' }, { value: 'si_o_si', label: 'Sí o sí' }, { value: 'por_decidir', label: 'Por decidir' },
  { value: 'por_hacer', label: 'Por hacer' }, { value: 'realizada', label: 'Realizadas' }, { value: 'no_se_hace', label: 'No se hacen' },
];

const SUMMARY_WORDS = {
  si_o_si: ['sí o sí', 'sí o sí'], por_decidir: ['por decidir', 'por decidir'], por_hacer: ['por hacer', 'por hacer'],
  realizada: ['realizada', 'realizadas'], no_se_hace: ['no se hace', 'no se hacen'],
};

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterIdeas(ideas, { format = 'all', category = 'all', status = 'all', q = '' } = {}) {
  const needle = norm(q.trim());
  return ideas.filter((i) => (format === 'all' || i.format === format)
    && (category === 'all' || i.category === category)
    && (status === 'all' || i.status === status)
    && (!needle || norm(`${i.text} ${i.client_name} ${i.note_santi} ${i.note_sofi}`).includes(needle)));
}

export function countByStatus(ideas) {
  const c = Object.fromEntries(IDEA_STATUS_ORDER.map((s) => [s, 0]));
  for (const i of ideas) c[i.status]++;
  return c;
}

export function summarize(ideas) {
  const c = countByStatus(ideas);
  return IDEA_STATUS_ORDER.filter((s) => c[s]).map((s) => `${c[s]} ${SUMMARY_WORDS[s][c[s] === 1 ? 0 : 1]}`).join(' · ');
}

const byStatusThenNewest = (a, b) => IDEA_STATUS_ORDER.indexOf(a.status) - IDEA_STATUS_ORDER.indexOf(b.status)
  || new Date(b.created_at) - new Date(a.created_at);

export function groupIdeas(ideas) {
  const groups = [];
  const push = (key, title, list) => {
    if (list.length) groups.push({ key, title, ideas: [...list].sort(byStatusThenNewest), summary: summarize(list) });
  };
  push('must', '📌 Sí o sí', ideas.filter((i) => i.kind === 'must'));
  const rest = ideas.filter((i) => i.kind !== 'must');
  push('domingo', 'Domingo · humor', rest.filter((i) => i.category === 'domingo'));
  const viernes = rest.filter((i) => i.category === 'viernes');
  const clients = [...new Set(viernes.map((i) => i.client_name ?? ''))]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')));
  for (const c of clients) push(`viernes:${c}`, c ? `Viernes · ${c}` : 'Viernes · sin cliente', viernes.filter((i) => (i.client_name ?? '') === c));
  push('producto', 'Producto · catálogo', rest.filter((i) => i.category === 'producto'));
  push('otra', 'Otros', rest.filter((i) => i.category === 'otra'));
  return groups;
}
```

`frontend/src/pages/ideas/api.js`:
```js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useOptimisticMutation } from '../../hooks/useOptimisticMutation.js';
import { deriveIdeaStatus } from '../../lib/ideaStatus.js';
import { toastBus } from '../../state/toastBus.js';

export const ideaKeys = { all: ['ideas'], one: (id) => ['ideas', id], activity: (id) => ['ideas', id, 'activity'] };

export const useIdeas = () => useQuery({ queryKey: ideaKeys.all, queryFn: () => api.get('/ideas').then((r) => r.ideas) });
export const useIdea = (id) => useQuery({ queryKey: ideaKeys.one(id), queryFn: () => api.get(`/ideas/${id}`).then((r) => r.idea), enabled: Boolean(id) && id !== 'nueva' });
export const useIdeaActivity = (id, enabled) => useQuery({ queryKey: ideaKeys.activity(id), queryFn: () => api.get(`/ideas/${id}/activity`).then((r) => r.activity), enabled });
export const useClients = () => useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then((r) => r.clients), staleTime: 5 * 60_000 });
export const useDirectory = () => useQuery({ queryKey: ['directory'], queryFn: () => api.get('/users/directory').then((r) => r.users), staleTime: 5 * 60_000 });

function invalidateIdeas(qc) {
  return Promise.all([['ideas'], ['home'], ['clients'], ['calendar']].map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post('/ideas', body).then((r) => r.idea),
    meta: { success: 'Idea creada ✓' },
    onSuccess: () => invalidateIdeas(qc),
  });
}

export function useUpdateIdea(id, meta) {
  return useOptimisticMutation({
    mutationFn: (patch) => api.patch(`/ideas/${id}`, patch).then((r) => r.idea),
    queryKey: ideaKeys.one(id),
    apply: (old, patch) => ({ ...old, ...patch }),
    invalidate: [ideaKeys.all, ['home'], ['clients'], ideaKeys.activity(id)],
    meta,
  });
}

const ACTION_MSG = {
  decide: (b) => (b.decision === 'yes' ? '¡Buenísimo! Quedó en "Por hacer".' : 'Listo, queda como "No se hace".'),
  undecide: () => 'Decisión deshecha',
  complete: () => '¡Realizada! ✓',
  reopen: () => 'La idea volvió a "Por hacer"',
};

function applyAction(old, action, body = {}) {
  const next = { ...old };
  if (action === 'decide') next.decision = body.decision;
  if (action === 'undecide') next.decision = 'pending';
  if (action === 'complete') Object.assign(next, { done_at: new Date().toISOString(), result_url: body.result_url });
  if (action === 'reopen') next.done_at = null;
  return { ...next, status: deriveIdeaStatus(next) };
}

export function useIdeaAction(id) {
  return useOptimisticMutation({
    mutationFn: async ({ action, body }) => {
      const idea = (await api.post(`/ideas/${id}/${action}`, body)).idea;
      toastBus.success(ACTION_MSG[action](body ?? {}));
      return idea;
    },
    queryKey: ideaKeys.one(id),
    apply: (old, { action, body }) => applyAction(old, action, body),
    invalidate: [ideaKeys.all, ['home'], ideaKeys.activity(id)],
    meta: { success: false },
  });
}

export function useDeleteIdea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.del(`/ideas/${id}`),
    meta: { success: 'Idea borrada' },
    onSuccess: () => invalidateIdeas(qc),
  });
}
```

- [ ] **Step 4: Pantallas**

`frontend/src/pages/ideas/IdeaRow.jsx`:
```jsx
import { Clapperboard, Camera, Image as ImageIcon, CalendarClock } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { formatShort, todayART } from '../../lib/dates.js';
import s from './ideas.module.css';

const firstLine = (text) => text.split('\n')[0];

export function IdeaRow({ idea, onOpen }) {
  const Icon = idea.format === 'video' ? Clapperboard : Camera;
  const overdue = idea.due_date && idea.due_date < todayART() && idea.status !== 'realizada';
  return (
    <button type="button" className={s.row} onClick={onOpen}>
      <span className={`${s.formatIcon} ${s[idea.format]}`} title={idea.format === 'video' ? 'Video' : 'Foto'}><Icon size={18} aria-hidden /></span>
      <span className={s.rowMain}>
        <span className={s.rowTitle}>{firstLine(idea.text)}</span>
        {(idea.due_date || idea.ref_count > 0 || idea.assignee_name) && (
          <span className={s.rowMeta}>
            {idea.due_date && <span className={overdue ? s.overdue : ''}><CalendarClock size={12} aria-hidden /> {overdue ? 'Vencida' : 'Hasta'} {formatShort(idea.due_date)}</span>}
            {idea.ref_count > 0 && <span><ImageIcon size={12} aria-hidden /> {idea.ref_count}</span>}
            {idea.assignee_name && <span>{idea.assignee_name}</span>}
          </span>
        )}
      </span>
      <StatusBadge kind="idea" status={idea.status} />
    </button>
  );
}
```

`frontend/src/pages/ideas/IdeaForm.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDraft } from '../../hooks/useDraft.js';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { CATEGORY_LABELS } from '../../lib/ideaStatus.js';
import { useClients, useCreateIdea, useDirectory, useUpdateIdea } from './api.js';
import s from './ideas.module.css';

const EMPTY = { kind: 'idea', format: 'video', category: 'domingo', text: '', client_name: '', assignee_id: '', reference_url: '', due_date: '', note_sofi: '' };

const toForm = (i) => ({
  kind: i.kind, format: i.format, category: i.category, text: i.text, client_name: i.client_name ?? '',
  assignee_id: i.assignee_id ?? '', reference_url: i.reference_url ?? '', due_date: i.due_date ?? '',
});

function toBody(f, isNew) {
  const nul = (v) => (v === '' ? null : v);
  return {
    kind: f.kind, format: f.format, category: f.category, text: f.text,
    client_name: f.category === 'viernes' ? nul(f.client_name.trim()) : null,
    assignee_id: nul(f.assignee_id), reference_url: nul(f.reference_url.trim()),
    due_date: f.kind === 'must' ? nul(f.due_date) : null,
    ...(isNew ? { note_sofi: nul(f.note_sofi) } : {}),
  };
}

// Formulario de alta y edición. formId permite que el botón de guardar viva en el pie de la hoja.
export function IdeaForm({ formId, initial, onSaved }) {
  const isNew = !initial;
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const { data: users = [] } = useDirectory();
  const [form, setForm, clearDraft] = useDraft(isNew ? 'idea-new' : `idea-${initial.id}`, isNew ? EMPTY : toForm(initial));
  const [errors, setErrors] = useState({});
  const create = useCreateIdea();
  const update = useUpdateIdea(initial?.id, { success: 'Cambios guardados ✓' });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  // Por defecto las ideas nuevas son para Santi (el que graba)
  useEffect(() => {
    if (isNew && !form.assignee_id) {
      const santi = users.find((u) => u.name.toLowerCase().startsWith('santi'));
      if (santi) setForm((f) => ({ ...f, assignee_id: santi.id }));
    }
  }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(e) {
    e.preventDefault();
    if (!form.text.trim()) return setErrors({ text: 'Escribí la idea' });
    setErrors({});
    const body = toBody(form, isNew);
    const opts = { onError: (err) => setErrors(err.fields ?? {}) };
    if (isNew) {
      create.mutate(body, { ...opts, onSuccess: (idea) => { clearDraft(); navigate(`/ideas/${idea.id}`, { replace: true }); } });
    } else {
      update.mutate(body, { ...opts, onSuccess: () => { clearDraft(); onSaved?.(); } });
    }
  }

  return (
    <form id={formId} className={s.form} onSubmit={onSubmit} noValidate>
      <Segmented label="Tipo" value={form.kind} onChange={set('kind')} options={[{ value: 'idea', label: '💡 Idea' }, { value: 'must', label: '📌 Sí o sí' }]} />
      <p className={s.formHelp}>{form.kind === 'idea' ? 'Santi decide si la hace.' : 'Contenido obligatorio: va directo a "por hacer".'}</p>
      <Segmented label="Formato" value={form.format} onChange={set('format')} options={[{ value: 'video', label: '🎬 Video' }, { value: 'photo', label: '📷 Foto' }]} />
      <Field label="Tipo de contenido">
        <Select value={form.category} onChange={set('category')}>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      {form.category === 'viernes' && (
        <Field label="Cliente" hint="Elegí uno de la lista o escribí uno nuevo.">
          <Input list="clients-list" value={form.client_name} onChange={set('client_name')} placeholder="Ej.: Estudio Wonder" autoComplete="off" />
        </Field>
      )}
      <datalist id="clients-list">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <Field label="Idea" required error={errors.text}>
        <Textarea value={form.text} onChange={set('text')} minRows={4} placeholder="¿Qué hay que grabar o fotografiar? Contalo con todo el detalle que quieras." />
      </Field>
      <Field label="Asignada a">
        <Select value={form.assignee_id} onChange={set('assignee_id')}>
          <option value="">Sin asignar</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Link de referencia" hint="Reel de IG, TikTok, Pinterest…" error={errors.reference_url}>
        <Input type="url" inputMode="url" value={form.reference_url} onChange={set('reference_url')} placeholder="https://" />
      </Field>
      {form.kind === 'must' && (
        <Field label="Fecha límite" error={errors.due_date}>
          <Input type="date" value={form.due_date} onChange={set('due_date')} />
        </Field>
      )}
      {isNew && (
        <Field label="Nota de Sofi (opcional)">
          <Textarea value={form.note_sofi} onChange={set('note_sofi')} minRows={2} />
        </Field>
      )}
      {isNew && form.format === 'photo' && <p className={s.formHelp}>Las fotos de referencia se suben después de guardar.</p>}
    </form>
  );
}

```

`frontend/src/pages/ideas/IdeaActivity.jsx`:
```jsx
import { useIdeaActivity } from './api.js';
import { relativeTime } from '../../lib/dates.js';
import { Spinner } from '../../components/ui/Spinner.jsx';
import s from './ideas.module.css';

const FIELD = { text: 'el texto', kind: 'el tipo', format: 'el formato', category: 'el tipo de contenido', client_id: 'el cliente', assignee_id: 'a quién está asignada', reference_url: 'el link de referencia', due_date: 'la fecha límite', note_santi: 'la nota de Santi', note_sofi: 'la nota de Sofi', decision: 'la decisión' };
const ACTION = { create: 'creó la idea', decide_yes: 'marcó "Sí, la hago"', decide_no: 'marcó "No la hago"', undecide: 'deshizo la decisión', complete: 'la marcó como realizada', reopen: 'la reabrió' };

function describe(a) {
  if (a.action !== 'update') return ACTION[a.action] ?? a.action;
  const fields = Object.keys(a.diff ?? {}).filter((f) => !f.endsWith('_by')).map((f) => FIELD[f] ?? f);
  return `cambió ${fields.join(', ')}`;
}

export function IdeaActivity({ id }) {
  const { data, isPending } = useIdeaActivity(id, true);
  if (isPending) return <div className={s.pad}><Spinner /></div>;
  return (
    <ul className={s.activity}>
      {data.map((a) => (
        <li key={a.id}><strong>{a.actor_name ?? 'Alguien'}</strong> {describe(a)} <span className="muted">· {relativeTime(a.created_at)}</span></li>
      ))}
    </ul>
  );
}
```

`frontend/src/pages/ideas/IdeaSheet.jsx`:
```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, CalendarPlus, Clapperboard, Camera, CalendarDays } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth, useCan } from '../../state/auth.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input, Textarea } from '../../components/ui/Field.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { ImageUploader } from '../../components/media/ImageUploader.jsx';
import { EmbedPreview } from '../../components/media/EmbedPreview.jsx';
import { CATEGORY_LABELS } from '../../lib/ideaStatus.js';
import { formatShort, todayART } from '../../lib/dates.js';
import { useDeleteIdea, useIdea, useIdeaAction, useUpdateIdea, ideaKeys } from './api.js';
import { IdeaForm } from './IdeaForm.jsx';
import { IdeaActivity } from './IdeaActivity.jsx';
import s from './ideas.module.css';

function NoteField({ idea, field, label, canEdit }) {
  const update = useUpdateIdea(idea.id, { success: 'Nota guardada ✓' });
  const [value, setValue] = useState(idea[field] ?? '');
  const by = idea[`${field}_by_name`];
  const save = () => {
    if ((idea[field] ?? '') !== value) update.mutate({ [field]: value.trim() === '' ? null : value });
  };
  return (
    <Field label={by ? `${label} · ${by}` : label}>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} readOnly={!canEdit} minRows={2} placeholder={canEdit ? 'Escribí una nota…' : 'Sin nota'} />
    </Field>
  );
}

function ScheduleIdea({ idea }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayART());
  const [open, setOpen] = useState(false);
  const channels = idea.category === 'domingo' || idea.category === 'viernes' ? ['ig_reel', 'tiktok'] : idea.format === 'photo' ? ['ig_post'] : ['ig_reel'];
  const schedule = useMutation({
    mutationFn: () => api.post('/calendar', { date, title: idea.text.split('\n')[0].slice(0, 300), idea_id: idea.id, channels }),
    meta: { success: 'Agregada al calendario ✓' },
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ideaKeys.one(idea.id) });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
  if (!open) return <Button variant="secondary" size="sm" icon={CalendarPlus} onClick={() => setOpen(true)}>Programar en el calendario</Button>;
  return (
    <div className={s.inline}>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Día de publicación" />
      <Button size="sm" loading={schedule.isPending} onClick={() => schedule.mutate()}>Agregar</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
    </div>
  );
}

export function IdeaSheet({ id, onClose }) {
  const { data: idea, isPending, isError } = useIdea(id);
  const can = useCan();
  const { user } = useAuth();
  const canEdit = can('ideas', 'edit');
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [resultError, setResultError] = useState(null);
  const action = useIdeaAction(id);
  const del = useDeleteIdea();
  const confirm = useConfirm();

  if (isPending || isError) {
    return (
      <Sheet open onClose={onClose} title="Idea">
        {isPending ? <div className={s.pad}><Spinner /></div> : <p className="muted">No encontramos esta idea. Puede que la hayan borrado.</p>}
      </Sheet>
    );
  }

  const run = (act, body) => action.mutate({ action: act, body });
  function submitComplete() {
    if (!/^https?:\/\/\S+$/i.test(resultUrl.trim())) {
      setResultError('Pegá el link del resultado (Drive, Instagram, TikTok…)');
      return;
    }
    setResultError(null);
    action.mutate({ action: 'complete', body: { result_url: resultUrl.trim() } }, { onSuccess: () => setCompleting(false) });
  }

  let footer = null;
  if (canEdit && !editing) {
    if (completing) {
      footer = <><Button variant="secondary" onClick={() => setCompleting(false)}>Cancelar</Button><Button onClick={submitComplete} loading={action.isPending}>Marcar realizada</Button></>;
    } else if (idea.status === 'por_decidir') {
      footer = <><Button variant="secondary" onClick={() => run('decide', { decision: 'no' })}>No la hago</Button><Button onClick={() => run('decide', { decision: 'yes' })}>Sí, la hago</Button></>;
    } else if (idea.status === 'por_hacer' || idea.status === 'si_o_si') {
      footer = <>{idea.status === 'por_hacer' && <Button variant="ghost" onClick={() => run('undecide')}>Deshacer</Button>}<Button onClick={() => setCompleting(true)}>Ya la hice</Button></>;
    } else if (idea.status === 'realizada') {
      footer = <Button variant="secondary" onClick={() => run('reopen')}>Reabrir</Button>;
    } else if (idea.status === 'no_se_hace') {
      footer = <Button variant="secondary" onClick={() => run('undecide')}>Deshacer "No la hago"</Button>;
    }
  }
  if (editing) {
    footer = <><Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button><Button type="submit" form="idea-edit">Guardar cambios</Button></>;
  }

  async function onDelete() {
    if (await confirm({ title: '¿Borrar esta idea?', message: 'Se borran también sus fotos. No se puede deshacer.', confirmLabel: 'Borrar', danger: true })) {
      del.mutate(id, { onSuccess: onClose });
    }
  }

  const FormatIcon = idea.format === 'video' ? Clapperboard : Camera;
  return (
    <Sheet open onClose={onClose} title={idea.kind === 'must' ? '📌 Sí o sí' : '💡 Idea'} size="lg" footer={footer}>
      {editing ? (
        <IdeaForm formId="idea-edit" initial={idea} onSaved={() => setEditing(false)} />
      ) : (
        <div className={s.detail}>
          <div className={s.badges}>
            <StatusBadge kind="idea" status={idea.status} />
            <span className={s.tag}><FormatIcon size={14} aria-hidden /> {idea.format === 'video' ? 'Video' : 'Foto'}</span>
            <span className={s.tag}>{CATEGORY_LABELS[idea.category]}{idea.client_name ? ` · ${idea.client_name}` : ''}</span>
            {idea.due_date && <span className={s.tag}>Hasta {formatShort(idea.due_date)}</span>}
          </div>

          {completing && (
            <div className={s.completeBox}>
              <Field label="Link del resultado" required error={resultError} hint="Donde quedó el video o las fotos: Drive, Instagram, TikTok…">
                <Input type="url" inputMode="url" autoFocus value={resultUrl} onChange={(e) => setResultUrl(e.target.value)} placeholder="https://" />
              </Field>
            </div>
          )}

          <p className={`prewrap ${s.text}`}>{idea.text}</p>
          <div className={s.metaRow}>
            {idea.assignee_name && <span className={s.assignee}><Avatar user={{ name: idea.assignee_name, avatar_color: idea.assignee_color }} size={22} /> {idea.assignee_name}</span>}
            {canEdit && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>}
          </div>

          {idea.status === 'realizada' && idea.result_url && (
            <section className={s.section}>
              <h3>Resultado</h3>
              <EmbedPreview url={idea.result_url} />
              {(idea.format === 'photo' || idea.result_files.length > 0) && (
                <ImageUploader ownerType="idea_result" ownerId={idea.id} files={idea.result_files} invalidate={[ideaKeys.one(id), ideaKeys.all, ['home']]}
                  canEdit={canEdit} canDelete={user.can_delete} label="Subir fotos del resultado" />
              )}
            </section>
          )}

          {idea.reference_url && (
            <section className={s.section}>
              <h3>Referencia</h3>
              <EmbedPreview url={idea.reference_url} />
            </section>
          )}

          {(idea.format === 'photo' || idea.ref_files.length > 0) && (
            <section className={s.section}>
              <h3>Fotos de referencia</h3>
              <ImageUploader ownerType="idea_ref" ownerId={idea.id} files={idea.ref_files} invalidate={[ideaKeys.one(id), ideaKeys.all]}
                canEdit={canEdit} canDelete={user.can_delete} />
            </section>
          )}

          <section className={s.section}>
            <h3>Notas</h3>
            <NoteField key={`s-${idea.note_santi}`} idea={idea} field="note_santi" label="Nota de Santi" canEdit={canEdit} />
            <NoteField key={`f-${idea.note_sofi}`} idea={idea} field="note_sofi" label="Nota de Sofi" canEdit={canEdit} />
          </section>

          {can('calendar') && (
            <section className={s.section}>
              <h3>Calendario</h3>
              {idea.calendar_links.length > 0 && (
                <div className={s.badges}>
                  {idea.calendar_links.map((l) => (
                    <Link key={l.id} to={`/calendario/${l.date}`} className={s.tag}><CalendarDays size={14} aria-hidden /> {formatShort(l.date)}</Link>
                  ))}
                </div>
              )}
              {can('calendar', 'edit') && <ScheduleIdea idea={idea} />}
            </section>
          )}

          <Collapsible title="Historial de cambios"><IdeaActivity id={idea.id} /></Collapsible>

          {canEdit && user.can_delete && (
            <Button variant="danger" size="sm" icon={Trash2} onClick={onDelete} loading={del.isPending}>Borrar idea</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
```

`frontend/src/pages/ideas/IdeasPage.jsx`:
```jsx
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, Lightbulb } from 'lucide-react';
import { useCan } from '../../state/auth.jsx';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Chip, ChipGroup } from '../../components/ui/Chip.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Fab } from '../../components/shell/Fab.jsx';
import { FORMAT_FILTERS, TYPE_FILTERS, STATUS_FILTERS, filterIdeas, groupIdeas, countByStatus } from '../../lib/groupIdeas.js';
import { useIdeas, useCreateIdea } from './api.js';
import { IdeaRow } from './IdeaRow.jsx';
import { IdeaSheet } from './IdeaSheet.jsx';
import { IdeaForm } from './IdeaForm.jsx';
import s from './ideas.module.css';
import p from '../pages.module.css';

const DEFAULT_FILTERS = { format: 'all', category: 'all', status: 'all' };

function NewIdeaSheet({ onClose }) {
  const create = useCreateIdea();
  return (
    <Sheet open onClose={onClose} title="Nueva idea" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="idea-new" loading={create.isPending}>Guardar idea</Button></>}>
      <IdeaForm formId="idea-new" />
    </Sheet>
  );
}

export function IdeasPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canEdit = useCan()('ideas', 'edit');
  const { data: ideas, isPending } = useIdeas();
  const [filters, setFilters] = usePersistentState('ideas-filters', DEFAULT_FILTERS);
  const [openGroups, setOpenGroups] = usePersistentState('ideas-open', {});
  const [q, setQ] = useState('');

  const all = ideas ?? [];
  const groups = useMemo(() => groupIdeas(filterIdeas(all, { ...filters, q })), [all, filters, q]);
  const counts = useMemo(() => countByStatus(all), [all]);
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const filtered = filters.format !== 'all' || filters.category !== 'all' || filters.status !== 'all' || q;
  const close = () => navigate('/ideas');

  return (
    <>
      <PageHeader
        title="Ideas"
        subtitle={`${counts.por_decidir} por decidir · ${counts.por_hacer + counts.si_o_si} por hacer`}
        actions={canEdit && <Button className="desktop-only" icon={Plus} onClick={() => navigate('/ideas/nueva')}>Nueva idea</Button>}
      />
      <div className={p.page}>
        <div className={s.filters}>
          <label className={s.search}>
            <Search size={18} aria-hidden />
            <input type="search" placeholder="Buscar en ideas, clientes y notas" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ideas" />
          </label>
          <ChipGroup label="Formato">
            {FORMAT_FILTERS.map((f) => <Chip key={f.value} selected={filters.format === f.value} onClick={() => setFilter('format', f.value)}>{f.label}</Chip>)}
          </ChipGroup>
          <ChipGroup label="Tipo">
            {TYPE_FILTERS.map((f) => <Chip key={f.value} selected={filters.category === f.value} onClick={() => setFilter('category', f.value)}>{f.label}</Chip>)}
          </ChipGroup>
          <ChipGroup label="Estado">
            {STATUS_FILTERS.map((f) => (
              <Chip key={f.value} selected={filters.status === f.value} onClick={() => setFilter('status', f.value)} count={f.value === 'all' ? undefined : counts[f.value]}>{f.label}</Chip>
            ))}
          </ChipGroup>
          {filtered && <button type="button" className={s.clear} onClick={() => { setFilters(DEFAULT_FILTERS); setQ(''); }}>Limpiar filtros</button>}
        </div>

        {isPending ? (
          <div className={p.center}><Spinner size={28} label="Cargando ideas" /></div>
        ) : groups.length === 0 ? (
          <EmptyState icon={Lightbulb} title={filtered ? 'No hay ideas con estos filtros' : 'Todavía no hay ideas'}
            action={canEdit && !filtered && <Button icon={Plus} onClick={() => navigate('/ideas/nueva')}>Cargar la primera</Button>}>
            {filtered ? 'Probá sacando algún filtro.' : 'Cargá una idea y Santi decide si la hace.'}
          </EmptyState>
        ) : (
          <div className={s.groups}>
            {groups.map((g) => (
              <Collapsible key={g.key} title={g.title} count={g.ideas.length} summary={g.summary}
                open={Boolean(q) || Boolean(openGroups[g.key])} onToggle={(o) => setOpenGroups((prev) => ({ ...prev, [g.key]: o }))}>
                {g.ideas.map((i) => <IdeaRow key={i.id} idea={i} onOpen={() => navigate(`/ideas/${i.id}`)} />)}
              </Collapsible>
            ))}
          </div>
        )}
      </div>
      {canEdit && <Fab icon={Plus} label="Nueva idea" onClick={() => navigate('/ideas/nueva')} />}
      {id === 'nueva' && canEdit && <NewIdeaSheet onClose={close} />}
      {id && id !== 'nueva' && <IdeaSheet key={id} id={id} onClose={close} />}
    </>
  );
}
```

`frontend/src/pages/ideas/ideas.module.css`:
```css
.filters { display: flex; flex-direction: column; gap: var(--sp-2); margin-bottom: var(--sp-4); }
.search { display: flex; align-items: center; gap: var(--sp-2); height: var(--tap); padding: 0 var(--sp-3); border-radius: var(--radius-m); background: var(--c-surface); border: 1px solid var(--c-border); color: var(--c-text-3); }
.search:focus-within { border-color: var(--c-accent); box-shadow: 0 0 0 3px var(--c-accent-soft); }
.search input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 16px; color: var(--c-text); min-width: 0; }
.clear { align-self: flex-start; border: 0; background: none; color: var(--c-accent-text); font-weight: 600; font-size: var(--fs-s); cursor: pointer; padding: 4px 0; }
.groups { display: flex; flex-direction: column; gap: var(--sp-3); }
.row { width: 100%; display: flex; align-items: center; gap: var(--sp-3); min-height: 60px; padding: var(--sp-2) var(--sp-4); border: 0; border-bottom: 1px solid var(--c-border); background: transparent; text-align: left; cursor: pointer; color: var(--c-text); }
.row:last-child { border-bottom: 0; }
.row:hover { background: var(--c-surface-2); }
.formatIcon { flex: none; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; }
.video { background: var(--c-accent-soft); color: var(--c-accent-text); }
.photo { background: var(--c-info-soft); color: var(--c-info); }
.rowMain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rowTitle { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rowMeta { display: flex; gap: var(--sp-3); font-size: var(--fs-xs); color: var(--c-text-3); }
.rowMeta span { display: inline-flex; align-items: center; gap: 3px; }
.overdue { color: var(--c-danger); font-weight: 600; }
.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.formHelp { font-size: var(--fs-s); color: var(--c-text-3); margin-top: calc(-1 * var(--sp-2)); }
.detail { display: flex; flex-direction: column; gap: var(--sp-4); }
.badges { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
.tag { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: var(--radius-pill); background: var(--c-surface-2); color: var(--c-text-2); font-size: var(--fs-xs); font-weight: 600; text-decoration: none; }
.text { font-size: var(--fs-l); line-height: 1.55; }
.metaRow { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.assignee { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-s); color: var(--c-text-2); }
.section { display: flex; flex-direction: column; gap: var(--sp-3); }
.section h3 { font-size: var(--fs-m); color: var(--c-text-2); }
.completeBox { padding: var(--sp-4); border-radius: var(--radius-m); background: var(--c-success-soft); }
.inline { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.inline input { width: auto; }
.activity { list-style: none; margin: 0; padding: var(--sp-3) var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-s); }
.pad { padding: var(--sp-4); display: grid; place-items: center; }
```

Modify `frontend/src/App.jsx`: borrar `const IdeasPage = () => <Placeholder title="Ideas" />;` y agregar `import { IdeasPage } from './pages/ideas/IdeasPage.jsx';`.

- [ ] **Step 5: Correr y ver que pasan**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Verificación manual**

Con backend + `npm run dev`, a 390 px: crear una idea de foto viernes con cliente nuevo, subir 2 fotos de referencia (una de iPhone si es posible), decidir "Sí, la hago", intentar "Ya la hice" sin link (error en el campo), completarla con un link de Instagram (se ve el embed), reabrir, escribir una nota larga con saltos de línea y verla completa al volver. Con un usuario "Solo lectura": no aparecen botones de acción ni el ＋.

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "feat(front): Ideas — grupos plegables, filtros combinables, detalle con flujo de decisión, notas y fotos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Calendario de redes

**Files:**
- Create: `frontend/src/lib/dayState.js`
- Create: `frontend/src/pages/calendar/api.js`, `CalendarPage.jsx`, `MonthGrid.jsx`, `WeekList.jsx`, `DaySheet.jsx`, `ItemForm.jsx`, `PreviewMockup.jsx`, `calendar.module.css`
- Modify: `frontend/src/App.jsx` (reemplazar placeholder `CalendarPage`)
- Test: `frontend/src/lib/dayState.test.js`, `frontend/src/pages/calendar/calendar.test.jsx`

**Interfaces:**
- Consumes: `useIdeas` (de `pages/ideas/api.js`), `monthGrid`, `monthOf`, `addMonths`, `formatMonth`, `formatLong`, `formatShort`, `weekdayOf`, `todayART`, `WEEK_HEADERS`, `WEEKDAY_SHORT`, `CHANNELS`, `CHANNEL_LABELS`, `CALENDAR_STATUS_LABELS`, `presetForChannels`, `ImageUploader`, `useDraft`, `usePersistentState`, `useIsDesktop`.
- Produces: `dayState(items) → 'empty'|'planned'|'ready'|'published'` (igual que el backend).
- Produces (`api.js`): `calKeys`, `useCalendarRange(from, to)`, `useRules()`, `useCreateItem()`, `useUpdateItem()`, `useDeleteItem()`.
- Produces: `CalendarPage` (rutas `/calendario`, `/calendario/:date`), `<PreviewMockup files channels copy>`.

- [ ] **Step 1: Tests que fallan**

`frontend/src/lib/dayState.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { dayState } from './dayState.js';

describe('dayState', () => {
  it.each([
    [[], 'empty'],
    [[{ status: 'draft' }], 'planned'],
    [[{ status: 'ready' }, { status: 'draft' }], 'planned'],
    [[{ status: 'ready' }, { status: 'published' }], 'ready'],
    [[{ status: 'published' }], 'published'],
  ])('%j → %s', (items, expected) => expect(dayState(items)).toBe(expected));
});
```

`frontend/src/pages/calendar/calendar.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { AuthProvider } from '../../state/auth.jsx';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { DaySheet } from './DaySheet.jsx';
import { PreviewMockup } from './PreviewMockup.jsx';

const me = { id: 'u1', name: 'Sofi', can_delete: true, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'edit', web: 'edit' } };
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function wrap(ui) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter><AuthProvider><ConfirmProvider>{ui}</ConfirmProvider></AuthProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DaySheet', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: me });
      if (url === '/api/ideas') return json({ ideas: [] });
      if (url === '/api/calendar' && opts.method === 'POST') return json({ item: { id: 'n1', date: '2026-10-09', title: JSON.parse(opts.body).title, channels: JSON.parse(opts.body).channels, status: 'draft', previews: [] } }, 201);
      return json({});
    });
  });

  it('muestra la grilla fija y, sin piezas, abre el alta con los canales de la grilla', async () => {
    const rules = [{ weekday: 5, theme: 'Cliente real', format: 'Reel', channels: ['ig_reel', 'tiktok'], time: null, active: true }];
    wrap(<DaySheet date="2026-10-09" items={[]} rules={rules} rangeKey={['calendar', 'a', 'b']} onClose={() => {}} />);
    expect(await screen.findByText(/Cliente real · Reel · Reel IG \+ TikTok/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reel IG' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Post IG' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.type(screen.getByLabelText('¿Qué se sube?'), 'Reel entrega POSTA');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar pieza' }));
    const post = fetch.mock.calls.find(([u, o]) => u === '/api/calendar' && o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toMatchObject({ date: '2026-10-09', title: 'Reel entrega POSTA', channels: ['ig_reel', 'tiktok'], status: 'draft' });
  });
});

describe('PreviewMockup', () => {
  it('historia/reel → marco vertical; post → marco de feed con copy', () => {
    const files = [{ id: 'f1', url: '/x.png' }];
    const { container, rerender } = render(<PreviewMockup files={files} channels={['ig_story']} copy="Hola" />);
    expect(container.firstChild.className).toMatch(/mockStory/);
    rerender(<PreviewMockup files={files} channels={['ig_post']} copy={'Uniformá tu negocio\n#gastronomía'} />);
    expect(container.firstChild.className).toMatch(/mockFeed/);
    expect(screen.getByText(/Uniformá tu negocio/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd frontend && npx vitest run src/lib/dayState.test.js src/pages/calendar`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

`frontend/src/lib/dayState.js`:
```js
// Igual que backend/src/routes/home.js
export function dayState(items) {
  if (!items.length) return 'empty';
  if (items.every((i) => i.status === 'published')) return 'published';
  if (items.every((i) => i.status !== 'draft')) return 'ready';
  return 'planned';
}
```

`frontend/src/pages/calendar/api.js`:
```js
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';

export const calKeys = { range: (from, to) => ['calendar', from, to] };

export const useCalendarRange = (from, to) => useQuery({
  queryKey: calKeys.range(from, to),
  queryFn: () => api.get(`/calendar?from=${from}&to=${to}`).then((r) => r.items),
  placeholderData: keepPreviousData,
});

export const useRules = () => useQuery({ queryKey: ['rules'], queryFn: () => api.get('/settings/content-rules').then((r) => r.rules), staleTime: 5 * 60_000 });

function useInvalidateCalendar() {
  const qc = useQueryClient();
  return () => Promise.all([['calendar'], ['home'], ['ideas']].map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateItem() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: (body) => api.post('/calendar', body).then((r) => r.item), meta: { success: 'Pieza agregada ✓' }, onSettled: invalidate });
}

export function useUpdateItem() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: ({ id, patch }) => api.patch(`/calendar/${id}`, patch).then((r) => r.item), meta: { success: 'Pieza guardada ✓' }, onSettled: invalidate });
}

export function useDeleteItem() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: (id) => api.del(`/calendar/${id}`), meta: { success: 'Pieza borrada' }, onSettled: invalidate });
}
```

`frontend/src/pages/calendar/PreviewMockup.jsx`:
```jsx
import { presetForChannels } from '../../lib/sizes.js';
import s from './calendar.module.css';

// Cómo se va a ver la pieza: marco de feed (4:5) o de historia/reel (9:16), con carrusel deslizable
export function PreviewMockup({ files, channels, copy }) {
  const vertical = presetForChannels(channels) !== 'ig_post';
  return (
    <div className={`${s.mock} ${vertical ? s.mockStory : s.mockFeed}`} aria-label="Previsualización de la pieza">
      <div className={s.mockHead}>
        <img src="/logo-ciruela.png" alt="" className={s.mockAvatar} />
        <strong>uniform.ar</strong>
      </div>
      <div className={s.mockMedia}>
        {files.map((f) => <img key={f.id} src={f.url} alt="" />)}
      </div>
      {files.length > 1 && <div className={s.mockDots} aria-hidden>{files.map((f) => <span key={f.id} />)}</div>}
      {!vertical && copy && <p className={`${s.mockCopy} prewrap`}><strong>uniform.ar</strong> {copy}</p>}
    </div>
  );
}
```

`frontend/src/pages/calendar/ItemForm.jsx`:
```jsx
import { useState } from 'react';
import { useDraft } from '../../hooks/useDraft.js';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Chip, ChipGroup } from '../../components/ui/Chip.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { CHANNELS, CHANNEL_LABELS, CALENDAR_STATUS_LABELS, IDEA_STATUS_LABELS, IDEA_STATUS_ORDER } from '../../lib/ideaStatus.js';
import { useIdeas } from '../ideas/api.js';
import { useCreateItem, useUpdateItem } from './api.js';
import s from './calendar.module.css';

const IG_COPY_MAX = 2200;
const toForm = (i) => ({ title: i.title, channels: i.channels, status: i.status, idea_id: i.idea_id ?? '', copy: i.copy ?? '', piece_url: i.piece_url ?? '', refs: i.refs ?? '' });

export function ItemForm({ date, item, defaultChannels = [], onDone, onCancel }) {
  const isNew = !item;
  const { data: ideas = [] } = useIdeas();
  const [form, setForm, clearDraft] = useDraft(isNew ? `cal-new-${date}` : `cal-${item.id}`,
    isNew ? { title: '', channels: defaultChannels, status: 'draft', idea_id: '', copy: '', piece_url: '', refs: '' } : toForm(item));
  const [errors, setErrors] = useState({});
  const create = useCreateItem();
  const update = useUpdateItem();
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const toggleChannel = (c) => setForm((f) => ({ ...f, channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c] }));
  const linkable = ideas.filter((i) => i.status !== 'no_se_hace');

  function onSubmit(e) {
    e.preventDefault();
    const nul = (v) => (v.trim() === '' ? null : v);
    const body = { title: form.title.trim(), channels: CHANNELS.filter((c) => form.channels.includes(c)), status: form.status, idea_id: form.idea_id || null, copy: nul(form.copy), piece_url: nul(form.piece_url.trim()), refs: nul(form.refs) };
    const opts = { onError: (err) => setErrors(err.fields ?? {}), onSuccess: (saved) => { clearDraft(); onDone?.(saved); } };
    if (isNew) create.mutate({ date, ...body }, opts);
    else update.mutate({ id: item.id, patch: body }, opts);
  }

  return (
    <form className={s.form} onSubmit={onSubmit} noValidate>
      <Field label="¿Qué se sube?" error={errors.title}>
        <Textarea minRows={2} value={form.title} onChange={set('title')} placeholder="Ej.: Reel de la entrega a POSTA" />
      </Field>
      <div>
        <p className={s.label}>Dónde se publica</p>
        <ChipGroup label="Canales">
          {CHANNELS.map((c) => <Chip key={c} selected={form.channels.includes(c)} onClick={() => toggleChannel(c)}>{CHANNEL_LABELS[c]}</Chip>)}
        </ChipGroup>
      </div>
      <div>
        <p className={s.label}>Estado</p>
        <Segmented label="Estado" value={form.status} onChange={set('status')} options={Object.entries(CALENDAR_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
      </div>
      <Field label="Idea vinculada">
        <Select value={form.idea_id} onChange={set('idea_id')}>
          <option value="">— Ninguna —</option>
          {IDEA_STATUS_ORDER.filter((st) => st !== 'no_se_hace').map((st) => {
            const group = linkable.filter((i) => i.status === st);
            return group.length ? (
              <optgroup key={st} label={IDEA_STATUS_LABELS[st]}>
                {group.map((i) => <option key={i.id} value={i.id}>{i.text.split('\n')[0].slice(0, 80)}</option>)}
              </optgroup>
            ) : null;
          })}
        </Select>
      </Field>
      <Field label="Copy del posteo" hint={`${form.copy.length} / ${IG_COPY_MAX} caracteres`} error={form.copy.length > IG_COPY_MAX ? 'Instagram admite hasta 2.200 caracteres' : errors.copy}>
        <Textarea minRows={3} value={form.copy} onChange={set('copy')} />
      </Field>
      <Field label="Link de la pieza terminada" hint="Lo carga Santi cuando está lista (Drive, etc.)." error={errors.piece_url}>
        <Input type="url" inputMode="url" value={form.piece_url} onChange={set('piece_url')} placeholder="https://" />
      </Field>
      <Field label="Referencias" hint="Un link por línea.">
        <Textarea minRows={2} value={form.refs} onChange={set('refs')} />
      </Field>
      <div className={s.formActions}>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" loading={create.isPending || update.isPending}>{isNew ? 'Guardar pieza' : 'Guardar cambios'}</Button>
      </div>
    </form>
  );
}
```

`frontend/src/pages/calendar/DaySheet.jsx`:
```jsx
import { useState } from 'react';
import { Plus, Trash2, ChevronDown, CalendarDays } from 'lucide-react';
import { useAuth, useCan } from '../../state/auth.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { ImageUploader } from '../../components/media/ImageUploader.jsx';
import { EmbedPreview } from '../../components/media/EmbedPreview.jsx';
import { CHANNEL_LABELS } from '../../lib/ideaStatus.js';
import { formatLong } from '../../lib/dates.js';
import { presetForChannels } from '../../lib/sizes.js';
import { ItemForm } from './ItemForm.jsx';
import { PreviewMockup } from './PreviewMockup.jsx';
import { useDeleteItem } from './api.js';
import s from './calendar.module.css';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function ItemCard({ item, open, onToggle, canEdit, canDelete }) {
  const del = useDeleteItem();
  const confirm = useConfirm();
  return (
    <article className={s.item}>
      <button type="button" className={s.itemHead} onClick={onToggle} aria-expanded={open}>
        <span className={s.itemTitles}>
          <strong>{item.title || 'Sin título'}</strong>
          <span className="muted">{item.channels.map((c) => CHANNEL_LABELS[c]).join(' · ') || 'Sin canales'}</span>
        </span>
        <StatusBadge kind="calendar" status={item.status} />
        <ChevronDown size={18} className={open ? s.rot : ''} aria-hidden />
      </button>
      {open && (
        <div className={s.itemBody}>
          {item.previews.length > 0 && <PreviewMockup files={item.previews} channels={item.channels} copy={item.copy} />}
          <ImageUploader ownerType="calendar_preview" ownerId={item.id} files={item.previews} invalidate={[['calendar']]}
            canEdit={canEdit} canDelete={canDelete} preset={presetForChannels(item.channels)} label="Subir previsualización" max={10} />
          {item.piece_url && !canEdit && <EmbedPreview url={item.piece_url} />}
          {canEdit ? <ItemForm item={item} /> : (
            <div className={s.readonly}>
              {item.idea && <p><strong>Idea:</strong> {item.idea.text}</p>}
              {item.copy && <p className="prewrap">{item.copy}</p>}
              {item.refs && <p className="prewrap muted">{item.refs}</p>}
            </div>
          )}
          {canEdit && canDelete && (
            <Button variant="danger" size="sm" icon={Trash2} loading={del.isPending}
              onClick={async () => (await confirm({ title: '¿Borrar esta pieza?', confirmLabel: 'Borrar', danger: true })) && del.mutate(item.id)}>
              Borrar pieza
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

export function DaySheet({ date, items, rules, onClose }) {
  const canEdit = useCan()('calendar', 'edit');
  const { user } = useAuth();
  const [adding, setAdding] = useState(items.length === 0 && canEdit);
  const [openId, setOpenId] = useState(items.length === 1 ? items[0].id : null);

  return (
    <Sheet open onClose={onClose} title={cap(formatLong(date))} size="lg">
      <div className={s.day}>
        {rules.length > 0 && (
          <div className={s.ruleBox}>
            {rules.map((r) => (
              <p key={`${r.weekday}-${r.theme}`}>
                <strong>Grilla fija:</strong> {[r.theme, r.format, r.channels.map((c) => CHANNEL_LABELS[c]).join(' + ')].filter(Boolean).join(' · ')}{r.time ? ` · ${r.time} h` : ''}
              </p>
            ))}
          </div>
        )}
        {items.map((item) => (
          <ItemCard key={item.id} item={item} open={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)}
            canEdit={canEdit} canDelete={Boolean(user?.can_delete)} />
        ))}
        {items.length === 0 && !adding && <EmptyState icon={CalendarDays} title="Nada cargado para este día" />}
        {canEdit && (adding ? (
          <div className={s.item}>
            <div className={s.itemBody}>
              <ItemForm date={date} defaultChannels={rules[0]?.channels ?? []} onDone={(saved) => { setAdding(false); setOpenId(saved.id); }} onCancel={items.length ? () => setAdding(false) : undefined} />
            </div>
          </div>
        ) : (
          <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>Agregar pieza</Button>
        ))}
      </div>
    </Sheet>
  );
}
```

`frontend/src/pages/calendar/MonthGrid.jsx`:
```jsx
import { WEEK_HEADERS, formatLong, monthOf, todayART } from '../../lib/dates.js';
import s from './calendar.module.css';

export function MonthGrid({ weeks, month, byDate, rulesFor, onOpen }) {
  const today = todayART();
  return (
    <div className={s.grid}>
      <div className={s.gridHead}>{WEEK_HEADERS.map((h) => <span key={h}>{h}</span>)}</div>
      {weeks.map((w) => (
        <div key={w[0]} className={s.gridRow}>
          {w.map((d) => {
            const items = byDate[d] ?? [];
            const rules = rulesFor(d);
            const cls = [s.cell, monthOf(d) !== month && s.out, d === today && s.today, rules.length && s.hasRule].filter(Boolean).join(' ');
            return (
              <button key={d} type="button" className={cls} onClick={() => onOpen(d)}
                aria-label={`${formatLong(d)}${rules.length ? `, ${rules[0].theme}` : ''}, ${items.length} piezas`}>
                <span className={s.dayNum}>{Number(d.slice(8))}</span>
                {rules.map((r) => <span key={r.theme} className={s.rule}>{r.theme}</span>)}
                {items.slice(0, 3).map((i) => <span key={i.id} className={`${s.pill} ${s[i.status]}`}>{i.title || 'Sin título'}</span>)}
                {items.length > 3 && <span className={s.moreItems}>+{items.length - 3} más</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

`frontend/src/pages/calendar/WeekList.jsx`:
```jsx
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { WEEKDAY_SHORT, formatShort, monthOf, todayART, weekdayOf } from '../../lib/dates.js';
import { dayState } from '../../lib/dayState.js';
import s from './calendar.module.css';

export function WeekList({ weeks, month, byDate, rulesFor, onOpen }) {
  const [showAll, setShowAll] = usePersistentState('cal-show-all', false);
  const today = todayART();
  return (
    <div className={s.weeks}>
      <label className={s.toggle}>
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Mostrar también los días sin publicación fija
      </label>
      {weeks.map((w) => {
        const days = w.filter((d) => monthOf(d) === month && (showAll || rulesFor(d).length || byDate[d]?.length));
        if (!days.length) return null;
        return (
          <section key={w[0]}>
            <h2 className={s.weekTitle}>Semana del {formatShort(w[0])} al {formatShort(w[6])}</h2>
            <div className={s.dayList}>
              {days.map((d) => {
                const items = byDate[d] ?? [];
                const rules = rulesFor(d);
                return (
                  <button key={d} type="button" className={`${s.dayRow} ${d === today ? s.todayRow : ''}`} onClick={() => onOpen(d)}>
                    <span className={s.dayBadge}><span>{WEEKDAY_SHORT[weekdayOf(d)]}</span><strong>{Number(d.slice(8))}</strong></span>
                    <span className={s.dayMain}>
                      <span className={s.dayTheme}>{rules.map((r) => r.theme).join(' · ') || 'Día libre'}</span>
                      <span className={s.dayItems}>{items.length ? items.map((i) => i.title || 'Sin título').join(' · ') : 'Sin cargar'}</span>
                    </span>
                    <StatusBadge kind="day" status={dayState(items)} />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

`frontend/src/pages/calendar/CalendarPage.jsx`:
```jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useCan } from '../../state/auth.jsx';
import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Fab } from '../../components/shell/Fab.jsx';
import { addMonths, formatMonth, monthGrid, monthOf, todayART, weekdayOf } from '../../lib/dates.js';
import { useCalendarRange, useRules } from './api.js';
import { MonthGrid } from './MonthGrid.jsx';
import { WeekList } from './WeekList.jsx';
import { DaySheet } from './DaySheet.jsx';
import p from '../pages.module.css';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function CalendarPage() {
  const { date } = useParams();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const canEdit = useCan()('calendar', 'edit');
  const [month, setMonth] = useState(() => monthOf(date ?? todayART()));
  useEffect(() => { if (date) setMonth(monthOf(date)); }, [date]);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const from = weeks[0][0];
  const to = weeks.at(-1)[6];
  const { data: items = [] } = useCalendarRange(from, to);
  const { data: rules = [] } = useRules();
  const byDate = useMemo(() => items.reduce((acc, i) => ({ ...acc, [i.date]: [...(acc[i.date] ?? []), i] }), {}), [items]);
  const rulesFor = (d) => rules.filter((r) => r.active && r.weekday === weekdayOf(d));
  const open = (d) => navigate(`/calendario/${d}`);

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle={cap(formatMonth(month))}
        actions={(
          <>
            <IconButton icon={ChevronLeft} label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))} />
            <Button variant="secondary" size="sm" onClick={() => setMonth(monthOf(todayART()))}>Hoy</Button>
            <IconButton icon={ChevronRight} label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))} />
          </>
        )}
      />
      <div className={p.page}>
        {desktop
          ? <MonthGrid weeks={weeks} month={month} byDate={byDate} rulesFor={rulesFor} onOpen={open} />
          : <WeekList weeks={weeks} month={month} byDate={byDate} rulesFor={rulesFor} onOpen={open} />}
      </div>
      {canEdit && <Fab icon={Plus} label="Agregar pieza" onClick={() => open(todayART())} />}
      {date && <DaySheet key={date} date={date} items={byDate[date] ?? []} rules={rulesFor(date)} onClose={() => navigate('/calendario')} />}
    </>
  );
}
```

`frontend/src/pages/calendar/calendar.module.css`:
```css
.grid { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); overflow: hidden; }
.gridHead, .gridRow { display: grid; grid-template-columns: repeat(7, 1fr); }
.gridHead span { padding: var(--sp-2) var(--sp-3); font-size: var(--fs-xs); font-weight: 700; color: var(--c-text-3); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--c-border); }
.cell { min-height: 116px; display: flex; flex-direction: column; gap: 4px; padding: var(--sp-2); border: 0; border-right: 1px solid var(--c-border); border-bottom: 1px solid var(--c-border); background: var(--c-surface); text-align: left; cursor: pointer; overflow: hidden; color: var(--c-text); }
.cell:nth-child(7n) { border-right: 0; }
.cell:hover { background: var(--c-surface-2); }
.out { background: var(--c-bg); color: var(--c-text-3); }
.hasRule { box-shadow: inset 3px 0 0 var(--c-accent); }
.dayNum { font-weight: 700; font-size: var(--fs-s); }
.today .dayNum { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--c-accent); color: var(--c-on-accent); }
.rule { font-size: 11px; font-weight: 600; color: var(--c-accent-text); }
.pill { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.draft { background: var(--c-warn-soft); color: var(--c-warn); }
.ready { background: var(--c-info-soft); color: var(--c-info); }
.published { background: var(--c-success-soft); color: var(--c-success); }
.moreItems { font-size: 11px; color: var(--c-text-3); }
.weeks { display: flex; flex-direction: column; gap: var(--sp-4); }
.toggle { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-s); color: var(--c-text-2); min-height: var(--tap); }
.toggle input { width: 20px; height: 20px; accent-color: var(--c-accent); }
.weekTitle { font-size: var(--fs-s); font-family: var(--font-ui); font-weight: 700; color: var(--c-text-3); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: var(--sp-2); }
.dayList { display: flex; flex-direction: column; background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); overflow: hidden; }
.dayRow { display: flex; align-items: center; gap: var(--sp-3); min-height: 64px; padding: var(--sp-2) var(--sp-4); border: 0; border-bottom: 1px solid var(--c-border); background: transparent; text-align: left; cursor: pointer; color: var(--c-text); }
.dayRow:last-child { border-bottom: 0; }
.todayRow { background: var(--c-accent-soft); }
.dayBadge { flex: none; width: 44px; display: flex; flex-direction: column; align-items: center; font-size: var(--fs-xs); color: var(--c-text-3); }
.dayBadge strong { font-size: var(--fs-l); color: var(--c-text); font-family: var(--font-display); }
.dayMain { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dayTheme { font-weight: 600; }
.dayItems { font-size: var(--fs-s); color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.day { display: flex; flex-direction: column; gap: var(--sp-3); }
.ruleBox { padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-m); background: var(--c-accent-soft); color: var(--c-accent-text); font-size: var(--fs-s); }
.item { border: 1px solid var(--c-border); border-radius: var(--radius-l); overflow: hidden; }
.itemHead { width: 100%; display: flex; align-items: center; gap: var(--sp-3); min-height: 60px; padding: var(--sp-3) var(--sp-4); border: 0; background: var(--c-surface); text-align: left; cursor: pointer; color: var(--c-text); }
.itemTitles { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: var(--fs-s); }
.itemTitles strong { font-size: var(--fs-m); }
.rot { transform: rotate(180deg); }
.itemBody { display: flex; flex-direction: column; gap: var(--sp-4); padding: var(--sp-4); border-top: 1px solid var(--c-border); }
.readonly { display: flex; flex-direction: column; gap: var(--sp-2); }
.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.formActions { display: flex; gap: var(--sp-2); justify-content: flex-end; }
.label { font-size: var(--fs-s); font-weight: 600; color: var(--c-text-2); margin-bottom: 6px; }
.mock { width: min(300px, 100%); align-self: center; border: 1px solid var(--c-border); border-radius: 14px; overflow: hidden; background: var(--c-surface); box-shadow: var(--shadow-1); }
.mockHead { display: flex; align-items: center; gap: var(--sp-2); padding: 8px 10px; font-size: var(--fs-s); }
.mockAvatar { width: 26px; height: 26px; border-radius: 50%; object-fit: contain; background: #fff; border: 1px solid var(--c-border); }
.mockMedia { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.mockMedia::-webkit-scrollbar { display: none; }
.mockMedia img { flex: 0 0 100%; scroll-snap-align: start; object-fit: cover; background: var(--c-surface-2); }
.mockFeed .mockMedia img { aspect-ratio: 4 / 5; }
.mockStory .mockMedia img { aspect-ratio: 9 / 16; }
.mockStory { position: relative; }
.mockStory .mockHead { position: absolute; z-index: 1; color: #fff; text-shadow: 0 1px 2px rgb(0 0 0 / 0.5); }
.mockDots { display: flex; justify-content: center; gap: 4px; padding: 6px; }
.mockDots span { width: 6px; height: 6px; border-radius: 50%; background: var(--c-border-strong); }
.mockCopy { padding: 4px 10px 10px; font-size: var(--fs-s); }
```

Modify `frontend/src/App.jsx`: borrar el placeholder `CalendarPage` y agregar `import { CalendarPage } from './pages/calendar/CalendarPage.jsx';`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Verificación manual**

A 390 px: ver la lista de semanas con martes/miércoles/viernes/domingo marcados; tocar un viernes → la hoja abre el alta con Reel IG + TikTok tildados; guardar; subir 2 previsualizaciones 1080×1920 y ver el mockup vertical deslizable; subir una cuadrada y ver el aviso de proporción. A 1440 px: grilla mensual con píldoras por estado.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(front): calendario de redes — grilla mensual y lista semanal, piezas con copy, estado y previsualización

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Proyectos y tareas

**Files:**
- Create: `frontend/src/pages/projects/api.js`, `ProjectsPage.jsx`, `ProjectDetail.jsx`, `ProjectForm.jsx`, `InlineText.jsx`, `TaskList.jsx`, `UpdatesFeed.jsx`, `projects.module.css`
- Modify: `frontend/src/App.jsx` (reemplazar placeholders `ProjectsPage` y `ProjectDetail`)
- Test: `frontend/src/pages/projects/projects.test.jsx`

**Interfaces:**
- Consumes: `useDirectory` (de `pages/ideas/api.js`), `useOptimisticMutation`, `ImageUploader`, `PdfList`, `Progress`, `AvatarStack`, `StatusBadge kind="project"`, `relativeTime`, `formatShort`.
- Produces (`api.js`): `projectKeys`, `useProjects()`, `useProject(id)`, `useProjectActivity(id, enabled)`, `useCreateProject()`, `useUpdateProject(id)`, `useDeleteProject()`, `useCreateTask(projectId)`, `useUpdateTask(projectId)` (optimista sobre el detalle), `useDeleteTask(projectId)`, `useCreateUpdate(projectId)`, `useDeleteUpdate(projectId)`.
- Produces: `ProjectsPage` (`/proyectos`), `ProjectDetail` (`/proyectos/:id`), `<InlineText label value onSave canEdit placeholder>`.

- [ ] **Step 1: Test que falla**

`frontend/src/pages/projects/projects.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { AuthProvider } from '../../state/auth.jsx';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { ProjectsPage } from './ProjectsPage.jsx';
import { ProjectDetail } from './ProjectDetail.jsx';

const me = { id: 'u1', name: 'Sofi', can_delete: false, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' } };
const projects = [
  { id: 'p1', name: 'Rediseño de la web', status: 'active', task_total: 4, task_done: 1, start_date: '2026-10-01', end_date: null },
  { id: 'p2', name: 'LinkedIn', status: 'proposal', task_total: 0, task_done: 0 },
];
const detail = {
  ...projects[0], goal_text: 'Web nueva:\n- rubros\n- catálogo', doing_text: '', how_text: '',
  tasks: [{ id: 't1', text: 'Brief al diseñador', done: false, due_date: '2026-10-20', assignee_ids: ['u1'] }],
  updates: [{ id: 'n1', body: 'Primera reunión ✅', author_id: 'u2', author_name: 'Bauti', created_at: '2026-10-06T12:00:00Z' }],
  photos: [], pdfs: [],
};
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function renderAt(path) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider><ConfirmProvider>
          <Routes>
            <Route path="/proyectos" element={<ProjectsPage />} />
            <Route path="/proyectos/:id" element={<ProjectDetail />} />
          </Routes>
        </ConfirmProvider></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('proyectos', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: me });
      if (url === '/api/projects') return json({ projects });
      if (url === '/api/projects/p1') return json({ project: detail });
      if (url === '/api/users/directory') return json({ users: [{ id: 'u1', name: 'Sofi', avatar_color: '#775D66' }, { id: 'u2', name: 'Bauti', avatar_color: '#366497' }] });
      if (url === '/api/tasks/t1' && opts.method === 'PATCH') return json({ task: { ...detail.tasks[0], ...JSON.parse(opts.body) } });
      return json({});
    });
  });

  it('pestañas separan activos y propuestas', async () => {
    renderAt('/proyectos');
    expect(await screen.findByText('Rediseño de la web')).toBeInTheDocument();
    expect(screen.queryByText('LinkedIn')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Propuestas/ }));
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
  });

  it('detalle: textos completos, tarea se tilda al instante y se guarda', async () => {
    renderAt('/proyectos/p1');
    expect(await screen.findByText((_, el) => el?.textContent === 'Web nueva:\n- rubros\n- catálogo')).toBeInTheDocument();
    const box = screen.getByRole('checkbox', { name: 'Brief al diseñador' });
    await userEvent.click(box);
    expect(box).toBeChecked();
    const patch = fetch.mock.calls.find(([u, o]) => u === '/api/tasks/t1' && o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toEqual({ done: true });
    expect(within(screen.getByRole('region', { name: 'Novedades' })).getByText('Primera reunión ✅')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd frontend && npx vitest run src/pages/projects`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar**

`frontend/src/pages/projects/api.js`:
```js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useOptimisticMutation } from '../../hooks/useOptimisticMutation.js';

export const projectKeys = { all: ['projects'], one: (id) => ['projects', id], activity: (id) => ['projects', id, 'activity'] };

export const useProjects = () => useQuery({ queryKey: projectKeys.all, queryFn: () => api.get('/projects').then((r) => r.projects) });
export const useProject = (id) => useQuery({ queryKey: projectKeys.one(id), queryFn: () => api.get(`/projects/${id}`).then((r) => r.project), enabled: Boolean(id) });
export const useProjectActivity = (id, enabled) => useQuery({ queryKey: projectKeys.activity(id), queryFn: () => api.get(`/projects/${id}/activity`).then((r) => r.activity), enabled });

function useRefresh(id) {
  const qc = useQueryClient();
  return () => Promise.all([projectKeys.all, ['home'], ...(id ? [projectKeys.one(id), projectKeys.activity(id)] : [])].map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateProject() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (body) => api.post('/projects', body).then((r) => r.project), meta: { success: 'Proyecto creado ✓' }, onSuccess: refresh });
}

export function useUpdateProject(id) {
  return useOptimisticMutation({
    mutationFn: (patch) => api.patch(`/projects/${id}`, patch).then((r) => r.project),
    queryKey: projectKeys.one(id),
    apply: (old, patch) => ({ ...old, ...patch }),
    invalidate: [projectKeys.all, ['home'], projectKeys.activity(id)],
  });
}

export function useDeleteProject() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id) => api.del(`/projects/${id}`), meta: { success: 'Proyecto borrado' }, onSuccess: refresh });
}

export function useCreateTask(projectId) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (body) => api.post(`/projects/${projectId}/tasks`, body).then((r) => r.task), meta: { success: 'Tarea agregada ✓' }, onSettled: refresh });
}

export function useUpdateTask(projectId) {
  return useOptimisticMutation({
    mutationFn: ({ id, patch }) => api.patch(`/tasks/${id}`, patch).then((r) => r.task),
    queryKey: projectKeys.one(projectId),
    apply: (old, { id, patch }) => ({ ...old, tasks: old.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
    invalidate: [projectKeys.all, ['home'], projectKeys.activity(projectId)],
    meta: { success: false },
  });
}

export function useDeleteTask(projectId) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (id) => api.del(`/tasks/${id}`), meta: { success: 'Tarea borrada' }, onSettled: refresh });
}

export function useCreateUpdate(projectId) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (body) => api.post(`/projects/${projectId}/updates`, { body }).then((r) => r.update), meta: { success: 'Novedad publicada ✓' }, onSettled: refresh });
}

export function useDeleteUpdate(projectId) {
  const refresh = useRefresh(projectId);
  return useMutation({ mutationFn: (id) => api.del(`/updates/${id}`), meta: { success: 'Novedad borrada' }, onSettled: refresh });
}
```

`frontend/src/pages/projects/InlineText.jsx`:
```jsx
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useDraft } from '../../hooks/useDraft.js';
import s from './projects.module.css';

// Texto largo que se ve completo y se edita en el lugar (con borrador local por si se corta la sesión)
export function InlineText({ draftKey, label, value, onSave, canEdit, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft, clear] = useDraft(draftKey, { text: value ?? '' });
  const start = () => { setDraft({ text: value ?? '' }); setEditing(true); };
  const save = () => onSave(draft.text, { onSuccess: () => { clear(); setEditing(false); } });

  return (
    <section className={s.block} aria-label={label}>
      <div className={s.blockHead}>
        <h2>{label}</h2>
        {canEdit && !editing && <Button variant="ghost" size="sm" icon={Pencil} onClick={start}>Editar</Button>}
      </div>
      {editing ? (
        <>
          <Textarea aria-label={label} value={draft.text} onChange={(e) => setDraft({ text: e.target.value })} minRows={4} autoFocus />
          <div className={s.blockActions}>
            <Button variant="secondary" size="sm" onClick={() => { clear(); setEditing(false); }}>Cancelar</Button>
            <Button size="sm" onClick={save}>Guardar</Button>
          </div>
        </>
      ) : value ? (
        <p className="prewrap">{value}</p>
      ) : (
        <p className="muted">{placeholder}</p>
      )}
    </section>
  );
}
```

`frontend/src/pages/projects/TaskList.jsx`:
```jsx
import { useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { AvatarStack } from '../../components/ui/Avatar.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { formatShort, todayART } from '../../lib/dates.js';
import { useDirectory } from '../ideas/api.js';
import { useCreateTask, useDeleteTask, useUpdateTask } from './api.js';
import s from './projects.module.css';

function AssignSheet({ task, users, onSave, onClose }) {
  const [ids, setIds] = useState(task.assignee_ids);
  const toggle = (id) => setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  return (
    <Sheet open onClose={onClose} title="¿Quién la hace?" footer={<Button onClick={() => { onSave(ids); onClose(); }}>Listo</Button>}>
      <div className={s.assignList}>
        {users.map((u) => (
          <label key={u.id} className={s.assignRow}>
            <input type="checkbox" checked={ids.includes(u.id)} onChange={() => toggle(u.id)} />
            <span className={s.dot} style={{ background: u.avatar_color }} aria-hidden /> {u.name}
          </label>
        ))}
      </div>
    </Sheet>
  );
}

export function TaskList({ project, canEdit }) {
  const { user } = useAuth();
  const { data: users = [] } = useDirectory();
  const create = useCreateTask(project.id);
  const update = useUpdateTask(project.id);
  const remove = useDeleteTask(project.id);
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [assigning, setAssigning] = useState(null);
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const today = todayART();

  function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    create.mutate({ text: text.trim(), assignee_ids: [] }, { onSuccess: () => setText('') });
  }

  return (
    <section className={s.block} aria-label="Tareas">
      <div className={s.blockHead}><h2>Tareas</h2><span className="muted">{project.tasks.filter((t) => t.done).length}/{project.tasks.length}</span></div>
      <ul className={s.tasks}>
        {project.tasks.map((t) => (
          <li key={t.id} className={`${s.task} ${t.done ? s.done : ''}`}>
            <input type="checkbox" className={s.check} checked={t.done} disabled={!canEdit} aria-label={t.text}
              onChange={() => update.mutate({ id: t.id, patch: { done: !t.done } })} />
            <span className={s.taskText}>{t.text}</span>
            {t.due_date && <span className={`${s.due} ${!t.done && t.due_date < today ? s.overdue : ''}`}>{formatShort(t.due_date)}</span>}
            <button type="button" className={s.assignBtn} disabled={!canEdit} onClick={() => setAssigning(t)} aria-label="Asignar">
              {t.assignee_ids.length ? <AvatarStack users={t.assignee_ids.map((id) => byId[id]).filter(Boolean)} /> : <UserPlus size={18} />}
            </button>
            {canEdit && user.can_delete && (
              <IconButton icon={Trash2} label="Borrar tarea" size="sm"
                onClick={async () => (await confirm({ title: '¿Borrar esta tarea?', confirmLabel: 'Borrar', danger: true })) && remove.mutate(t.id)} />
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className={s.addTask} onSubmit={add}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nueva tarea" aria-label="Nueva tarea" />
          <Button type="submit" icon={Plus} loading={create.isPending} aria-label="Agregar tarea" />
        </form>
      )}
      {assigning && (
        <AssignSheet task={assigning} users={users} onClose={() => setAssigning(null)}
          onSave={(ids) => update.mutate({ id: assigning.id, patch: { assignee_ids: ids } }, { onSuccess: () => {} })} />
      )}
    </section>
  );
}
```

`frontend/src/pages/projects/UpdatesFeed.jsx`:
```jsx
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Textarea } from '../../components/ui/Field.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { useDraft } from '../../hooks/useDraft.js';
import { relativeTime } from '../../lib/dates.js';
import { useCreateUpdate, useDeleteUpdate } from './api.js';
import s from './projects.module.css';

export function UpdatesFeed({ project, canEdit }) {
  const { user } = useAuth();
  const [draft, setDraft, clear] = useDraft(`update-${project.id}`, { body: '' });
  const create = useCreateUpdate(project.id);
  const remove = useDeleteUpdate(project.id);
  const confirm = useConfirm();
  const [error, setError] = useState(null);

  function publish() {
    if (!draft.body.trim()) return setError('Escribí la novedad');
    setError(null);
    create.mutate(draft.body, { onSuccess: clear });
  }

  return (
    <section className={s.block} aria-label="Novedades">
      <div className={s.blockHead}><h2>Novedades</h2></div>
      {canEdit && (
        <div className={s.composer}>
          <Textarea aria-label="Nueva novedad" minRows={2} value={draft.body} onChange={(e) => setDraft({ body: e.target.value })} placeholder="¿Cómo viene el proyecto?" />
          {error && <p className={s.err}>{error}</p>}
          <Button size="sm" onClick={publish} loading={create.isPending}>Publicar</Button>
        </div>
      )}
      <ul className={s.feed}>
        {project.updates.map((u) => (
          <li key={u.id} className={s.update}>
            <Avatar user={{ name: u.author_name, avatar_color: u.author_color }} size={30} />
            <div className={s.updateMain}>
              <p className={s.updateHead}><strong>{u.author_name ?? 'Alguien'}</strong> <span className="muted">· {relativeTime(u.created_at)}</span></p>
              <p className="prewrap">{u.body}</p>
            </div>
            {canEdit && (u.author_id === user.id || user.can_delete) && (
              <IconButton icon={Trash2} label="Borrar novedad" size="sm"
                onClick={async () => (await confirm({ title: '¿Borrar esta novedad?', confirmLabel: 'Borrar', danger: true })) && remove.mutate(u.id)} />
            )}
          </li>
        ))}
        {project.updates.length === 0 && <li className="muted">Todavía no hay novedades.</li>}
      </ul>
    </section>
  );
}
```

`frontend/src/pages/projects/ProjectForm.jsx`:
```jsx
import { useState } from 'react';
import { Field, Input, Select } from '../../components/ui/Field.jsx';

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' }, { value: 'proposal', label: 'Propuesta' },
  { value: 'upcoming', label: 'Próximo' }, { value: 'done', label: 'Terminado' },
];

// Datos básicos del proyecto (alta y edición). Los textos largos se editan en el detalle.
export function ProjectForm({ formId, initial, onSubmit }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '', status: initial?.status ?? 'active',
    start_date: initial?.start_date ?? '', end_date: initial?.end_date ?? '',
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setErrors({ name: 'Poné un nombre' });
    if (form.start_date && form.end_date && form.end_date < form.start_date) return setErrors({ end_date: 'No puede ser anterior al inicio' });
    setErrors({});
    onSubmit({ name: form.name.trim(), status: form.status, start_date: form.start_date || null, end_date: form.end_date || null }, (err) => setErrors(err.fields ?? {}));
  }

  return (
    <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <Field label="Nombre" required error={errors.name}><Input value={form.name} onChange={set('name')} placeholder="Ej.: Rediseño de la web" /></Field>
      <Field label="Estado"><Select value={form.status} onChange={set('status')}>{STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
      <Field label="Inicio" error={errors.start_date}><Input type="date" value={form.start_date} onChange={set('start_date')} /></Field>
      <Field label="Cierre estimado" error={errors.end_date}><Input type="date" value={form.end_date} onChange={set('end_date')} /></Field>
    </form>
  );
}
```

`frontend/src/pages/projects/ProjectsPage.jsx`:
```jsx
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FolderKanban } from 'lucide-react';
import { useCan } from '../../state/auth.jsx';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Fab } from '../../components/shell/Fab.jsx';
import { formatShort } from '../../lib/dates.js';
import { useCreateProject, useProjects } from './api.js';
import { ProjectForm } from './ProjectForm.jsx';
import s from './projects.module.css';
import p from '../pages.module.css';

const TABS = [['active', 'Activos'], ['proposal', 'Propuestas'], ['upcoming', 'Próximos'], ['done', 'Terminados']];

export function ProjectsPage() {
  const navigate = useNavigate();
  const canEdit = useCan()('projects', 'edit');
  const { data: projects = [] } = useProjects();
  const [tab, setTab] = usePersistentState('projects-tab', 'active');
  const [creating, setCreating] = useState(false);
  const create = useCreateProject();
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, projects.filter((x) => x.status === k).length])), [projects]);
  const list = projects.filter((x) => x.status === tab);

  return (
    <>
      <PageHeader title="Proyectos" subtitle={`${counts.active} activos`} actions={canEdit && <Button className="desktop-only" icon={Plus} onClick={() => setCreating(true)}>Nuevo proyecto</Button>} />
      <div className={p.page}>
        <div className={s.tabs}>
          <Segmented label="Estado de los proyectos" value={tab} onChange={setTab} options={TABS.map(([value, label]) => ({ value, label: `${label} ${counts[value]}` }))} />
        </div>
        {list.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No hay proyectos acá" />
        ) : (
          <div className={s.cards}>
            {list.map((x) => (
              <Link key={x.id} to={`/proyectos/${x.id}`} className={s.card}>
                <h2 className={s.cardTitle}>{x.name}</h2>
                {(x.start_date || x.end_date) && <p className="muted">{x.start_date ? formatShort(x.start_date) : '…'} → {x.end_date ? formatShort(x.end_date) : 'sin fecha'}</p>}
                <Progress value={x.task_done} max={x.task_total} label={`Avance de ${x.name}`} />
                <p className={s.cardMeta}>{x.task_total ? `${x.task_done} de ${x.task_total} tareas` : 'Sin tareas todavía'}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
      {canEdit && <Fab icon={Plus} label="Nuevo proyecto" onClick={() => setCreating(true)} />}
      <Sheet open={creating} onClose={() => setCreating(false)} title="Nuevo proyecto"
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" form="project-new" loading={create.isPending}>Crear</Button></>}>
        <ProjectForm formId="project-new" onSubmit={(body, onError) => create.mutate(body, { onError, onSuccess: (proj) => navigate(`/proyectos/${proj.id}`) })} />
      </Sheet>
    </>
  );
}
```

`frontend/src/pages/projects/ProjectDetail.jsx`:
```jsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { useAuth, useCan } from '../../state/auth.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { ImageUploader } from '../../components/media/ImageUploader.jsx';
import { PdfList } from '../../components/media/PdfList.jsx';
import { formatShort, relativeTime } from '../../lib/dates.js';
import { projectKeys, useDeleteProject, useProject, useProjectActivity, useUpdateProject } from './api.js';
import { InlineText } from './InlineText.jsx';
import { TaskList } from './TaskList.jsx';
import { UpdatesFeed } from './UpdatesFeed.jsx';
import { ProjectForm } from './ProjectForm.jsx';
import s from './projects.module.css';
import p from '../pages.module.css';

const ACTION = { create: 'creó el proyecto', update: 'editó el proyecto', task_create: 'agregó una tarea', task_update: 'actualizó una tarea', task_delete: 'borró una tarea' };

function Activity({ id }) {
  const { data = [], isPending } = useProjectActivity(id, true);
  if (isPending) return <div style={{ padding: 16 }}><Spinner /></div>;
  return (
    <ul className={s.activity}>
      {data.map((a) => <li key={a.id}><strong>{a.actor_name ?? 'Alguien'}</strong> {ACTION[a.action] ?? a.action}{a.diff?.task?.from ? `: "${a.diff.task.from}"` : a.diff?.task?.to ? `: "${a.diff.task.to}"` : ''} <span className="muted">· {relativeTime(a.created_at)}</span></li>)}
    </ul>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = useCan()('projects', 'edit');
  const { data: project, isPending, isError } = useProject(id);
  const update = useUpdateProject(id);
  const del = useDeleteProject();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);

  if (isPending) return <div className={p.center}><Spinner size={28} /></div>;
  if (isError) return <div className={p.center}><h2>No encontramos este proyecto</h2></div>;

  const saveText = (field) => (text, opts) => update.mutate({ [field]: text }, opts);
  const done = project.tasks.filter((t) => t.done).length;

  return (
    <>
      <PageHeader back="/proyectos" title={project.name}
        subtitle={[project.start_date && `Desde ${formatShort(project.start_date)}`, project.end_date && `cierre ${formatShort(project.end_date)}`].filter(Boolean).join(' · ') || undefined}
        actions={canEdit && <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)}>Datos</Button>} />
      <div className={p.page}>
        <div className={s.summary}>
          <StatusBadge kind="project" status={project.status} />
          <div className={s.summaryProgress}><Progress value={done} max={project.tasks.length} label="Avance" /></div>
          <span className="muted">{done}/{project.tasks.length} tareas</span>
        </div>
        <div className={s.columns}>
          <div className={s.col}>
            <InlineText draftKey={`p-${id}-goal`} label="Qué queremos hacer" value={project.goal_text} onSave={saveText('goal_text')} canEdit={canEdit} placeholder="Contá el objetivo del proyecto." />
            <InlineText draftKey={`p-${id}-doing`} label="Qué se está haciendo" value={project.doing_text} onSave={saveText('doing_text')} canEdit={canEdit} placeholder="¿En qué está ahora?" />
            <InlineText draftKey={`p-${id}-how`} label="Cómo se va a hacer" value={project.how_text} onSave={saveText('how_text')} canEdit={canEdit} placeholder="Pasos, responsables, herramientas." />
            <section className={s.block} aria-label="Fotos">
              <div className={s.blockHead}><h2>Fotos</h2></div>
              <ImageUploader ownerType="project_photo" ownerId={id} files={project.photos} invalidate={[projectKeys.one(id)]} canEdit={canEdit} canDelete={user.can_delete} max={50} />
            </section>
            <section className={s.block} aria-label="PDFs">
              <div className={s.blockHead}><h2>PDFs</h2></div>
              <PdfList ownerType="project_pdf" ownerId={id} files={project.pdfs} invalidate={[projectKeys.one(id)]} canEdit={canEdit} canDelete={user.can_delete} />
            </section>
          </div>
          <div className={s.col}>
            <TaskList project={project} canEdit={canEdit} />
            <UpdatesFeed project={project} canEdit={canEdit} />
            <Collapsible title="Historial de cambios"><Activity id={id} /></Collapsible>
            {canEdit && user.can_delete && (
              <Button variant="danger" size="sm" icon={Trash2} loading={del.isPending}
                onClick={async () => (await confirm({ title: `¿Borrar "${project.name}"?`, message: 'Se borran sus tareas, novedades, fotos y PDFs. No se puede deshacer.', confirmLabel: 'Borrar proyecto', danger: true }))
                  && del.mutate(id, { onSuccess: () => navigate('/proyectos') })}>
                Borrar proyecto
              </Button>
            )}
          </div>
        </div>
      </div>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Datos del proyecto"
        footer={<><Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button><Button type="submit" form="project-edit">Guardar</Button></>}>
        <ProjectForm formId="project-edit" initial={project} onSubmit={(body, onError) => update.mutate(body, { onError, onSuccess: () => setEditing(false) })} />
      </Sheet>
    </>
  );
}
```

`frontend/src/pages/projects/projects.module.css`:
```css
.tabs { margin-bottom: var(--sp-4); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--sp-3); }
.card { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-4); background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); color: var(--c-text); text-decoration: none; transition: box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease); }
.card:hover { box-shadow: var(--shadow-1); transform: translateY(-1px); }
.cardTitle { font-size: var(--fs-l); }
.cardMeta { font-size: var(--fs-s); color: var(--c-text-2); }
.summary { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-4); }
.summaryProgress { flex: 1; max-width: 320px; }
.columns { display: grid; gap: var(--sp-4); }
@media (min-width: 1100px) { .columns { grid-template-columns: 1.1fr 1fr; align-items: start; } }
.col { display: flex; flex-direction: column; gap: var(--sp-4); }
.block { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4); background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); }
.blockHead { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.blockHead h2 { font-size: var(--fs-l); }
.blockActions { display: flex; gap: var(--sp-2); justify-content: flex-end; }
.tasks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.task { display: flex; align-items: center; gap: var(--sp-3); min-height: 52px; border-bottom: 1px solid var(--c-border); }
.task:last-child { border-bottom: 0; }
.check { width: 22px; height: 22px; flex: none; accent-color: var(--c-accent); }
.taskText { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.done .taskText { text-decoration: line-through; color: var(--c-text-3); }
.due { font-size: var(--fs-xs); font-weight: 600; color: var(--c-text-2); background: var(--c-surface-2); padding: 2px 8px; border-radius: var(--radius-pill); }
.overdue { background: var(--c-danger-soft); color: var(--c-danger); }
.assignBtn { min-width: 40px; height: 40px; display: grid; place-items: center; border: 0; background: transparent; color: var(--c-text-3); border-radius: var(--radius-m); cursor: pointer; }
.assignBtn:hover:not(:disabled) { background: var(--c-surface-2); }
.addTask { display: flex; gap: var(--sp-2); }
.assignList { display: flex; flex-direction: column; }
.assignRow { display: flex; align-items: center; gap: var(--sp-3); min-height: 52px; font-weight: 500; border-bottom: 1px solid var(--c-border); }
.assignRow input { width: 22px; height: 22px; accent-color: var(--c-accent); }
.dot { width: 12px; height: 12px; border-radius: 50%; }
.composer { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-end; }
.err { align-self: flex-start; color: var(--c-danger); font-size: var(--fs-s); }
.feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-4); }
.update { display: flex; gap: var(--sp-3); align-items: flex-start; }
.updateMain { flex: 1; min-width: 0; }
.updateHead { font-size: var(--fs-s); margin-bottom: 2px; }
.activity { list-style: none; margin: 0; padding: var(--sp-3) var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-s); }
```


Modify `frontend/src/App.jsx`: borrar los placeholders `ProjectsPage` y `ProjectDetail` y agregar
`import { ProjectsPage } from './pages/projects/ProjectsPage.jsx';` y `import { ProjectDetail } from './pages/projects/ProjectDetail.jsx';`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Verificación manual**

Crear "Meta Ads" activo, cargar "Qué queremos hacer" con varias líneas, agregar 3 tareas, asignar una a 2 personas, tildarla (se tacha y baja), publicar una novedad, subir un PDF y abrirlo (en escritorio se ve embebido; en iPhone aparece "Abrir en otra pestaña"), subir una foto.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(front): proyectos con textos largos editables, tareas multi-asignadas, novedades, fotos y PDFs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Inicio

**Files:**
- Create: `frontend/src/pages/home/api.js`, `HomePage.jsx`, `home.module.css`
- Modify: `frontend/src/App.jsx` (reemplazar placeholder `HomePage`)
- Test: `frontend/src/pages/home/HomePage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/home?week=` (forma en Task 11), `StatusBadge kind="day"`, `Progress`, `Avatar`, `Collapsible`, `useCan`, `useAuth`, `weekRange`, `addDays`, `formatShort`, `WEEKDAY_SHORT`, `weekdayOf`, `todayART`.
- Produces: `useHome(week)`; `HomePage`.

- [ ] **Step 1: Test que falla**

`frontend/src/pages/home/HomePage.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { AuthProvider } from '../../state/auth.jsx';
import { HomePage } from './HomePage.jsx';

const me = { id: 'santi', name: 'Santi Pérez', can_delete: false, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'none' } };
const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map((date, i) => ({
  date, weekday: (i + 1) % 7, rules: i === 4 ? [{ theme: 'Cliente real' }] : [], items: i === 4 ? [{ id: 'c1', title: 'Reel POSTA', status: 'ready' }] : [], state: i === 4 ? 'ready' : 'empty',
}));
const home = {
  week: { start: '2026-10-05', end: '2026-10-11', days },
  counters: { new_ideas_week: 3, to_decide: 2, done_week: 1, active_projects: 2 },
  mine: { to_decide: [{ id: 'i1', text: 'Reel humor delantal', status: 'por_decidir', format: 'video' }], to_do: [], tasks: [] },
  to_decide: [{ id: 'i1', text: 'Reel humor delantal', status: 'por_decidir', format: 'video' }, { id: 'i2', text: 'Otra', status: 'por_decidir', format: 'photo' }],
  recently_done: [],
  pending_by_user: [{ user: { id: 'bauti', name: 'Bauti', avatar_color: '#366497' }, ideas: [], tasks: [{ id: 't1', text: 'Duplicar conjunto', project_id: 'p1', project_name: 'Meta Ads' }] }],
  projects: { active: [{ id: 'p1', name: 'Meta Ads', task_total: 4, task_done: 1 }], proposals: [{ id: 'p2', name: 'LinkedIn' }], upcoming: [] },
};
const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('Inicio', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => (url === '/api/auth/me' ? json({ user: me }) : json(home)));
  });

  it('saluda, prioriza "Te toca decidir" y muestra semana, pendientes y proyectos', async () => {
    render(<QueryClientProvider client={createQueryClient()}><MemoryRouter><AuthProvider><HomePage /></AuthProvider></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: /Santi/ })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toMatch(/Te toca decidir/);
    expect(screen.getAllByText('Reel humor delantal').length).toBeGreaterThan(0);
    expect(screen.getByText('Reel POSTA')).toBeInTheDocument();
    expect(screen.getByText('Duplicar conjunto')).toBeInTheDocument();
    expect(screen.getByText('Meta Ads', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Agente de pauta')).toBeInTheDocument();
    expect(screen.queryByText('Admin web')).not.toBeInTheDocument(); // sin permiso de web
    expect(screen.getByRole('button', { name: /¿Cómo se usa\?/ })).toHaveAttribute('aria-expanded', 'false');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd frontend && npx vitest run src/pages/home`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`frontend/src/pages/home/api.js`:
```js
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';

export const useHome = (week) => useQuery({
  queryKey: ['home', week ?? 'now'],
  queryFn: () => api.get(`/home${week ? `?week=${week}` : ''}`),
  placeholderData: keepPreviousData,
  refetchInterval: 60_000,
});
```

`frontend/src/pages/home/HomePage.jsx`:
```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clapperboard, Camera, Megaphone, Globe, ExternalLink } from 'lucide-react';
import { useAuth, useCan } from '../../state/auth.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { IconButton } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { WEEKDAY_SHORT, addDays, formatLong, formatShort, todayART, weekdayOf } from '../../lib/dates.js';
import { useHome } from './api.js';
import s from './home.module.css';
import p from '../pages.module.css';

function greeting(now = new Date()) {
  const h = (now.getUTCHours() + 21) % 24; // hora argentina
  return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

const FormatIcon = ({ format }) => (format === 'photo' ? <Camera size={16} aria-hidden /> : <Clapperboard size={16} aria-hidden />);

function IdeaLinks({ ideas }) {
  return (
    <ul className={s.list}>
      {ideas.map((i) => (
        <li key={i.id}>
          <Link to={`/ideas/${i.id}`} className={s.link}>
            <FormatIcon format={i.format} />
            <span className={s.linkText}>{i.text.split('\n')[0]}</span>
            <StatusBadge kind="idea" status={i.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TaskLinks({ tasks }) {
  return (
    <ul className={s.list}>
      {tasks.map((t) => (
        <li key={t.id}>
          <Link to={`/proyectos/${t.project_id}`} className={s.link}>
            <span className={s.linkText}>{t.text}</span>
            <span className="muted">{t.project_name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Block({ title, children, action }) {
  return (
    <section className={s.block}>
      <div className={s.blockHead}><h2>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const can = useCan();
  const [week, setWeek] = useState(null);
  const { data, isPending } = useHome(week);
  if (isPending) return <div className={p.center}><Spinner size={28} label="Cargando" /></div>;

  const { counters, mine } = data;
  const today = todayART();
  const mineCount = mine.to_decide.length + mine.to_do.length + mine.tasks.length;
  const firstName = user.name.split(' ')[0];

  const mineBlocks = (
    <>
      {mine.to_decide.length > 0 && <Block title={`Te toca decidir (${mine.to_decide.length})`}><IdeaLinks ideas={mine.to_decide} /></Block>}
      {mine.to_do.length > 0 && <Block title={`Te toca hacer (${mine.to_do.length})`}><IdeaLinks ideas={mine.to_do} /></Block>}
      {mine.tasks.length > 0 && <Block title={`Tus tareas (${mine.tasks.length})`}><TaskLinks tasks={mine.tasks} /></Block>}
    </>
  );

  const weekBlock = data.week.days && (
    <Block title="Esta semana" action={(
      <div className={s.weekNav}>
        <IconButton icon={ChevronLeft} size="sm" label="Semana anterior" onClick={() => setWeek(addDays(data.week.start, -7))} />
        <span className="muted">{formatShort(data.week.start)} – {formatShort(data.week.end)}</span>
        <IconButton icon={ChevronRight} size="sm" label="Semana siguiente" onClick={() => setWeek(addDays(data.week.start, 7))} />
      </div>
    )}>
      <div className={s.week}>
        {data.week.days.map((d) => (
          <Link key={d.date} to={`/calendario/${d.date}`} className={`${s.day} ${d.date === today ? s.today : ''} ${d.rules.length ? s.ruled : ''}`} aria-label={formatLong(d.date)}>
            <span className={s.dayName}>{WEEKDAY_SHORT[weekdayOf(d.date)]} <strong>{Number(d.date.slice(8))}</strong></span>
            <span className={s.dayTheme}>{d.rules.map((r) => r.theme).join(' · ') || 'Libre'}</span>
            {d.items.map((i) => <span key={i.id} className={s.dayItem}>{i.title || 'Sin título'}</span>)}
            {(d.rules.length > 0 || d.items.length > 0) && <StatusBadge kind="day" status={d.state} />}
          </Link>
        ))}
      </div>
    </Block>
  );

  return (
    <div className={p.page}>
      <header className={s.hello}>
        <h1>{greeting()}, {firstName}</h1>
        <p className="muted">{formatLong(today)}</p>
      </header>

      <div className={s.counters}>
        {[['Ideas nuevas', counters.new_ideas_week], ['Por decidir', counters.to_decide], ['Realizadas', counters.done_week], ['Proyectos activos', counters.active_projects]]
          .filter(([, v]) => v != null)
          .map(([label, v]) => <div key={label} className={s.counter}><strong>{v}</strong><span>{label}</span></div>)}
      </div>

      {mineCount > 0 ? <>{mineBlocks}{weekBlock}</> : <>{weekBlock}</>}

      {data.to_decide && data.to_decide.length > 0 && (
        <Block title="Ideas esperando respuesta" action={<Link to="/ideas" className={s.more}>Ver todas</Link>}>
          <IdeaLinks ideas={data.to_decide.slice(0, 6)} />
        </Block>
      )}

      {data.pending_by_user.some((c) => c.ideas.length || c.tasks.length) && (
        <Block title="Pendientes de cada uno">
          <div className={s.columns}>
            {data.pending_by_user.map(({ user: u, ideas, tasks }) => (
              <div key={u.id} className={s.column}>
                <p className={s.colHead}><Avatar user={u} size={24} /> {u.name} <span className="muted">{ideas.length + tasks.length}</span></p>
                {ideas.length + tasks.length === 0 ? <p className="muted">Nada pendiente 🎉</p> : <><IdeaLinks ideas={ideas} /><TaskLinks tasks={tasks} /></>}
              </div>
            ))}
          </div>
        </Block>
      )}

      {data.recently_done && data.recently_done.length > 0 && (
        <Block title="Contenido realizado">
          <div className={s.done}>
            {data.recently_done.map((d) => (
              <a key={d.id} href={d.result_url} target="_blank" rel="noreferrer" className={s.doneCard}>
                {d.thumb_url ? <img src={d.thumb_url} alt="" /> : <span className={s.doneIcon}><FormatIcon format={d.format} /></span>}
                <span className={s.doneText}>{d.text.split('\n')[0]}</span>
                <ExternalLink size={14} aria-hidden className="muted" />
              </a>
            ))}
          </div>
        </Block>
      )}

      {data.projects && (
        <Block title="Proyectos activos" action={<Link to="/proyectos" className={s.more}>Ver todos</Link>}>
          <ul className={s.list}>
            {data.projects.active.map((x) => (
              <li key={x.id}>
                <Link to={`/proyectos/${x.id}`} className={s.projectRow}>
                  <strong>{x.name}</strong>
                  <Progress value={x.task_done} max={x.task_total} label={`Avance de ${x.name}`} />
                  <span className="muted">{x.task_done}/{x.task_total}</span>
                </Link>
              </li>
            ))}
          </ul>
          {data.projects.proposals.length > 0 && <p className={s.proposals}>Propuestas: {data.projects.proposals.map((x) => <Link key={x.id} to={`/proyectos/${x.id}`}>{x.name}</Link>).reduce((a, b) => [a, ', ', b])}</p>}
        </Block>
      )}

      <div className={s.soon}>
        {can('ads') && <Link to="/pauta" className={s.soonCard}><Megaphone size={20} aria-hidden /><span><strong>Agente de pauta</strong><br /><span className="muted">Gasto vs. tope, campañas y consultas · Próximamente</span></span></Link>}
        {can('web') && <Link to="/web" className={s.soonCard}><Globe size={20} aria-hidden /><span><strong>Admin web</strong><br /><span className="muted">Banners y productos · Próximamente</span></span></Link>}
      </div>

      <Collapsible title="¿Cómo se usa?">
        <div className={s.howto}>
          <p><strong>Ideas:</strong> Sofi carga ideas; Santi toca “Sí, la hago” o “No la hago”. Cuando la grabás, “Ya la hice” y pegás el link (Drive, IG, TikTok). Los “sí o sí” van directo a hacer.</p>
          <p><strong>Calendario:</strong> cada día muestra la grilla fija. Tocá un día para cargar qué se sube, el copy y las previsualizaciones (1080×1350 para feed, 1080×1920 para historias y reels).</p>
          <p><strong>Proyectos:</strong> tareas con responsables y fechas, novedades, fotos y PDFs. Solo las tareas de proyectos activos aparecen acá.</p>
          <p><strong>Videos:</strong> no se suben al sistema; se comparten con link de Drive.</p>
        </div>
      </Collapsible>
    </div>
  );
}
```

`frontend/src/pages/home/home.module.css`:
```css
.hello { padding: calc(var(--sp-5) + env(safe-area-inset-top)) 0 var(--sp-4); }
.hello h1 { font-size: var(--fs-2xl); }
.hello p::first-letter { text-transform: uppercase; }
.counters { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-2); margin-bottom: var(--sp-4); }
@media (min-width: 700px) { .counters { grid-template-columns: repeat(4, 1fr); } }
.counter { display: flex; flex-direction: column; padding: var(--sp-3) var(--sp-4); background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); }
.counter strong { font-family: var(--font-display); font-size: var(--fs-2xl); line-height: 1.1; }
.counter span { font-size: var(--fs-s); color: var(--c-text-2); }
.block { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4); margin-bottom: var(--sp-3); background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); }
.blockHead { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.blockHead h2 { font-size: var(--fs-l); }
.more { font-size: var(--fs-s); font-weight: 600; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.link { display: flex; align-items: center; gap: var(--sp-3); min-height: 48px; color: var(--c-text); text-decoration: none; border-bottom: 1px solid var(--c-border); }
.list li:last-child .link { border-bottom: 0; }
.linkText { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.weekNav { display: flex; align-items: center; gap: 4px; font-size: var(--fs-s); }
.week { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(132px, 1fr); gap: var(--sp-2); overflow-x: auto; scroll-snap-type: x proximity; padding-bottom: 4px; }
.day { scroll-snap-align: start; display: flex; flex-direction: column; gap: 4px; min-height: 120px; padding: var(--sp-3); border: 1px solid var(--c-border); border-radius: var(--radius-m); background: var(--c-bg); color: var(--c-text); text-decoration: none; }
.ruled { background: var(--c-surface); box-shadow: inset 0 3px 0 var(--c-accent); }
.today { border-color: var(--c-accent); }
.dayName { font-size: var(--fs-s); color: var(--c-text-2); }
.dayName strong { color: var(--c-text); }
.dayTheme { font-weight: 600; font-size: var(--fs-s); }
.dayItem { font-size: var(--fs-xs); color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.columns { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(240px, 1fr); gap: var(--sp-3); overflow-x: auto; }
.column { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); border-radius: var(--radius-m); background: var(--c-bg); }
.colHead { display: flex; align-items: center; gap: var(--sp-2); font-weight: 600; }
.done { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--sp-2); }
.doneCard { display: flex; flex-direction: column; gap: 6px; padding: var(--sp-2); border: 1px solid var(--c-border); border-radius: var(--radius-m); color: var(--c-text); text-decoration: none; }
.doneCard img, .doneIcon { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-s); background: var(--c-surface-2); display: grid; place-items: center; color: var(--c-text-3); }
.doneText { font-size: var(--fs-s); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.projectRow { display: grid; grid-template-columns: 1fr 2fr auto; align-items: center; gap: var(--sp-3); min-height: 48px; color: var(--c-text); text-decoration: none; }
.proposals { font-size: var(--fs-s); color: var(--c-text-2); }
.soon { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-3); }
.soonCard { display: flex; gap: var(--sp-3); align-items: flex-start; padding: var(--sp-4); border: 1px dashed var(--c-border-strong); border-radius: var(--radius-l); color: var(--c-text); text-decoration: none; font-size: var(--fs-s); }
.soonCard svg { color: var(--c-accent); flex: none; }
.howto { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-4); font-size: var(--fs-s); color: var(--c-text-2); }
```

Modify `frontend/src/App.jsx`: borrar el placeholder `HomePage` y agregar `import { HomePage } from './pages/home/HomePage.jsx';`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(front): Inicio — 'te toca', semana con grilla, pendientes por persona, realizado y proyectos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Usuarios y permisos

**Files:**
- Create: `frontend/src/pages/users/api.js`, `UsersPage.jsx`, `UserSheet.jsx`, `PermissionMatrix.jsx`, `users.module.css`
- Modify: `frontend/src/App.jsx` (reemplazar placeholder `UsersPage`)
- Test: `frontend/src/pages/users/users.test.jsx`

**Interfaces:**
- Consumes: `/api/users*` (Task 5), `Segmented`, `Sheet`, `Avatar`, `relativeTime`, `useConfirm`.
- Produces: `SECTION_LABELS` (front), `TEMPLATE_INFO`, `<PermissionMatrix value onChange disabled>`, `UsersPage`.

- [ ] **Step 1: Test que falla**

`frontend/src/pages/users/users.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionMatrix } from './PermissionMatrix.jsx';
import { generatePassword } from './UserSheet.jsx';

describe('PermissionMatrix', () => {
  it('cambia el nivel de una sección', async () => {
    const onChange = vi.fn();
    const value = { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'view', ads: 'none', web: 'none' };
    render(<PermissionMatrix value={value} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radiogroup', { name: 'Proyectos' }).querySelector('input[value="edit"]'));
    expect(onChange).toHaveBeenCalledWith({ ...value, projects: 'edit' });
  });
});

describe('generatePassword', () => {
  it('10 caracteres sin ambiguos', () => {
    expect(generatePassword()).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{10}$/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd frontend && npx vitest run src/pages/users`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`frontend/src/pages/users/api.js`:
```js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then((r) => r.users) });

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([['users'], ['directory'], ['home']].map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateUser() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (body) => api.post('/users', body).then((r) => r.user), meta: { success: 'Usuario creado ✓' }, onSuccess: refresh });
}
export function usePatchUser(id) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (patch) => api.patch(`/users/${id}`, patch).then((r) => r.user), meta: { success: false }, onSuccess: refresh });
}
export function useSetPermissions(id) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (perms) => api.put(`/users/${id}/permissions`, perms).then((r) => r.user), meta: { success: 'Permisos guardados ✓' }, onSuccess: refresh });
}
export function useResetPassword(id) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => api.post(`/users/${id}/reset-password`), meta: { success: false }, onSuccess: refresh });
}
```

`frontend/src/pages/users/PermissionMatrix.jsx`:
```jsx
import { Segmented } from '../../components/ui/Segmented.jsx';
import s from './users.module.css';

export const SECTION_LABELS = { home: 'Inicio', ideas: 'Ideas', calendar: 'Calendario', projects: 'Proyectos', ads: 'Agente de pauta', web: 'Admin web' };
const LEVELS = [{ value: 'none', label: 'Sin acceso' }, { value: 'view', label: 'Ver' }, { value: 'edit', label: 'Editar' }];

export function PermissionMatrix({ value, onChange, disabled }) {
  return (
    <div className={s.matrix}>
      {Object.entries(SECTION_LABELS).map(([section, label]) => (
        <div key={section} className={s.matrixRow}>
          <span className={s.matrixLabel}>{label}</span>
          <Segmented label={label} value={value[section]} disabled={disabled} options={LEVELS} onChange={(level) => onChange({ ...value, [section]: level })} />
        </div>
      ))}
    </div>
  );
}
```

`frontend/src/pages/users/UserSheet.jsx`:
```jsx
import { useState } from 'react';
import { Copy, KeyRound, UserX, UserCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { toastBus } from '../../state/toastBus.js';
import { PermissionMatrix } from './PermissionMatrix.jsx';
import { useCreateUser, usePatchUser, useResetPassword, useSetPermissions } from './api.js';
import s from './users.module.css';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generatePassword(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const TEMPLATES = [
  { value: 'equipo', label: 'Equipo' },
  { value: 'lectura', label: 'Solo lectura' },
  { value: 'admin', label: 'Admin' },
];
const TEMPLATE_HELP = {
  equipo: 'Ve y edita ideas, calendario y proyectos. No borra. Ve pauta y web.',
  lectura: 'Ve todo, no cambia nada.',
  admin: 'Edita y borra todo, y gestiona usuarios.',
};

function Credentials({ email, password, onClose }) {
  const text = `Entrá a https://uniformar.techdi.com.ar\nUsuario: ${email}\nContraseña: ${password}\n(Te va a pedir que la cambies)`;
  return (
    <div className={s.creds}>
      <p><strong>Pasale estos datos:</strong></p>
      <pre className={s.credsBox}>{text}</pre>
      <div className={s.row}>
        <Button icon={Copy} onClick={() => navigator.clipboard.writeText(text).then(() => toastBus.success('Copiado ✓'))}>Copiar</Button>
        <Button variant="secondary" onClick={onClose}>Listo</Button>
      </div>
    </div>
  );
}

export function NewUserSheet({ onClose }) {
  const create = useCreateUser();
  const [form, setForm] = useState({ name: '', email: '', password: generatePassword(), template: 'equipo' });
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  function submit(e) {
    e.preventDefault();
    create.mutate(form, { onSuccess: () => setDone({ email: form.email, password: form.password }), onError: (err) => setErrors(err.fields ?? {}) });
  }

  return (
    <Sheet open onClose={onClose} title="Nuevo usuario"
      footer={!done && <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="user-new" loading={create.isPending}>Crear usuario</Button></>}>
      {done ? <Credentials {...done} onClose={onClose} /> : (
        <form id="user-new" className={s.form} onSubmit={submit} noValidate>
          <Field label="Nombre" required error={errors.name}><Input value={form.name} onChange={set('name')} placeholder="Ej.: Santi" /></Field>
          <Field label="Email" required error={errors.email}><Input type="email" inputMode="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Contraseña inicial" hint="Se la pasás; al entrar la tiene que cambiar." error={errors.password} htmlFor="new-pw">
            <div className={s.row}>
              <Input id="new-pw" value={form.password} onChange={set('password')} />
              <Button variant="secondary" icon={RefreshCw} aria-label="Generar otra" onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))} />
            </div>
          </Field>
          <div>
            <p className={s.label}>Permisos</p>
            <Segmented label="Plantilla de permisos" value={form.template} onChange={set('template')} options={TEMPLATES} />
            <p className={s.help}>{TEMPLATE_HELP[form.template]} Después podés ajustarlos sección por sección.</p>
          </div>
        </form>
      )}
    </Sheet>
  );
}

export function EditUserSheet({ user: target, onClose }) {
  const { user: me } = useAuth();
  const isSelf = me.id === target.id;
  const patch = usePatchUser(target.id);
  const setPerms = useSetPermissions(target.id);
  const reset = useResetPassword(target.id);
  const confirm = useConfirm();
  const [perms, setPermsState] = useState(target.permissions);
  const [temp, setTemp] = useState(null);
  const dirty = JSON.stringify(perms) !== JSON.stringify(target.permissions);

  async function onReset() {
    if (!(await confirm({ title: `¿Resetear la contraseña de ${target.name}?`, message: 'Se cierran sus sesiones y le vas a tener que pasar una contraseña temporal.', confirmLabel: 'Resetear' }))) return;
    reset.mutate(undefined, { onSuccess: (r) => setTemp(r.temporaryPassword) });
  }

  async function toggleActive() {
    const deactivate = target.is_active;
    if (deactivate && !(await confirm({ title: `¿Desactivar a ${target.name}?`, message: 'No va a poder entrar. Sus tareas e historial se conservan.', confirmLabel: 'Desactivar', danger: true }))) return;
    patch.mutate({ is_active: !deactivate }, { onSuccess: () => toastBus.success(deactivate ? 'Usuario desactivado' : 'Usuario reactivado') });
  }

  return (
    <Sheet open onClose={onClose} title={target.name} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cerrar</Button><Button disabled={!dirty} loading={setPerms.isPending} onClick={() => setPerms.mutate(perms)}>Guardar permisos</Button></>}>
      <div className={s.form}>
        <p className="muted">{target.email}</p>
        {temp && <Credentials email={target.email} password={temp} onClose={() => setTemp(null)} />}
        <PermissionMatrix value={perms} onChange={setPermsState} />
        <label className={s.flag}>
          <input type="checkbox" checked={target.can_delete} onChange={(e) => patch.mutate({ can_delete: e.target.checked }, { onSuccess: () => toastBus.success('Guardado ✓') })} />
          <span><strong>Puede borrar</strong><br /><span className="muted">Ideas, piezas, proyectos, tareas y archivos.</span></span>
        </label>
        <label className={s.flag}>
          <input type="checkbox" checked={target.manage_users} disabled={isSelf} onChange={(e) => patch.mutate({ manage_users: e.target.checked }, { onSuccess: () => toastBus.success('Guardado ✓') })} />
          <span><strong>Gestiona usuarios</strong><br /><span className="muted">Crea usuarios y cambia permisos.</span></span>
        </label>
        <div className={s.row}>
          <Button variant="secondary" icon={KeyRound} onClick={onReset} loading={reset.isPending}>Resetear contraseña</Button>
          {!isSelf && (
            <Button variant={target.is_active ? 'danger' : 'secondary'} icon={target.is_active ? UserX : UserCheck} onClick={toggleActive}>
              {target.is_active ? 'Desactivar' : 'Reactivar'}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
```


`frontend/src/pages/users/UsersPage.jsx`:
```jsx
import { useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Fab } from '../../components/shell/Fab.jsx';
import { relativeTime } from '../../lib/dates.js';
import { useUsers } from './api.js';
import { NewUserSheet, EditUserSheet } from './UserSheet.jsx';
import s from './users.module.css';
import p from '../pages.module.css';

function roleLabel(u) {
  if (u.manage_users) return 'Admin';
  const levels = Object.values(u.permissions);
  if (levels.every((l) => l !== 'edit')) return 'Solo lectura';
  return 'Equipo';
}

export function UsersPage() {
  const { data: users, isPending } = useUsers();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const editing = users?.find((u) => u.id === editingId);

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Quién entra y qué puede hacer" actions={<Button className="desktop-only" icon={Plus} onClick={() => setCreating(true)}>Nuevo usuario</Button>} />
      <div className={p.page}>
        {isPending ? <div className={p.center}><Spinner /></div> : (
          <div className={p.list}>
            {users.map((u) => (
              <button key={u.id} type="button" className={`${p.listItem} ${s.userRow} ${u.is_active ? '' : s.inactive}`} onClick={() => setEditingId(u.id)}>
                <Avatar user={u} size={36} />
                <span className={s.userMain}>
                  <strong>{u.name}</strong>
                  <span className="muted">{u.email}</span>
                </span>
                <span className={s.userMeta}>
                  <span className={s.role}>{u.is_active ? roleLabel(u) : 'Desactivado'}</span>
                  <span className="muted">{u.last_login_at ? `Entró ${relativeTime(u.last_login_at)}` : 'Nunca entró'}</span>
                </span>
                <ChevronRight size={18} aria-hidden className="muted" />
              </button>
            ))}
          </div>
        )}
      </div>
      <Fab icon={Plus} label="Nuevo usuario" onClick={() => setCreating(true)} />
      {creating && <NewUserSheet onClose={() => setCreating(false)} />}
      {editing && <EditUserSheet key={editing.id + JSON.stringify(editing.permissions)} user={editing} onClose={() => setEditingId(null)} />}
    </>
  );
}
```

`frontend/src/pages/users/users.module.css`:
```css
.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.row { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
.row input { flex: 1; }
.label { font-size: var(--fs-s); font-weight: 600; color: var(--c-text-2); margin-bottom: 6px; }
.help { font-size: var(--fs-s); color: var(--c-text-3); margin-top: var(--sp-2); }
.matrix { display: flex; flex-direction: column; gap: var(--sp-3); }
.matrixRow { display: flex; flex-direction: column; gap: 6px; }
@media (min-width: 600px) { .matrixRow { flex-direction: row; align-items: center; justify-content: space-between; } }
.matrixLabel { font-weight: 600; }
.flag { display: flex; gap: var(--sp-3); align-items: flex-start; padding: var(--sp-3); border: 1px solid var(--c-border); border-radius: var(--radius-m); font-size: var(--fs-s); }
.flag input { width: 22px; height: 22px; accent-color: var(--c-accent); flex: none; margin-top: 2px; }
.creds { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4); border-radius: var(--radius-m); background: var(--c-success-soft); }
.credsBox { margin: 0; padding: var(--sp-3); border-radius: var(--radius-s); background: var(--c-surface); font-family: ui-monospace, monospace; font-size: var(--fs-s); white-space: pre-wrap; }
.userRow { width: 100%; border: 0; border-bottom: 1px solid var(--c-border); background: transparent; text-align: left; cursor: pointer; padding-top: var(--sp-2); padding-bottom: var(--sp-2); }
.userMain { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: var(--fs-s); }
.userMain strong { font-size: var(--fs-m); }
.userMeta { display: none; flex-direction: column; align-items: flex-end; font-size: var(--fs-xs); }
@media (min-width: 700px) { .userMeta { display: flex; } }
.role { font-weight: 700; color: var(--c-accent-text); }
.inactive { opacity: 0.55; }
```

Modify `frontend/src/App.jsx`: borrar el placeholder `UsersPage` y agregar `import { UsersPage } from './pages/users/UsersPage.jsx';`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Verificación manual**

Como superadmin: crear a Sofi con plantilla Admin y copiar las credenciales; crear a Santi (Equipo) y a Bauti (Equipo); a Bauti cambiarle Proyectos a "Ver" y guardar; resetear la contraseña de Bauti y verificar que su sesión se cierra; intentar sacarse "Gestiona usuarios" a uno mismo (deshabilitado).

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(front): usuarios — alta con plantilla y credenciales para copiar, matriz de permisos, reset y desactivación

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Ajustes (grilla fija y clientes) y Mi cuenta

**Files:**
- Create: `frontend/src/pages/Settings.jsx`, `frontend/src/pages/Account.jsx`, `frontend/src/pages/settings.module.css`
- Modify: `frontend/src/App.jsx` (reemplazar placeholders `SettingsPage` y `AccountPage`; borrar `Placeholder.jsx` y su import si ya no se usa)
- Test: `frontend/src/pages/settings.test.jsx`

**Interfaces:**
- Consumes: `/api/settings/content-rules`, `/api/clients*`, `/api/auth/me` (PATCH), `ChangePasswordForm`, `useRules`, `useClients`.
- Produces: `SettingsPage`, `AccountPage`, `AVATAR_COLORS`.

- [ ] **Step 1: Test que falla**

`frontend/src/pages/settings.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../api/queryClient.js';
import { AuthProvider } from '../state/auth.jsx';
import { ConfirmProvider } from '../components/ui/ConfirmDialog.jsx';
import { SettingsPage } from './Settings.jsx';

const me = { id: 'u1', name: 'Sofi', can_delete: true, manage_users: true, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'edit', web: 'edit' } };
const rules = [{ id: 'r1', weekday: 2, time: null, theme: 'Foco por rubro', format: 'Carrusel / post', channels: ['ig_post'], active: true }];
const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('Ajustes', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: me });
      if (url === '/api/settings/content-rules' && opts.method === 'PUT') return json({ rules: JSON.parse(opts.body).rules });
      if (url === '/api/settings/content-rules') return json({ rules });
      if (url === '/api/clients') return json({ clients: [] });
      return json({});
    });
  });

  it('edita la grilla fija y guarda la lista completa', async () => {
    render(<QueryClientProvider client={createQueryClient()}><MemoryRouter><AuthProvider><ConfirmProvider><SettingsPage /></ConfirmProvider></AuthProvider></MemoryRouter></QueryClientProvider>);
    const theme = await screen.findByDisplayValue('Foco por rubro');
    await userEvent.clear(theme);
    await userEvent.type(theme, 'Rubro de la semana');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar día' }));
    await userEvent.type(screen.getAllByLabelText('Temática').at(-1), 'Detrás de escena');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    const put = fetch.mock.calls.find(([u, o]) => u === '/api/settings/content-rules' && o?.method === 'PUT');
    const body = JSON.parse(put[1].body);
    expect(body.rules.map((r) => r.theme)).toEqual(['Rubro de la semana', 'Detrás de escena']);
    expect(body.rules[0]).toMatchObject({ weekday: 2, channels: ['ig_post'], active: true, time: null });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd frontend && npx vitest run src/pages/settings.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`frontend/src/pages/Settings.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Merge } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../state/auth.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Chip, ChipGroup } from '../components/ui/Chip.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';
import { CHANNELS, CHANNEL_LABELS } from '../lib/ideaStatus.js';
import { useRules } from './calendar/api.js';
import { useClients } from './ideas/api.js';
import s from './settings.module.css';
import p from './pages.module.css';

const WEEKDAYS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];
const blankRule = () => ({ weekday: 1, time: '', theme: '', format: '', channels: [], active: true });

function RulesEditor() {
  const qc = useQueryClient();
  const { data } = useRules();
  const [rules, setRules] = useState(null);
  const [errors, setErrors] = useState({});
  useEffect(() => { if (data && !rules) setRules(data.map((r) => ({ ...r, time: r.time ?? '' }))); }, [data, rules]);
  const save = useMutation({
    mutationFn: (list) => api.put('/settings/content-rules', { rules: list }).then((r) => r.rules),
    meta: { success: 'Grilla guardada ✓' },
    onSuccess: (saved) => { setRules(saved.map((r) => ({ ...r, time: r.time ?? '' }))); qc.invalidateQueries({ queryKey: ['rules'] }); qc.invalidateQueries({ queryKey: ['home'] }); },
    onError: (err) => setErrors(err.fields ?? {}),
  });
  if (!rules) return null;
  const update = (i, patch) => setRules((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toggle = (i, c) => update(i, { channels: rules[i].channels.includes(c) ? rules[i].channels.filter((x) => x !== c) : [...rules[i].channels, c] });

  function onSave() {
    const missing = rules.findIndex((r) => !r.theme.trim());
    if (missing >= 0) return setErrors({ [`rules.${missing}.theme`]: 'Poné la temática' });
    setErrors({});
    save.mutate(rules.map((r) => ({ weekday: Number(r.weekday), time: r.time || null, theme: r.theme.trim(), format: r.format.trim(), channels: CHANNELS.filter((c) => r.channels.includes(c)), active: r.active })));
  }

  return (
    <section className={s.card}>
      <h2>Grilla fija de publicaciones</h2>
      <p className="muted">Lo que se publica cada semana. Se marca en el calendario y en el Inicio.</p>
      {rules.map((r, i) => (
        <div key={i} className={s.rule}>
          <div className={s.ruleRow}>
            <Field label="Día"><Select value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}>{WEEKDAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Hora" error={errors[`rules.${i}.time`]}><Input type="time" value={r.time} onChange={(e) => update(i, { time: e.target.value })} /></Field>
          </div>
          <Field label="Temática" error={errors[`rules.${i}.theme`]}><Input value={r.theme} onChange={(e) => update(i, { theme: e.target.value })} /></Field>
          <Field label="Formato"><Input value={r.format} onChange={(e) => update(i, { format: e.target.value })} placeholder="Ej.: Reel, 1–2 historias" /></Field>
          <ChipGroup label={`Canales de la regla ${i + 1}`}>
            {CHANNELS.map((c) => <Chip key={c} selected={r.channels.includes(c)} onClick={() => toggle(i, c)}>{CHANNEL_LABELS[c]}</Chip>)}
          </ChipGroup>
          <div className={s.ruleFoot}>
            <label className={s.switch}><input type="checkbox" checked={r.active} onChange={(e) => update(i, { active: e.target.checked })} /> Activa</label>
            <IconButton icon={Trash2} label="Quitar" onClick={() => setRules((list) => list.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
      <div className={s.actions}>
        <Button variant="secondary" icon={Plus} onClick={() => setRules((list) => [...list, blankRule()])}>Agregar día</Button>
        <Button onClick={onSave} loading={save.isPending}>Guardar grilla</Button>
      </div>
    </section>
  );
}

function ClientsEditor() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const confirm = useConfirm();
  const { data: clients = [] } = useClients();
  const [names, setNames] = useState({});
  const [mergeFrom, setMergeFrom] = useState(null);
  const [mergeInto, setMergeInto] = useState('');
  const refresh = () => Promise.all([['clients'], ['ideas']].map((k) => qc.invalidateQueries({ queryKey: k })));
  const rename = useMutation({ mutationFn: ({ id, name }) => api.patch(`/clients/${id}`, { name }), meta: { success: 'Cliente renombrado ✓' }, onSettled: refresh });
  const merge = useMutation({ mutationFn: ({ id, into }) => api.post(`/clients/${id}/merge`, { into_id: into }), meta: { success: 'Clientes unificados ✓' }, onSettled: refresh });

  return (
    <section className={s.card}>
      <h2>Clientes (para los viernes)</h2>
      <p className="muted">Si un cliente quedó cargado dos veces con distinto nombre, unificalos.</p>
      {clients.length === 0 && <p className="muted">Todavía no hay clientes. Se crean solos al cargar una idea de viernes.</p>}
      {clients.map((c) => (
        <div key={c.id} className={s.client}>
          <Input aria-label={`Nombre de ${c.name}`} value={names[c.id] ?? c.name} onChange={(e) => setNames((n) => ({ ...n, [c.id]: e.target.value }))}
            onBlur={() => { const v = (names[c.id] ?? c.name).trim(); if (v && v !== c.name) rename.mutate({ id: c.id, name: v }); }} />
          <span className="muted">{c.idea_count} ideas</span>
          {user.can_delete && <IconButton icon={Merge} label={`Unificar ${c.name}`} onClick={() => { setMergeFrom(c); setMergeInto(''); }} />}
        </div>
      ))}
      {mergeFrom && (
        <div className={s.merge}>
          <p>Unificar <strong>{mergeFrom.name}</strong> dentro de:</p>
          <Select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} aria-label="Cliente destino">
            <option value="">Elegí un cliente</option>
            {clients.filter((c) => c.id !== mergeFrom.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className={s.actions}>
            <Button variant="secondary" onClick={() => setMergeFrom(null)}>Cancelar</Button>
            <Button disabled={!mergeInto} onClick={async () => {
              if (await confirm({ title: '¿Unificar clientes?', message: `Las ideas de "${mergeFrom.name}" pasan al otro y "${mergeFrom.name}" se borra.`, confirmLabel: 'Unificar' })) {
                merge.mutate({ id: mergeFrom.id, into: mergeInto }, { onSuccess: () => setMergeFrom(null) });
              }
            }}>Unificar</Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className={`${p.page} ${s.stack}`}>
        <RulesEditor />
        <ClientsEditor />
      </div>
    </>
  );
}
```

`frontend/src/pages/Account.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, LogOut } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../state/auth.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Avatar } from '../components/ui/Avatar.jsx';
import { ChangePasswordForm } from './ChangePassword.jsx';
import s from './settings.module.css';
import p from './pages.module.css';

export const AVATAR_COLORS = ['#775D66', '#366497', '#2D7A57', '#9A640F', '#B23A3C', '#5B4B8A', '#1F7A80', '#4A4346'];
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

function InstallApp() {
  const [prompt, setPrompt] = useState(null);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  if (window.matchMedia('(display-mode: standalone)').matches) return <p className="muted">Ya la tenés instalada ✓</p>;
  if (prompt) return <Button icon={Download} onClick={() => prompt.prompt()}>Instalar en este dispositivo</Button>;
  if (isIOS()) return <p className="muted">En iPhone: tocá <strong>Compartir</strong> y después <strong>Agregar a inicio</strong>.</p>;
  return <p className="muted">En Android/Chrome: menú ⋮ → <strong>Instalar app</strong>.</p>;
}

export function AccountPage() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.avatar_color);
  const save = useMutation({
    mutationFn: (body) => api.patch('/auth/me', body).then((r) => r.user),
    meta: { success: 'Perfil guardado ✓' },
    onSuccess: setUser,
  });

  return (
    <>
      <PageHeader title="Mi cuenta" subtitle={user.email} />
      <div className={`${p.page} ${s.stack}`}>
        <section className={s.card}>
          <h2>Perfil</h2>
          <div className={s.profile}>
            <Avatar user={{ name, avatar_color: color }} size={56} />
            <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          </div>
          <div role="radiogroup" aria-label="Color" className={s.colors}>
            {AVATAR_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${c}`} className={`${s.swatch} ${color === c ? s.swatchOn : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
          <div className={s.actions}><Button onClick={() => save.mutate({ name: name.trim(), avatar_color: color })} loading={save.isPending} disabled={!name.trim()}>Guardar perfil</Button></div>
        </section>
        <section className={s.card}>
          <h2>Contraseña</h2>
          <ChangePasswordForm />
        </section>
        <section className={s.card}>
          <h2>App en el celular</h2>
          <InstallApp />
        </section>
        <Button variant="ghost" icon={LogOut} onClick={logout}>Salir</Button>
      </div>
    </>
  );
}
```

`frontend/src/pages/settings.module.css`:
```css
.stack { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 720px; }
.card { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4); background: var(--c-surface); border: 1px solid var(--c-border); border-radius: var(--radius-l); }
.card h2 { font-size: var(--fs-l); }
.rule { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-3); border: 1px solid var(--c-border); border-radius: var(--radius-m); }
.ruleRow { display: grid; grid-template-columns: 1fr 120px; gap: var(--sp-2); }
.ruleFoot { display: flex; align-items: center; justify-content: space-between; }
.switch { display: flex; align-items: center; gap: var(--sp-2); font-weight: 500; }
.switch input { width: 20px; height: 20px; accent-color: var(--c-accent); }
.actions { display: flex; gap: var(--sp-2); justify-content: flex-end; flex-wrap: wrap; }
.client { display: flex; align-items: center; gap: var(--sp-2); }
.client input { flex: 1; }
.merge { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); border-radius: var(--radius-m); background: var(--c-surface-2); }
.profile { display: flex; align-items: flex-end; gap: var(--sp-3); }
.profile > div { flex: 1; }
.colors { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.swatch { width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer; box-shadow: 0 0 0 2px var(--c-surface); }
.swatchOn { box-shadow: 0 0 0 2px var(--c-surface), 0 0 0 4px var(--c-text); }
```

Modify `frontend/src/App.jsx`: borrar los placeholders `SettingsPage` y `AccountPage` y agregar
`import { SettingsPage } from './pages/Settings.jsx';` y `import { AccountPage } from './pages/Account.jsx';`. Si ya no queda ningún placeholder, borrar `pages/Placeholder.jsx` y su import.

- [ ] **Step 4: Correr tests y build**

Run: `cd frontend && npx vitest run && npx vite build`
Expected: PASS y build OK.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(front): ajustes de grilla fija y clientes, mi cuenta con perfil, contraseña e instalación

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Deploy, migración de datos y verificación final

> Esta task la ejecuta la sesión principal (no un subagente): necesita al usuario para Railway, Cloudflare R2, el DNS y el acceso al artifact del prototipo. **Confirmar con el usuario antes de cada paso que publica algo** (deploy, DNS, migración contra producción).

**Files:**
- Create: `scratch/export.json` (fuera del repo; no se commitea)
- Modify: memoria del proyecto (`project-uniformar.md`)

- [ ] **Step 1: Suite completa y build**

Run: `npm --prefix backend test && npm --prefix frontend test && npm --prefix frontend run build`
Expected: todo PASS y `frontend/dist/` generado.

- [ ] **Step 2: Bucket de archivos (usuario)**

Pedir al usuario: en Cloudflare → R2 → crear bucket `uniformar` (privado) → "Manage R2 API Tokens" → token con permiso Object Read & Write sobre ese bucket. Anotar `Account ID`, `Access Key ID`, `Secret Access Key`. Endpoint: `https://<account-id>.r2.cloudflarestorage.com`.

- [ ] **Step 3: Proyecto en Railway (con confirmación del usuario)**

```bash
railway login                      # el usuario, si no está logueado: `! railway login`
railway init --name uniformar
railway add --database postgres
railway add --service uniformar
railway variables --service uniformar \
  --set "NODE_ENV=production" \
  --set "DATABASE_URL=\${{Postgres.DATABASE_URL}}" \
  --set "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  --set "ADMIN_INITIAL_PASSWORD=<genérica que defina el usuario>" \
  --set "STORAGE_DRIVER=s3" --set "S3_REGION=auto" --set "S3_BUCKET=uniformar" \
  --set "S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com" \
  --set "S3_ACCESS_KEY_ID=<...>" --set "S3_SECRET_ACCESS_KEY=<...>"
railway up --service uniformar --detach
railway logs --service uniformar   # esperar "migraciones aplicadas" y "uniformar escuchando"
railway domain --service uniformar  # dominio *.up.railway.app para probar
```
Expected: `https://<app>.up.railway.app/health` → `{"ok":true,"db":true}`.

- [ ] **Step 4: Dominio propio**

```bash
railway domain uniformar.techdi.com.ar --service uniformar
```
Pasarle al usuario el registro CNAME que devuelve Railway para cargar en el DNS de `techdi.com.ar`. Verificar `https://uniformar.techdi.com.ar/health` cuando propague.

- [ ] **Step 5: Primer ingreso y usuarios**

Entrar con `jdilernia99@gmail.com` + la contraseña genérica → cambiarla. Crear a Sofi (Admin), Santi (Equipo) y Bauti (Equipo) con los mails que confirme el usuario (pendiente: el mail definitivo de Santi).

- [ ] **Step 6: Exportar y migrar los datos del prototipo (con confirmación)**

1. Con la herramienta `ArtifactData` (`action: "list"`) sobre `https://claude.ai/artifact/LN5hR5YZqG9pPJz3Wbkuis`, listar las colecciones y leer todos los documentos de ideas, proyectos (con sus tareas) y calendario.
2. Armar `scratch/export.json` con la forma `{ "ideas": [...], "proyectos": [{ ..., "tareas": [...] }], "calendar": { "YYYY-MM-DD": {...} } }` (campos del brief §5). Mostrarle al usuario los conteos (se esperan ~21 ideas, 3 proyectos, 3 tareas).
3. Correr contra producción:
```bash
railway run --service uniformar -- node backend/scripts/migrateFromPrototype.js --file scratch/export.json --map "Sofi=<email>,Santi=<email>,Bauti=<email>"
```
Expected: tabla con `ideas: 21, projects: 3, tasks: 3, ...`. Correrlo de nuevo debe dar todo en 0 (idempotente).
4. Recordarle a Sofi que vuelva a subir las 14 fotos y el PDF.

- [ ] **Step 7: Verificación final en producción (390 px y 1440 px)**

Recorrido: login → Inicio → idea nueva con foto desde el celular → decidir → completar con link → calendario: pieza con previsualización 9:16 → proyecto con PDF (ver embebido en escritorio) → usuario "Solo lectura" sin acciones → cortar el wifi y ver el banner "Sin conexión" + toast de error al intentar guardar.

- [ ] **Step 8: Actualizar memoria**

Actualizar `project-uniformar.md` con: URL de producción, servicio de Railway, estado de la migración, pendientes (mail de Santi, fotos a re-subir) y que lo siguiente es el Subproyecto 2.

---

## Self-review del plan

- **Cobertura del spec:** §2 alcance → Tasks 1–24; §4 auth/permisos → 3, 4, 5, 15, 22; §5 modelo → 2 (+ `assignee_id`, `refs`, `legacy_id` en tareas, ver spec actualizado); §6 API → 4–11; §7 archivos → 7, 17; §8 UX → 14–23; embeds → 17; §9 migración → 12, 24; §10 testing → tests por task + 24; §11 deploy → 13, 24.
- **Review Focus:** iPhone/WebP → test `encodeCanvas` (Task 17); fechas → `schema.test` DATE + `dates.test` back/front + `home.test` lunes 00:30 ART (Tasks 2, 11, 17); sesión vencida → `useDraft` (Task 14) + handler de 401 (Task 15); textos largos → `ideas.test`, `projects.test`, `calendar.test` (Tasks 8–10) + `prewrap`; borrado vinculado/usuario desactivado → `calendar.test`, `ideas.test`, `home.test` (Tasks 8, 9, 11).
