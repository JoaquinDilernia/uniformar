import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { fileTypeFromBuffer } from 'file-type';
import sizeOf from 'image-size';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors.js';

// Videos de piezas de pauta: se suben directo al storage (no pasan por la memoria del servidor)
const VIDEO_DEF = { accept: ['video/mp4', 'video/quicktime'], maxBytes: 200 * 1024 * 1024 };

export const OWNER_TYPES = {
  idea_ref: { table: 'ideas', section: 'ideas', kind: 'image', max: 20 },
  idea_result: { table: 'ideas', section: 'ideas', kind: 'image', max: 20, uploadLevel: 'decide' },
  calendar_preview: { table: 'calendar_items', section: 'calendar', kind: 'image', max: 10 },
  // Lo que se publica en Instagram: IG solo acepta imágenes JPG (hasta 8 MB); el navegador convierte el resto
  calendar_media: { table: 'calendar_items', section: 'calendar', kind: 'image', max: 10, accept: ['image/jpeg'], maxBytes: 8 * 1024 * 1024, video: VIDEO_DEF },
  project_photo: { table: 'projects', section: 'projects', kind: 'image', max: 50 },
  project_pdf: { table: 'projects', section: 'projects', kind: 'pdf', max: 20 },
  // Piezas de pauta: van tal cual a Meta, que no acepta WebP — solo JPG/PNG y sin comprimir
  ad_feed: { table: 'ad_creatives', section: 'ads', kind: 'image', max: 1, accept: ['image/jpeg', 'image/png'], maxBytes: 8 * 1024 * 1024, video: VIDEO_DEF },
  ad_story: { table: 'ad_creatives', section: 'ads', kind: 'image', max: 1, accept: ['image/jpeg', 'image/png'], maxBytes: 8 * 1024 * 1024, video: VIDEO_DEF },
};
export const LIMITS = { image: 2 * 1024 * 1024, pdf: 10 * 1024 * 1024 };
const ACCEPTED = { image: ['image/webp', 'image/jpeg', 'image/png'], pdf: ['application/pdf'] };
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

