import { buildInsert } from '../../src/lib/sql.js';

export const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
export const PDF_MIN = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function insert(db, table, values) {
  const { text, params } = buildInsert(table, values);
  const { rows } = await db.query(text, params);
  return rows[0];
}

export const insertIdea = (db, o = {}) => insert(db, 'ideas', { kind: 'idea', format: 'video', category: 'domingo', text: 'Idea de prueba', ...o });
export const insertProject = (db, o = {}) => insert(db, 'projects', { name: 'Proyecto de prueba', status: 'active', ...o });
export const insertCalendarItem = (db, o = {}) => insert(db, 'calendar_items', { date: '2026-10-07', title: 'Pieza', ...o });
