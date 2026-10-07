import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { AppError, forbidden } from '../src/lib/errors.js';
import { parse, optionalUrl, dateStr } from '../src/lib/validate.js';

function appWith(routes) {
  const api = Router();
  routes(api);
  return createApp({ apiRouter: api });
}

describe('app base', () => {
  it('/health responde ok', async () => {
    const res = await request(createApp({ health: async () => ({ db: true }) })).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it('/health con fallo → 503 genérico sin filtrar detalles', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(createApp({ health: async () => { throw new Error('postgres://user:pass@host'); } })).get('/health');
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, error: 'db no disponible' });
  });

  it('ruta /api inexistente → 404 con formato de error', async () => {
    const res = await request(appWith(() => {})).get('/api/nada');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('AppError lanzado en handler async → status y code', async () => {
    const app = appWith((r) => r.get('/x', async () => { throw forbidden('No tenés permiso para editar Proyectos'); }));
    const res = await request(app).get('/api/x');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'No tenés permiso para editar Proyectos' } });
  });

  it('ZodError → 400 VALIDATION con fields en español', async () => {
    const schema = z.object({ text: z.string().min(1, 'Escribí la idea'), link: optionalUrl, fecha: dateStr.nullish() });
    const app = appWith((r) => r.post('/x', (req, res) => res.json(parse(schema, req.body))));
    const bad = await request(app).post('/api/x').send({ text: '', link: 'no-es-link', fecha: '07/10/2026' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION');
    expect(bad.body.error.fields).toEqual({ text: 'Escribí la idea', link: 'Link inválido', fecha: 'Fecha inválida' });
    const ok = await request(app).post('/api/x').send({ text: 'hola', link: '  ' });
    expect(ok.body).toEqual({ text: 'hola', link: null });
  });

  it('JSON mal formado → 400', async () => {
    const app = appWith((r) => r.post('/x', (req, res) => res.json(req.body)));
    const res = await request(app).post('/api/x').set('Content-Type', 'application/json').send('{mal');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('error desconocido → 500 INTERNAL sin filtrar detalles', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = appWith((r) => r.get('/x', async () => { throw new Error('secreto interno'); }));
    const res = await request(app).get('/api/x');
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.message).not.toContain('secreto');
  });

  it('AppError es instancia de Error', () => {
    expect(new AppError(400, 'X', 'y')).toBeInstanceOf(Error);
  });
});
