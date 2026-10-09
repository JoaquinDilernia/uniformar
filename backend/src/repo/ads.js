import { conflict, notFound } from '../lib/errors.js';

const DECISION_COLS = `d.id, d.run_id, d.tool, d.input, d.title, d.reason, d.expected_impact, d.status, d.result, d.error,
  d.outcome, d.created_at, d.decided_at, u.name AS decided_by_name`;

export function createAdsRepo(db) {
  const one = async (sql, params, msg) => {
    const { rows } = await db.query(sql, params);
    if (!rows[0] && msg) throw notFound(msg);
    return rows[0];
  };

  return {
    getSettings: () => one('SELECT agent_enabled, autonomous, monthly_cap_ars, business_notes, updated_at FROM ad_settings WHERE id = 1'),
    async updateSettings(patch) {
      const cols = Object.keys(patch);
      if (!cols.length) return this.getSettings();
      const set = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      await db.query(`UPDATE ad_settings SET ${set}, updated_at = now() WHERE id = 1`, Object.values(patch));
      return this.getSettings();
    },

    startRun: (kind, userId) => one('INSERT INTO ad_runs (kind, started_by) VALUES ($1, $2) RETURNING *', [kind, userId ?? null]),
    finishRun: (id, { status, report = '', error = null }) => one(
      'UPDATE ad_runs SET status = $2, report = $3, error = $4, finished_at = now() WHERE id = $1 RETURNING *',
      [id, status, report, error],
    ),
    runningRun: () => one("SELECT * FROM ad_runs WHERE status = 'running' AND started_at > now() - interval '30 minutes' ORDER BY started_at DESC LIMIT 1"),
    async listRuns(limit = 10) {
      const { rows } = await db.query(
        'SELECT r.*, u.name AS started_by_name FROM ad_runs r LEFT JOIN users u ON u.id = r.started_by ORDER BY r.started_at DESC LIMIT $1',
        [limit],
      );
      return rows;
    },

    addDecision: (d) => one(
      `INSERT INTO ad_decisions (run_id, tool, input, title, reason, expected_impact, status, result, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [d.runId ?? null, d.tool, d.input ?? {}, d.title ?? '', d.reason ?? '', d.expectedImpact ?? '', d.status, d.result ?? null, d.error ?? null],
    ),
    getDecision: (id) => one(`SELECT ${DECISION_COLS} FROM ad_decisions d LEFT JOIN users u ON u.id = d.decided_by WHERE d.id = $1`, [id], 'No existe esa recomendación.'),
    async listDecisions({ status, limit = 50 } = {}) {
      const { rows } = await db.query(
        `SELECT ${DECISION_COLS} FROM ad_decisions d LEFT JOIN users u ON u.id = d.decided_by
         WHERE ($1::text IS NULL OR d.status = $1) ORDER BY d.created_at DESC LIMIT $2`,
        [status ?? null, limit],
      );
      return rows;
    },
    // Marca la decisión como tomada solo si seguía pendiente (evita doble aprobación)
    async claimPending(id, userId, status) {
      const { rows } = await db.query(
        "UPDATE ad_decisions SET status = $3, decided_by = $2, decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING *",
        [id, userId, status],
      );
      if (!rows[0]) {
        await this.getDecision(id);
        throw conflict('Esta recomendación ya fue resuelta.');
      }
      return rows[0];
    },
    setDecisionResult: (id, { status, result = null, error = null }) => one(
      'UPDATE ad_decisions SET status = $2, result = $3, error = $4 WHERE id = $1 RETURNING *', [id, status, result, error],
    ),
    recordOutcome: (id, outcome) => one('UPDATE ad_decisions SET outcome = $2 WHERE id = $1 RETURNING id', [id, outcome], 'No existe esa decisión.'),
    async executedWithoutOutcome(olderThanHours = 48) {
      const { rows } = await db.query(
        `SELECT id, tool, input, title, reason, created_at, decided_at FROM ad_decisions
         WHERE status = 'executed' AND outcome IS NULL AND coalesce(decided_at, created_at) < now() - make_interval(hours => $1)
         ORDER BY created_at LIMIT 20`,
        [olderThanHours],
      );
      return rows;
    },

    createCreative: (c, userId) => one(
      'INSERT INTO ad_creatives (name, copy, headline, notes, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [c.name, c.copy, c.headline ?? '', c.notes ?? '', userId],
    ),
    getCreative: (id) => one('SELECT * FROM ad_creatives WHERE id = $1', [id], 'No existe esa pieza.'),
    async updateCreative(id, patch) {
      const cols = Object.keys(patch);
      if (!cols.length) return this.getCreative(id);
      const set = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
      return one(`UPDATE ad_creatives SET ${set} WHERE id = $1 RETURNING *`, [id, ...Object.values(patch)], 'No existe esa pieza.');
    },
    markCreativeUsed: (id, adId, adsetId) => one(
      "UPDATE ad_creatives SET status = 'used', meta_ad_id = $2, meta_adset_id = $3, used_at = now() WHERE id = $1 RETURNING *",
      [id, adId, adsetId],
    ),
    async listCreatives({ status } = {}) {
      const { rows } = await db.query(
        `SELECT c.*,
           (SELECT f.id FROM files f WHERE f.owner_type = 'ad_feed' AND f.owner_id = c.id LIMIT 1) AS feed_file_id,
           (SELECT f.id FROM files f WHERE f.owner_type = 'ad_story' AND f.owner_id = c.id LIMIT 1) AS story_file_id
         FROM ad_creatives c WHERE ($1::text IS NULL OR c.status = $1) ORDER BY c.created_at DESC`,
        [status ?? null],
      );
      return rows;
    },

    addRequest: (r) => one('INSERT INTO ad_creative_requests (concept, style_notes, reason) VALUES ($1, $2, $3) RETURNING *', [r.concept, r.styleNotes ?? '', r.reason ?? '']),
    async listRequests({ status = 'open' } = {}) {
      const { rows } = await db.query('SELECT * FROM ad_creative_requests WHERE status = $1 ORDER BY created_at DESC LIMIT 50', [status]);
      return rows;
    },
    closeRequest: (id) => one("UPDATE ad_creative_requests SET status = 'done', closed_at = now() WHERE id = $1 RETURNING *", [id], 'No existe ese pedido.'),

    async upsertLearning({ learning_id: id, text, evidence, status = 'active' }) {
      if (id) {
        return one('UPDATE ad_learnings SET text = $2, evidence = $3, status = $4, updated_at = now() WHERE id = $1 RETURNING *',
          [id, text, evidence ?? '', status], 'No existe ese aprendizaje.');
      }
      return one('INSERT INTO ad_learnings (text, evidence, status) VALUES ($1, $2, $3) RETURNING *', [text, evidence ?? '', status]);
    },
    async listLearnings({ activeOnly = false } = {}) {
      const { rows } = await db.query(
        `SELECT * FROM ad_learnings WHERE ($1::boolean = false OR status = 'active') ORDER BY updated_at DESC LIMIT 100`, [activeOnly],
      );
      return rows;
    },
    async deleteLearning(id) {
      const { rowCount } = await db.query('DELETE FROM ad_learnings WHERE id = $1', [id]);
      if (!rowCount) throw notFound('No existe ese aprendizaje.');
    },
  };
}
