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
