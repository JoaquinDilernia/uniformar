import { deriveIdeaStatus } from '../lib/ideaStatus.js';

const IDEA_COLS = `i.id, i.text, i.kind, i.format, i.category, i.decision, i.done_at, i.due_date, i.assignee_id, c.name AS client_name`;
const summarize = ({ decision, done_at, ...rest }) => ({ ...rest, status: deriveIdeaStatus({ kind: rest.kind, decision, done_at }) });

export function createHomeRepo(db) {
  return {
    async rules() {
      const { rows } = await db.query('SELECT weekday, time, theme, format, channels FROM content_rules WHERE active ORDER BY sort');
      return rows;
    },
    async weekItems(start, end) {
      const { rows } = await db.query(
        'SELECT id, date, title, channels, status, idea_id, piece_url FROM calendar_items WHERE date BETWEEN $1 AND $2 ORDER BY date, sort, created_at',
        [start, end],
      );
      return rows;
    },
    async ideaCounters(fromISO, toISO) {
      const { rows } = await db.query(
        `SELECT
           (count(*) FILTER (WHERE created_at >= $1 AND created_at < $2))::int AS new_ideas_week,
           (count(*) FILTER (WHERE kind = 'idea' AND decision = 'pending' AND done_at IS NULL))::int AS to_decide,
           (count(*) FILTER (WHERE done_at >= $1 AND done_at < $2))::int AS done_week
         FROM ideas`,
        [fromISO, toISO],
      );
      return rows[0];
    },
    async toDecide() {
      const { rows } = await db.query(
        `SELECT ${IDEA_COLS} FROM ideas i LEFT JOIN clients c ON c.id = i.client_id
         WHERE i.kind = 'idea' AND i.decision = 'pending' AND i.done_at IS NULL ORDER BY i.created_at DESC LIMIT 50`,
      );
      return rows.map(summarize);
    },
    async openAssignedIdeas() {
      const { rows } = await db.query(
        `SELECT ${IDEA_COLS} FROM ideas i LEFT JOIN clients c ON c.id = i.client_id
         WHERE i.done_at IS NULL AND i.decision <> 'no' AND (i.kind = 'must' OR i.decision = 'yes') AND i.assignee_id IS NOT NULL
         ORDER BY i.due_date NULLS LAST, i.created_at`,
      );
      return rows.map(summarize);
    },
    async recentlyDone(limit = 8) {
      const { rows } = await db.query(
        `SELECT i.id, i.text, i.format, i.result_url, i.done_at,
           (SELECT f.id FROM files f WHERE f.owner_type = 'idea_result' AND f.owner_id = i.id ORDER BY f.sort LIMIT 1) AS thumb_file_id,
           (SELECT f.storage_key FROM files f WHERE f.owner_type = 'idea_result' AND f.owner_id = i.id ORDER BY f.sort LIMIT 1) AS thumb_key
         FROM ideas i WHERE i.done_at IS NOT NULL ORDER BY i.done_at DESC LIMIT $1`,
        [limit],
      );
      return rows;
    },
    async openTasksInActiveProjects() {
      const { rows } = await db.query(
        `SELECT t.id, t.text, t.due_date, p.id AS project_id, p.name AS project_name,
           COALESCE(array_agg(ta.user_id::text) FILTER (WHERE ta.user_id IS NOT NULL), '{}') AS assignee_ids
         FROM project_tasks t
         JOIN projects p ON p.id = t.project_id AND p.status = 'active'
         LEFT JOIN task_assignees ta ON ta.task_id = t.id
         WHERE NOT t.done
         GROUP BY t.id, p.id ORDER BY t.due_date NULLS LAST, t.sort`,
      );
      return rows;
    },
    async projectsSummary() {
      const { rows } = await db.query(
        `SELECT p.id, p.name, p.status, count(t.id)::int AS task_total, (count(t.id) FILTER (WHERE t.done))::int AS task_done
         FROM projects p LEFT JOIN project_tasks t ON t.project_id = p.id
         WHERE p.status <> 'done' GROUP BY p.id ORDER BY p.updated_at DESC`,
      );
      return rows;
    },
    async activeUsers() {
      const { rows } = await db.query('SELECT id, name, avatar_color FROM users WHERE is_active ORDER BY lower(name)');
      return rows;
    },
  };
}
