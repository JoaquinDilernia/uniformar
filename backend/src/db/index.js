import pg from 'pg';

// DATE (oid 1082) como 'YYYY-MM-DD': si no, pg lo convierte a Date local y corre un día
pg.types.setTypeParser(1082, (v) => v);

// Interfaz común { query, exec, tx, close } — la misma que implementa el helper de tests con PGlite.
export function createPgDb(connectionString) {
  const ssl = /proxy\.rlwy\.net|sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({ connectionString, max: 5, ssl });
  return {
    query: (text, params) => pool.query(text, params),
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (t, p) => client.query(t, p) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
