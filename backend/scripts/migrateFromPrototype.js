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
