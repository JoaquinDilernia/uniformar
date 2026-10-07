import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new AppError(400, 'VALIDATION', message, fields);
export const unauthenticated = (message = 'Tenés que iniciar sesión.') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'No tenés permiso para hacer esto.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'No se encontró lo que buscabas.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message) => new AppError(409, 'CONFLICT', message);

function send(res, status, code, message, fields) {
  res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return send(res, 400, 'VALIDATION', `Revisá los datos: ${Object.values(fields)[0]}`, fields);
  }
  if (err instanceof AppError) return send(res, err.status, err.code, err.message, err.fields);
  if (err?.code === 'LIMIT_FILE_SIZE') return send(res, 413, 'FILE_TOO_LARGE', 'El archivo es demasiado pesado.');
  if (err?.type === 'entity.parse.failed') return send(res, 400, 'VALIDATION', 'El formato de los datos no es válido.');
  if (err?.type === 'entity.too.large') return send(res, 413, 'TOO_LARGE', 'Los datos enviados son demasiado grandes.');
  if (err?.code === '22P02') return send(res, 404, 'NOT_FOUND', 'No se encontró lo que buscabas.'); // uuid mal formado
  console.error('[error]', err);
  return send(res, 500, 'INTERNAL', 'Error interno. Probá de nuevo en un momento.');
}
