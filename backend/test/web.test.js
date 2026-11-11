import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestContext } from './helpers/testApp.js';

let ctx, admin, viewer;
beforeAll(async () => {
  ctx = await createTestContext({ corsOrigin: 'https://panel.test' });
  ({ agent: admin } = await ctx.asUser({ template: 'admin', name: 'Sofi' }));
  ({ agent: viewer } = await ctx.asUser({ template: 'equipo', name: 'Santi' })); // web: view, sin borrar
});
afterAll(() => ctx.close());

const fromWeb = (path) => request(ctx.app).post(path).set('Origin', 'https://www.uniformar.ar').set('Content-Type', 'text/plain');

describe('presupuestos desde la web', () => {
  it('la web manda el formulario como text/plain desde otro dominio y queda en el panel', async () => {
    const res = await fromWeb('/api/public/web/quotes').send(JSON.stringify({
      name: 'Juan Pérez', company: 'Panadería Maná', phone: '11 5555-1234', rubro: 'Gastronomía', quantity: '40', message: 'Me interesa: Chaqueta de cocina',
    }));
    expect(res.status).toBe(201);
    expect(res.headers['access-control-allow-origin']).toBe('*');

    const { body } = await admin.get('/api/web/quotes');
    expect(body.quotes[0]).toMatchObject({ name: 'Juan Pérez', company: 'Panadería Maná', phone: '11 5555-1234', quantity: '40', status: 'new' });
    expect((await admin.get('/api/web/summary')).body.new_quotes).toBe(1);
  });

  it('valida el nombre y descarta en silencio a los bots (campo trampa)', async () => {
    expect((await fromWeb('/api/public/web/quotes').send(JSON.stringify({ name: '' }))).status).toBe(400);
    expect((await fromWeb('/api/public/web/quotes').send(JSON.stringify({ name: 'Bot', website: 'http://spam' }))).status).toBe(201);
    const { body } = await admin.get('/api/web/quotes');
    expect(body.quotes.map((q) => q.name)).not.toContain('Bot');
  });

  it('el equipo marca el presupuesto como contactado; con permiso de ver no puede', async () => {
    const { body } = await admin.get('/api/web/quotes');
    const quoteId = body.quotes[0].id;
    expect((await viewer.patch(`/api/web/quotes/${quoteId}`).send({ status: 'contacted' })).status).toBe(403);
    const res = await admin.patch(`/api/web/quotes/${quoteId}`).send({ status: 'contacted', note: 'Le mandamos boceto' });
    expect(res.body.quote).toMatchObject({ status: 'contacted', note: 'Le mandamos boceto' });
    expect((await viewer.get('/api/web/quotes?status=contacted')).body.quotes).toHaveLength(1);
  });

  it('sin sesión no se ven los presupuestos', async () => {
    expect((await request(ctx.app).get('/api/web/quotes')).status).toBe(401);
  });
});

describe('reseñas', () => {
  let reviewId;
  it('una reseña nueva no se publica hasta que la aprueban', async () => {
    const res = await fromWeb('/api/public/web/reviews').send(JSON.stringify({
      name: 'Laura', company: 'Grupo B', rating: 5, text: 'Excelente calidad y llegaron antes de lo pactado.',
    }));
    expect(res.status).toBe(201);
    expect((await request(ctx.app).get('/api/public/web/reviews')).body.reviews).toHaveLength(0);

    const { body } = await admin.get('/api/web/reviews?status=pending');
    expect(body.reviews).toHaveLength(1);
    reviewId = body.reviews[0].id;
  });

  it('rechaza puntajes fuera de 1 a 5 y textos muy cortos', async () => {
    expect((await fromWeb('/api/public/web/reviews').send(JSON.stringify({ name: 'X', rating: 9, text: 'Muy buenos todos' }))).status).toBe(400);
    expect((await fromWeb('/api/public/web/reviews').send(JSON.stringify({ name: 'X', rating: 4, text: 'ok' }))).status).toBe(400);
  });

  it('al aprobarla aparece en la web, sin datos internos', async () => {
    expect((await viewer.patch(`/api/web/reviews/${reviewId}`).send({ status: 'approved' })).status).toBe(403);
    await admin.patch(`/api/web/reviews/${reviewId}`).send({ status: 'approved' });
    const { body } = await request(ctx.app).get('/api/public/web/reviews');
    expect(body.reviews).toEqual([expect.objectContaining({ name: 'Laura', company: 'Grupo B', rating: 5 })]);
    expect(body.reviews[0]).not.toHaveProperty('reviewed_by');
    expect(body.reviews[0]).not.toHaveProperty('status');
  });

  it('borrar requiere permiso de borrar', async () => {
    expect((await viewer.delete(`/api/web/reviews/${reviewId}`)).status).toBe(403);
    expect((await admin.delete(`/api/web/reviews/${reviewId}`)).status).toBe(204);
    expect((await request(ctx.app).get('/api/public/web/reviews')).body.reviews).toHaveLength(0);
  });
});
