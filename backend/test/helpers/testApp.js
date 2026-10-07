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
