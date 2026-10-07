import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sizeOf from 'image-size';
import { AppError, badRequest, notFound } from '../lib/errors.js';

export const OWNER_TYPES = {
  idea_ref: { table: 'ideas', section: 'ideas', kind: 'image', max: 20 },
  idea_result: { table: 'ideas', section: 'ideas', kind: 'image', max: 20 },
  calendar_preview: { table: 'calendar_items', section: 'calendar', kind: 'image', max: 10 },
  project_photo: { table: 'projects', section: 'projects', kind: 'image', max: 50 },
  project_pdf: { table: 'projects', section: 'projects', kind: 'pdf', max: 20 },
};
export const LIMITS = { image: 2 * 1024 * 1024, pdf: 10 * 1024 * 1024 };
const ACCEPTED = { image: ['image/webp', 'image/jpeg', 'image/png'], pdf: ['application/pdf'] };
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

export function createFilesService({ db, storage }) {
  async function toDTO(rows) {
    return Promise.all(rows.map(async (f) => ({
      id: f.id, owner_type: f.owner_type, owner_id: f.owner_id, kind: f.kind, mime: f.mime, bytes: f.bytes,
      width: f.width, height: f.height, original_name: f.original_name, sort: f.sort, created_at: f.created_at,
      url: await storage.urlFor(f),
    })));
  }

  async function listFor(ownerTypes, ownerIds) {
    if (!ownerIds.length) return [];
    const { rows } = await db.query(
      'SELECT * FROM files WHERE owner_type = ANY($1) AND owner_id = ANY($2) ORDER BY sort, created_at',
      [ownerTypes, ownerIds],
    );
    return toDTO(rows);
  }

  async function upload({ ownerType, ownerId, buffer, originalName, userId }) {
    const def = OWNER_TYPES[ownerType];
    if (!def) throw badRequest('Tipo de archivo inválido.');
    const { rows: owner } = await db.query(`SELECT id FROM ${def.table} WHERE id = $1`, [ownerId]);
    if (!owner[0]) throw notFound('No existe el elemento al que querés adjuntar el archivo.');

    const mime = (await fileTypeFromBuffer(buffer))?.mime;
    if (!mime || !ACCEPTED[def.kind].includes(mime)) {
      throw new AppError(415, 'UNSUPPORTED_FILE', def.kind === 'pdf' ? 'Solo se aceptan archivos PDF.' : 'Solo se aceptan imágenes JPG, PNG o WebP.');
    }
    if (buffer.length > LIMITS[def.kind]) {
      throw new AppError(413, 'FILE_TOO_LARGE', def.kind === 'pdf' ? 'El PDF pesa más de 10 MB.' : 'La imagen pesa más de 2 MB.');
    }
    const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM files WHERE owner_type = $1 AND owner_id = $2', [ownerType, ownerId]);
    if (n >= def.max) throw new AppError(409, 'TOO_MANY_FILES', `Máximo ${def.max} archivos acá.`);

    let width = null;
    let height = null;
    if (def.kind === 'image') {
      try {
        ({ width, height } = sizeOf(buffer));
      } catch {
        throw new AppError(415, 'UNSUPPORTED_FILE', 'No pudimos leer la imagen. Probá con otra.');
      }
    }

    const key = `${ownerType}/${ownerId}/${crypto.randomUUID()}.${EXT[mime]}`;
    await storage.put(key, buffer, mime);
    try {
      const { rows } = await db.query(
        `INSERT INTO files (owner_type, owner_id, kind, storage_key, mime, bytes, width, height, original_name, sort, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [ownerType, ownerId, def.kind, key, mime, buffer.length, width, height, String(originalName ?? '').slice(0, 200), n, userId],
      );
      return (await toDTO(rows))[0];
    } catch (err) {
      await purgeKeys([key]);
      throw err;
    }
  }

  async function get(id) {
    const { rows } = await db.query('SELECT * FROM files WHERE id = $1', [id]);
    if (!rows[0]) throw notFound('No existe ese archivo.');
    return rows[0];
  }

  const read = (row) => storage.read(row.storage_key);

  async function purgeKeys(keys) {
    for (const key of keys) {
      try {
        await storage.remove(key);
      } catch (err) {
        console.error('[storage] no se pudo borrar', key, err.message);
        await db.query('INSERT INTO storage_deletions_pending (storage_key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
      }
    }
  }

  async function remove(id) {
    const { rows } = await db.query('DELETE FROM files WHERE id = $1 RETURNING storage_key', [id]);
    if (!rows[0]) throw notFound('No existe ese archivo.');
    await purgeKeys([rows[0].storage_key]);
  }

  // Dentro de la transacción del dueño: borra las filas y devuelve las claves para purgar después del commit
  async function removeOwnerRows(q, ownerTypes, ownerId) {
    const { rows } = await q.query('DELETE FROM files WHERE owner_type = ANY($1) AND owner_id = $2 RETURNING storage_key', [ownerTypes, ownerId]);
    return rows.map((r) => r.storage_key);
  }

  async function retryPending() {
    const { rows } = await db.query('SELECT storage_key FROM storage_deletions_pending WHERE attempts < 20 ORDER BY created_at LIMIT 200');
    let done = 0;
    for (const { storage_key: key } of rows) {
      try {
        await storage.remove(key);
        await db.query('DELETE FROM storage_deletions_pending WHERE storage_key = $1', [key]);
        done++;
      } catch {
        await db.query('UPDATE storage_deletions_pending SET attempts = attempts + 1 WHERE storage_key = $1', [key]);
      }
    }
    return done;
  }

  async function reorder(ids) {
    const { rows } = await db.query('SELECT id, owner_type, owner_id FROM files WHERE id = ANY($1)', [ids]);
    if (rows.length !== ids.length) throw notFound('Algún archivo ya no existe.');
    const owners = new Set(rows.map((r) => `${r.owner_type}:${r.owner_id}`));
    if (owners.size !== 1) throw badRequest('Solo se pueden reordenar archivos del mismo lugar.');
    await db.tx(async (q) => {
      for (const [i, id] of ids.entries()) await q.query('UPDATE files SET sort = $2 WHERE id = $1', [id, i]);
    });
    return rows[0];
  }

  return { listFor, upload, get, read, remove, removeOwnerRows, purgeKeys, retryPending, reorder };
}
