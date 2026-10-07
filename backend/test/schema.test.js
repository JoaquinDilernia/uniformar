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
