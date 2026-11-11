import { notFound } from '../lib/errors.js';

// Presupuestos y reseñas de la web pública
export function createWebRepo(db) {
  async function addQuote(q) {
    const { rows } = await db.query(
      `INSERT INTO web_quotes (name, company, phone, rubro, quantity, message, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [q.name, q.company, q.phone, q.rubro, q.quantity, q.message, q.source],
    );
    return rows[0];
  }

  async function listQuotes({ status } = {}) {
    const { rows } = await db.query(
      `SELECT q.*, u.name AS updated_by_name
       FROM web_quotes q LEFT JOIN users u ON u.id = q.updated_by
       WHERE ($1::text IS NULL OR q.status = $1)
       ORDER BY q.created_at DESC LIMIT 500`,
      [status ?? null],
    );
    return rows;
  }

  async function updateQuote(id, { status, note }, userId) {
    const { rows } = await db.query(
      `UPDATE web_quotes SET status = coalesce($2, status), note = coalesce($3, note), updated_at = now(), updated_by = $4
       WHERE id = $1 RETURNING *`,
      [id, status ?? null, note ?? null, userId],
    );
    if (!rows[0]) throw notFound('No existe ese presupuesto.');
    return rows[0];
  }

  async function addReview(r) {
    const { rows } = await db.query(
      'INSERT INTO web_reviews (name, company, rating, text) VALUES ($1, $2, $3, $4) RETURNING *',
      [r.name, r.company, r.rating, r.text],
    );
    return rows[0];
  }

  async function listReviews({ status } = {}) {
    const { rows } = await db.query(
      `SELECT r.*, u.name AS reviewed_by_name
       FROM web_reviews r LEFT JOIN users u ON u.id = r.reviewed_by
       WHERE ($1::text IS NULL OR r.status = $1)
       ORDER BY r.created_at DESC LIMIT 500`,
      [status ?? null],
    );
    return rows;
  }

  // Lo que ve el público: solo aprobadas y sin datos internos
  async function publicReviews() {
    const { rows } = await db.query(
      `SELECT id, name, company, rating, text, created_at FROM web_reviews
       WHERE status = 'approved' ORDER BY reviewed_at DESC NULLS LAST, created_at DESC LIMIT 30`,
    );
    return rows;
  }

  async function setReviewStatus(id, status, userId) {
    const { rows } = await db.query(
      `UPDATE web_reviews SET status = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1 RETURNING *`,
      [id, status, userId],
    );
    if (!rows[0]) throw notFound('No existe esa reseña.');
    return rows[0];
  }

  async function deleteReview(id) {
    const { rows } = await db.query('DELETE FROM web_reviews WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) throw notFound('No existe esa reseña.');
  }

  async function counters() {
    const { rows } = await db.query(
      `SELECT (SELECT count(*)::int FROM web_quotes WHERE status = 'new') AS new_quotes,
              (SELECT count(*)::int FROM web_reviews WHERE status = 'pending') AS pending_reviews`,
    );
    return rows[0];
  }

  return { addQuote, listQuotes, updateQuote, addReview, listReviews, publicReviews, setReviewStatus, deleteReview, counters };
}
