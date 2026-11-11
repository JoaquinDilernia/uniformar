import express, { Router } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { requirePermission, requireFlag } from '../services/permissions.js';

const text = (max) => z.string().trim().max(max).default('');
const required = (max) => z.string().trim().min(1).max(max);

const quoteSchema = z.object({
  name: required(120),
  company: text(160),
  phone: text(40),
  rubro: text(80),
  quantity: text(40),
  message: text(2000),
  source: text(200),
  website: z.string().optional(), // trampa para bots: un humano nunca lo completa
});

const reviewSchema = z.object({
  name: required(80),
  company: text(120),
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().min(10, 'Contanos un poco más (mínimo 10 caracteres)').max(1000),
  website: z.string().optional(),
});

// El formulario de la web manda text/plain para no disparar el preflight de CORS desde otro dominio
function body(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

// Rutas públicas que usa la web (sin sesión), con CORS abierto y límite por IP
export function createPublicWebRouter({ webRepo, limit = 8 }) {
  const r = Router();
  r.use('/public/web', cors({ origin: '*', methods: ['GET', 'POST'] }));
  r.use('/public/web', express.text({ type: 'text/plain', limit: '20kb' }));
  const writeLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Recibimos muchos envíos seguidos. Probá de nuevo más tarde o escribinos por WhatsApp.' } } });

  r.post('/public/web/quotes', writeLimit, async (req, res) => {
    const q = parse(quoteSchema, body(req));
    if (q.website) return res.status(201).json({ ok: true });
    await webRepo.addQuote(q);
    res.status(201).json({ ok: true });
  });

  r.post('/public/web/reviews', writeLimit, async (req, res) => {
    const rv = parse(reviewSchema, body(req));
    if (rv.website) return res.status(201).json({ ok: true });
    await webRepo.addReview(rv);
    res.status(201).json({ ok: true });
  });

  r.get('/public/web/reviews', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ reviews: await webRepo.publicReviews() });
  });

  return r;
}

const id = z.object({ id: z.string().uuid() });

// Panel: sección "Admin web"
export function createWebRouter({ webRepo }) {
  const r = Router();

  r.get('/web/summary', requirePermission('web', 'view'), async (_req, res) => {
    res.json(await webRepo.counters());
  });

  r.get('/web/quotes', requirePermission('web', 'view'), async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['new', 'contacted', 'won', 'lost']).optional() }), req.query);
    res.json({ quotes: await webRepo.listQuotes({ status }) });
  });

  r.patch('/web/quotes/:id', requirePermission('web', 'edit'), async (req, res) => {
    const { id: quoteId } = parse(id, req.params);
    const patch = parse(z.object({ status: z.enum(['new', 'contacted', 'won', 'lost']).optional(), note: z.string().max(2000).optional() }), req.body);
    res.json({ quote: await webRepo.updateQuote(quoteId, patch, req.user.id) });
  });

  r.get('/web/reviews', requirePermission('web', 'view'), async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }), req.query);
    res.json({ reviews: await webRepo.listReviews({ status }) });
  });

  r.patch('/web/reviews/:id', requirePermission('web', 'edit'), async (req, res) => {
    const { id: reviewId } = parse(id, req.params);
    const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'rejected']) }), req.body);
    res.json({ review: await webRepo.setReviewStatus(reviewId, status, req.user.id) });
  });

  r.delete('/web/reviews/:id', requirePermission('web', 'edit'), requireFlag('can_delete'), async (req, res) => {
    const { id: reviewId } = parse(id, req.params);
    await webRepo.deleteReview(reviewId);
    res.status(204).end();
  });

  return r;
}
