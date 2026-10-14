import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { AgentQuestions } from './Questions.jsx';

const open = [{ id: 'q1', question: '¿Se contestan los WhatsApp?', why: 'Para decidir entre conjuntos', quick_answers: ['Sí', 'No'], created_at: '2026-10-14T12:00:00Z' }];
const answered = [{ id: 'q0', question: '¿Hay stock de chaquetas?', answer: 'Sí, 200', answered_by_name: 'Sofi', answered_at: '2026-10-13T12:00:00Z', quick_answers: [] }];
const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

const renderIt = (canEdit) => render(
  <QueryClientProvider client={createQueryClient()}><ConfirmProvider><AgentQuestions canEdit={canEdit} /></ConfirmProvider></QueryClientProvider>,
);

describe('Preguntas del agente', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/ads/questions?status=open') return json({ questions: open });
      if (url === '/api/ads/questions?status=answered') return json({ questions: answered });
      if (url === '/api/ads/questions/q1/answer' && opts.method === 'POST') return json({ question: { ...open[0], status: 'answered' }, run: { id: 'r1' }, note: null });
      return json({});
    });
  });

  it('la respuesta rápida completa el campo y "Guardar y analizar ahora" manda analyze', async () => {
    renderIt(true);
    expect(await screen.findByText('¿Se contestan los WhatsApp?')).toBeInTheDocument();
    expect(screen.getByText('Para decidir entre conjuntos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sí' }));
    expect(screen.getByLabelText('Tu respuesta')).toHaveValue('Sí');
    await userEvent.type(screen.getByLabelText('Tu respuesta'), ', 6 eran empresas');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y analizar ahora' }));
    const post = fetch.mock.calls.find(([u, o]) => u === '/api/ads/questions/q1/answer' && o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ answer: 'Sí, 6 eran empresas', analyze: true });
  });

  it('sin permiso de edición solo se lee', async () => {
    renderIt(false);
    expect(await screen.findByText('¿Se contestan los WhatsApp?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tu respuesta')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('muestra las respondidas plegadas', async () => {
    renderIt(true);
    await userEvent.click(await screen.findByRole('button', { name: /Respondidas/ }));
    expect(screen.getByText('Sí, 200')).toBeInTheDocument();
  });
});
