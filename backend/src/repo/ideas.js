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
