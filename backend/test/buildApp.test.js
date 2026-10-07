import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDb } from './helpers/testDb.js';
import { buildApp } from '../src/buildApp.js';
import { createLocalStorage } from '../src/services/storage.js';

let db;
afterAll(() => db?.close());

describe('buildApp', () => {
  it('sirve el frontend y su fallback, sin tapar /api ni /health', async () => {
    db = await createTestDb();
    const staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uf-dist-'));
    await fs.writeFile(path.join(staticDir, 'index.html'), '<!doctype html><title>Uniform.ar</title>');
    const app = buildApp({ db, jwtSecret: 'x', storage: createLocalStorage({ dir: os.tmpdir() }), staticDir });
    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.text).toContain('Uniform.ar');
    expect(home.headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/cualquier/ruta')).text).toContain('Uniform.ar');
    expect((await request(app).get('/api/ideas')).status).toBe(401);
    expect((await request(app).get('/health')).body).toEqual({ ok: true, db: true });
    expect(app.locals.files).toBeDefined();
  });

  it('exige jwtSecret y storage', () => {
    expect(() => buildApp({ db, storage: {} })).toThrow('Falta jwtSecret');
    expect(() => buildApp({ db, jwtSecret: 'x' })).toThrow('Falta storage');
  });
});
