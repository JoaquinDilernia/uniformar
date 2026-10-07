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
