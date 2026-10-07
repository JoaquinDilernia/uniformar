export function createActivityRepo(db) {
  return {
    async listFor(entityType, entityId, limit = 50) {
      const { rows } = await db.query(
        `SELECT a.id, a.action, a.diff, a.created_at, u.name AS actor_name, u.avatar_color AS actor_color
         FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
         WHERE a.entity_type = $1 AND a.entity_id = $2
         ORDER BY a.created_at DESC, a.id DESC LIMIT $3`,
        [entityType, entityId, limit],
      );
      return rows;
    },
  };
}
