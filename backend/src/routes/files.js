import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { parse, uuid } from '../lib/validate.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { hasLevel, requireFlag, deniedMessage } from '../services/permissions.js';
import { OWNER_TYPES } from '../services/files.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const uploadSchema = z.object({ owner_type: z.enum(Object.keys(OWNER_TYPES)), owner_id: uuid });
const orderSchema = z.object({ ids: z.array(uuid).min(1).max(50) });
const videoSchema = z.object({
  owner_type: z.enum(Object.keys(OWNER_TYPES)), owner_id: uuid,
  mime: z.string().max(100), bytes: z.number().int().positive(), original_name: z.string().max(200).default(''),
});
const tokenSchema = z.object({ token: z.string().min(1).max(2000) });

function checkSection(user, ownerType, level) {
  const section = OWNER_TYPES[ownerType]?.section;
  if (!section) throw badRequest('Tipo de archivo inválido.');
  if (!hasLevel(user, section, level)) throw forbidden(deniedMessage(section, level));
}

// Subir puede pedir menos que editar (fotos del resultado de una idea: alcanza con "Decidir")
const uploadLevel = (ownerType) => OWNER_TYPES[ownerType]?.uploadLevel ?? 'edit';

// Sin sesión: links firmados y temporales para que Instagram descargue el archivo (storage local)
export function createPublicFilesRouter({ files }) {
  const r = Router();
  r.get('/public-files/:token/:name', async (req, res) => {
    const { row, path } = await files.resolvePublic(req.params.token);
    if (!path) throw badRequest('Este archivo no se sirve desde acá.');
    res.type(row.mime).sendFile(path);
  });
  return r;
}

export function createFilesRouter({ files }) {
  const r = Router();

  r.post('/files', upload.single('file'), async (req, res) => {
    const { owner_type, owner_id } = parse(uploadSchema, req.body);
    checkSection(req.user, owner_type, uploadLevel(owner_type));
    if (!req.file) throw badRequest('Elegí un archivo.', { file: 'Obligatorio' });
    const file = await files.upload({
      ownerType: owner_type, ownerId: owner_id, buffer: req.file.buffer, originalName: req.file.originalname, userId: req.user.id,
    });
    res.status(201).json({ file });
  });

  // Videos: el navegador pide un link, sube directo al storage y después confirma
  r.post('/files/upload-url', async (req, res) => {
    const body = parse(videoSchema, req.body);
    checkSection(req.user, body.owner_type, uploadLevel(body.owner_type));
    res.json(await files.prepareUpload({
      ownerType: body.owner_type, ownerId: body.owner_id, mime: body.mime, bytes: body.bytes, originalName: body.original_name, userId: req.user.id,
    }));
  });

  // Solo con storage local (desarrollo): recibe el video en streaming
  r.put('/files/local-upload/:token', async (req, res) => {
    await files.receiveLocalUpload(req.params.token, req);
    res.json({ ok: true });
  });

  r.post('/files/complete', async (req, res) => {
    const { token } = parse(tokenSchema, req.body);
    res.status(201).json({ file: await files.completeUpload(token, req.user.id) });
  });

  r.patch('/files/order', async (req, res) => {
    const { ids } = parse(orderSchema, req.body);
    const first = await files.get(ids[0]);
    checkSection(req.user, first.owner_type, 'edit');
    await files.reorder(ids);
    res.json({ ok: true });
  });

  r.get('/files/:id/raw', async (req, res) => {
    const file = await files.get(req.params.id);
    checkSection(req.user, file.owner_type, 'view');
    res.type(file.mime).set('Cache-Control', 'private, max-age=3600').send(await files.read(file));
  });

  r.delete('/files/:id', requireFlag('can_delete'), async (req, res) => {
    const file = await files.get(req.params.id);
    checkSection(req.user, file.owner_type, 'edit');
    await files.remove(file.id);
    res.json({ ok: true });
  });

  return r;
}
