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
