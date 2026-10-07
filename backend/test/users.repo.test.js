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
