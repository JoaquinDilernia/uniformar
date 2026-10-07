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
