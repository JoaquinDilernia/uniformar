import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createQueryClient } from '../../api/queryClient.js';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { AuthProvider } from '../../state/auth.jsx';
import { WebPage, waLink } from './WebPage.jsx';

const quote = { id: 'q1', name: 'Juan Pérez', company: 'Panadería Maná', phone: '11 5555-1234', rubro: 'Gastronomía', quantity: '40', message: 'Me interesa: Chaqueta de cocina', status: 'new', note: '', created_at: '2026-11-11T12:00:00Z' };
const review = { id: 'r1', name: 'Laura', company: 'Grupo B', rating: 4, text: 'Muy buena calidad y cumplieron los plazos.', status: 'pending', created_at: '2026-11-11T12:00:00Z' };
const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

function mockApi(permissions) {
  global.fetch = vi.fn((url, opts = {}) => {
    if (url === '/api/auth/me') return json({ user: { id: 'u1', name: 'Sofi', permissions, can_delete: false } });
    if (url === '/api/web/summary') return json({ new_quotes: 1, pending_reviews: 1 });
    if (url === '/api/web/quotes?status=new') return json({ quotes: [quote] });
    if (url === '/api/web/reviews?status=pending') return json({ reviews: [review] });
    if (url === '/api/web/quotes/q1' && opts.method === 'PATCH') return json({ quote: { ...quote, ...JSON.parse(opts.body) } });
    if (url === '/api/web/reviews/r1' && opts.method === 'PATCH') return json({ review: { ...review, ...JSON.parse(opts.body) } });
    return json({});
  });
}

const renderIt = () => render(
  <MemoryRouter><QueryClientProvider client={createQueryClient()}><AuthProvider><ConfirmProvider><WebPage /></ConfirmProvider></AuthProvider></QueryClientProvider></MemoryRouter>,
);

describe('Admin web', () => {
  beforeEach(() => mockApi({ web: 'edit' }));

  it('muestra los presupuestos nuevos con su WhatsApp y permite cambiar el estado', async () => {
    renderIt();
    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('Me interesa: Chaqueta de cocina')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/5491155551234');
    await userEvent.selectOptions(screen.getByLabelText('Estado del pedido'), 'contacted');
    const patch = fetch.mock.calls.find(([u, o]) => u === '/api/web/quotes/q1' && o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toEqual({ status: 'contacted' });
  });

  it('aprobar una reseña la publica', async () => {
    renderIt();
    await userEvent.click(await screen.findByRole('radio', { name: /Reseñas/ }));
    const card = (await screen.findByText('Laura')).closest('article');
    expect(within(card).getByRole('img', { name: '4 de 5 estrellas' })).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Aprobar y publicar' }));
    const patch = fetch.mock.calls.find(([u, o]) => u === '/api/web/reviews/r1' && o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toEqual({ status: 'approved' });
  });

  it('con permiso de ver no aparecen las acciones', async () => {
    mockApi({ web: 'view' });
    renderIt();
    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.queryByLabelText('Estado del pedido')).not.toBeInTheDocument();
  });
});

describe('waLink', () => {
  it('arma el link con 549 para celulares de Argentina', () => {
    expect(waLink('11 5555-1234')).toBe('https://wa.me/5491155551234');
    expect(waLink('011 15 5555-1234')).toBe('https://wa.me/5491155551234');
    expect(waLink('+54 9 351 555-1234')).toBe('https://wa.me/5493515551234');
    expect(waLink('123')).toBeNull();
  });
});
