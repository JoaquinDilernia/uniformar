const TASKS = `
  SELECT t.*, COALESCE(array_agg(ta.user_id::text) FILTER (WHERE ta.user_id IS NOT NULL), '{}') AS assignee_ids
  FROM project_tasks t LEFT JOIN task_assignees ta ON ta.task_id = t.id`;

export function createProjectsRepo(db) {
  return {
    async list() {
      const { rows } = await db.query(`
        SELECT p.*, count(t.id)::int AS task_total, (count(t.id) FILTER (WHERE t.done))::int AS task_done
        FROM projects p LEFT JOIN project_tasks t ON t.project_id = p.id
        GROUP BY p.id
        ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'proposal' THEN 2 ELSE 3 END, p.updated_at DESC`);
      return rows;
    },
    async get(id) {
      const { rows } = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
      return rows[0] ?? null;
    },
    async tasks(projectId) {
      const { rows } = await db.query(`${TASKS} WHERE t.project_id = $1 GROUP BY t.id ORDER BY t.done, t.sort, t.created_at`, [projectId]);
      return rows;
    },
    async task(q, id) {
      const { rows } = await q.query(`${TASKS} WHERE t.id = $1 GROUP BY t.id`, [id]);
      return rows[0] ?? null;
    },
    async updates(projectId) {
      const { rows } = await db.query(
        `SELECT u.id, u.body, u.created_at, u.author_id, us.name AS author_name, us.avatar_color AS author_color
         FROM project_updates u LEFT JOIN users us ON us.id = u.author_id
         WHERE u.project_id = $1 ORDER BY u.created_at DESC`,
        [projectId],
      );
      return rows;
    },
  };
}
