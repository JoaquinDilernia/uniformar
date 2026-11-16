import sharp from 'sharp';
import { AppError, notFound } from '../lib/errors.js';

// Biblioteca de imágenes para Google: cada una es una fila en gads_images con su archivo (owner_type gads_image).
// Se cargan desde el panel o se copian de una pieza de Meta (solo imágenes; Google Búsqueda no lleva video).
const SHAPES = { cuadrada: [1200, 1200], horizontal: [1200, 628] };

export function createGoogleImages({ db, files }) {
  async function withFiles(rows) {
    const media = await files.listFor(['gads_image'], rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, file: media.find((f) => f.owner_id === r.id) ?? null }));
  }

  return {
    async list({ includeArchived = false } = {}) {
      const { rows } = await db.query(
        `SELECT i.*, c.name AS source_name FROM gads_images i LEFT JOIN ad_creatives c ON c.id = i.source_creative_id
         WHERE ($1::boolean OR i.status = 'active') ORDER BY i.created_at DESC`,
        [includeArchived],
      );
      return withFiles(rows);
    },
    async create(name, userId, sourceCreativeId = null) {
      const { rows } = await db.query(
        'INSERT INTO gads_images (name, created_by, source_creative_id) VALUES ($1, $2, $3) RETURNING *',
        [String(name).trim().slice(0, 120) || 'Imagen', userId ?? null, sourceCreativeId],
      );
      return rows[0];
    },
    async archive(id) {
      const { rows } = await db.query("UPDATE gads_images SET status = 'archived' WHERE id = $1 RETURNING *", [id]);
      if (!rows[0]) throw notFound('No existe esa imagen.');
      return rows[0];
    },
    // Copia la imagen de una pieza de Meta a la biblioteca de Google (si ya estaba, devuelve la existente)
    async importFromCreative(creativeId, userId) {
      const { rows: [creative] } = await db.query('SELECT id, name FROM ad_creatives WHERE id = $1', [creativeId]);
      if (!creative) throw notFound('No existe esa pieza.');
      const { rows: [existing] } = await db.query("SELECT * FROM gads_images WHERE source_creative_id = $1 AND status = 'active'", [creativeId]);
      if (existing) return existing;
      const [feed] = await files.listFor(['ad_feed'], [creativeId]);
      const [story] = await files.listFor(['ad_story'], [creativeId]);
      const source = [feed, story].find((f) => f && f.kind === 'image');
      if (!source) throw new AppError(409, 'NOT_AN_IMAGE', 'Esa pieza es un video: en Google Búsqueda solo van imágenes.');
      const buffer = await files.read(await files.get(source.id));
      const row = await this.create(creative.name, userId, creativeId);
      try {
        await files.upload({ ownerType: 'gads_image', ownerId: row.id, buffer, originalName: source.original_name || `${creative.name}.jpg`, userId });
      } catch (err) {
        await db.query('DELETE FROM gads_images WHERE id = $1', [row.id]);
        throw err;
      }
      return row;
    },
    // Recorte listo para cargar a mano en Google Ads: cuadrado 1200×1200 o horizontal 1200×628 (1,91:1).
    // Sigue la zona con más detalle de la foto (sharp "attention"), no el centro a ciegas.
    async crop(id, shape) {
      const size = SHAPES[shape];
      if (!size) throw new AppError(400, 'BAD_REQUEST', 'Formato inválido.');
      const { rows: [r] } = await db.query('SELECT * FROM gads_images WHERE id = $1', [id]);
      if (!r) throw notFound('No existe esa imagen.');
      const [f] = await files.listFor(['gads_image'], [id]);
      if (!f) throw new AppError(409, 'NO_FILE', 'La imagen no tiene archivo.');
      const buffer = await files.read(await files.get(f.id));
      const out = await sharp(buffer).rotate().resize(size[0], size[1], { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      return { buffer: out, filename: `${r.name.replace(/[^\w\-áéíóúñ ]+/gi, '').trim() || 'imagen'} ${shape}.jpg` };
    },
  };
}