export function createFilesService({ db, storage, uploadSecret }) {
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
    if (!mime || !(def.accept ?? ACCEPTED[def.kind]).includes(mime)) {
      throw new AppError(415, 'UNSUPPORTED_FILE', def.kind === 'pdf' ? 'Solo se aceptan archivos PDF.'
        : def.accept ? `Solo se aceptan imágenes ${def.accept.map((m) => m.split('/')[1].replace('jpeg', 'JPG').toUpperCase()).join(' o ')}.`
          : 'Solo se aceptan imágenes JPG, PNG o WebP.');
    }
    const maxBytes = def.maxBytes ?? LIMITS[def.kind];
    if (buffer.length > maxBytes) {
      throw new AppError(413, 'FILE_TOO_LARGE', def.kind === 'pdf' ? 'El PDF pesa más de 10 MB.' : `La imagen pesa más de ${maxBytes / 1024 / 1024} MB.`);
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

  async function checkSlot(def, ownerType, ownerId) {
    const { rows: owner } = await db.query(`SELECT id FROM ${def.table} WHERE id = $1`, [ownerId]);
    if (!owner[0]) throw notFound('No existe el elemento al que querés adjuntar el archivo.');
    const { rows: [{ n }] } = await db.query('SELECT count(*)::int AS n FROM files WHERE owner_type = $1 AND owner_id = $2', [ownerType, ownerId]);
    if (n >= def.max) throw new AppError(409, 'TOO_MANY_FILES', `Máximo ${def.max} archivos acá.`);
    return n;
  }

  async function prepareUpload({ ownerType, ownerId, mime, bytes, originalName, userId }) {
    const def = OWNER_TYPES[ownerType];
    if (!def?.video) throw badRequest('Acá no se pueden subir videos.');
    if (!def.video.accept.includes(mime)) throw new AppError(415, 'UNSUPPORTED_FILE', 'Solo se aceptan videos MP4 o MOV.');
    if (bytes > def.video.maxBytes) throw new AppError(413, 'FILE_TOO_LARGE', `El video pesa más de ${def.video.maxBytes / 1024 / 1024} MB.`);
    await checkSlot(def, ownerType, ownerId);
    const key = `${ownerType}/${ownerId}/${crypto.randomUUID()}.${EXT[mime]}`;
    const token = jwt.sign(
      { p: 'upload', k: key, ot: ownerType, oi: ownerId, m: mime, b: bytes, n: String(originalName ?? '').slice(0, 200), u: userId },
      uploadSecret, { expiresIn: '30m' },
    );
    const uploadUrl = storage.driver === 's3' ? await storage.presignPut(key, mime, bytes) : `/api/files/local-upload/${token}`;
    return { upload_url: uploadUrl, token };
  }

  function verifyUploadToken(token) {
    try {
      const t = jwt.verify(token, uploadSecret, { algorithms: ['HS256'] });
      if (t.p !== 'upload') throw new Error('no es de subida');
      return t;
    } catch {
      throw badRequest('El permiso de subida venció o no es válido. Probá subir de nuevo.');
    }
  }

  async function receiveLocalUpload(token, stream) {
    if (storage.driver !== 'local') throw notFound();
    const t = verifyUploadToken(token);
    // Ya confirmado: el link no sirve para pisar el archivo con otros bytes
    const { rows: done } = await db.query('SELECT 1 FROM files WHERE storage_key = $1', [t.k]);
    if (done[0]) throw new AppError(409, 'CONFLICT', 'Este video ya se subió.');
    try {
      await storage.putStream(t.k, stream, t.b);
    } catch (err) {
      if (err.code === 'TOO_LARGE') throw new AppError(413, 'FILE_TOO_LARGE', 'El video es más grande de lo que se declaró.');
      throw err;
    }
  }

  async function completeUpload(token, userId) {
    const t = verifyUploadToken(token);
    if (t.u !== userId) throw forbidden('Este video lo empezó a subir otra persona.');
    // Idempotente: si ya se confirmó (reintento, doble clic) devuelve el mismo archivo
    const { rows: existing } = await db.query('SELECT * FROM files WHERE storage_key = $1', [t.k]);
    if (existing[0]) return (await toDTO(existing))[0];

    const def = OWNER_TYPES[t.ot];
    const head = await storage.head(t.k);
    if (!head) throw badRequest('No encontramos el video subido. Probá de nuevo.');
    // Nunca se borra un objeto que ya quedó registrado (lo pudo confirmar un reintento simultáneo)
    const reject = async (err) => {
      const { rows } = await db.query('SELECT 1 FROM files WHERE storage_key = $1', [t.k]);
      if (!rows[0]) await purgeKeys([t.k]);
      throw err;
    };
    if (head.bytes !== t.b) return reject(badRequest('El video no se subió completo. Probá de nuevo.'));
    const mime = (await fileTypeFromBuffer(await storage.readHead(t.k, 4100)))?.mime;
    if (!def.video.accept.includes(mime)) return reject(new AppError(415, 'UNSUPPORTED_FILE', 'El archivo no es un video MP4 o MOV.'));

    // Con el dueño bloqueado: dos confirmaciones a la vez no pueden pasar las dos el chequeo de cupo
    let row;
    try {
      row = await db.tx(async (q) => {
        const { rows: owner } = await q.query(`SELECT id FROM ${def.table} WHERE id = $1 FOR UPDATE`, [t.oi]);
        if (!owner[0]) throw notFound('No existe el elemento al que querés adjuntar el archivo.');
        const { rows: again } = await q.query('SELECT * FROM files WHERE storage_key = $1', [t.k]);
        if (again[0]) return again[0];
        const { rows: [{ n }] } = await q.query('SELECT count(*)::int AS n FROM files WHERE owner_type = $1 AND owner_id = $2', [t.ot, t.oi]);
        if (n >= def.max) throw new AppError(409, 'TOO_MANY_FILES', `Máximo ${def.max} archivos acá.`);
        const { rows } = await q.query(
          `INSERT INTO files (owner_type, owner_id, kind, storage_key, mime, bytes, original_name, sort, uploaded_by)
           VALUES ($1, $2, 'video', $3, $4, $5, $6, $7, $8) RETURNING *`,
          [t.ot, t.oi, t.k, mime, head.bytes, t.n, n, userId],
        );
        return rows[0];
      });
    } catch (err) {
      return reject(err);
    }
    return (await toDTO([row]))[0];
  }

  return { listFor, upload, get, read, remove, removeOwnerRows, purgeKeys, retryPending, reorder, prepareUpload, receiveLocalUpload, completeUpload };
}
