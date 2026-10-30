import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { Chat } from './Chat.jsx';

const chat = { id: 'c1', title: '¿Pausamos AD1?', created_by_name: 'Marketing', updated_at: '2026-10-30T12:00:00Z', message_count: 2 };
const messages = [
  { id: 'm1', role: 'user', content: '¿Pausamos AD1?', author_name: 'Marketing', created_at: '2026-10-30T12:00:00Z', actions: [] },
  { id: 'm2', role: 'assistant', content: 'Sí, **gastó sin traer consultas**.', created_at: '2026-10-30T12:00:05Z',
    actions: [{ type: 'recommendation', id: 'd1', title: 'Pausar AD1' }] },
];
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const renderIt = (props = {}) => render(
  <QueryClientProvider client={createQueryClient()}><ConfirmProvider><Chat canEdit {...props} /></ConfirmProvider></QueryClientProvider>,
);

describe('Consultas al agente', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/ads/chats' && opts.method === 'POST') return json({ chat, messages }, 201);
      if (url === '/api/ads/chats') return json({ chats: [chat] });
      if (url === '/api/ads/chats/c1') return json({ chat, messages });
      return json({});
    });
  });

  it('lista las conversaciones y una consulta nueva abre la charla con lo que dejó el agente', async () => {
    const onGoToRecommendations = vi.fn();
    renderIt({ onGoToRecommendations });
    expect(await screen.findByRole('button', { name: /¿Pausamos AD1\?.*Marketing/ })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Tu consulta'), '¿Pausamos AD1?');
    await userEvent.click(screen.getByRole('button', { name: 'Preguntar' }));
    const post = fetch.mock.calls.find(([u, o]) => u === '/api/ads/chats' && o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ message: '¿Pausamos AD1?' });
    expect(await screen.findByText('gastó sin traer consultas')).toBeInTheDocument();
    expect(screen.getByText(/Recomendación pendiente: Pausar AD1/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver en Recomendaciones' }));
    expect(onGoToRecommendations).toHaveBeenCalled();
  });

  it('si la última consulta quedó sin respuesta, ofrece reintentar', async () => {
    let saved = [messages[0]];
    fetch.mockImplementation((url, opts = {}) => {
      if (url === '/api/ads/chats/c1/reply' && opts.method === 'POST') { saved = messages; return json({ chat, messages }); }
      if (url === '/api/ads/chats/c1') return json({ chat, messages: saved });
      return json({ chats: [chat] });
    });
    localStorage.setItem('uf:pref:ads-chat-open', JSON.stringify('c1'));
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(fetch.mock.calls.some(([u, o]) => u === '/api/ads/chats/c1/reply' && o?.method === 'POST')).toBe(true);
    expect(await screen.findByText(/Recomendación pendiente/)).toBeInTheDocument();
  });
});
