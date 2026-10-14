import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { IgPosts } from './IgPosts.jsx';

const posts = [
  { id: 'm1', type: 'reel', caption: 'Equipo de Panadería Maná', thumbnail: 'https://t/1.jpg', permalink: 'https://ig/1', timestamp: '2026-10-10T10:00:00+0000', likes: 40, comments: 3, reach: 1200, promotedIn: [] },
  { id: 'm2', type: 'post', caption: 'Chaquetas', thumbnail: 'https://t/2.jpg', permalink: 'https://ig/2', timestamp: '2026-10-09T10:00:00+0000', likes: 12, comments: 0, reach: null, promotedIn: [{ adset_id: '901', adset_name: 'WPP_ABIERTO', ad_id: '5', created_at: '2026-10-11T10:00:00Z' }] },
];
const snapshot = { adsets: [{ id: '901', name: 'WPP_ABIERTO', effectiveStatus: 'ACTIVE' }, { id: '902', name: 'WPP_INTERESES', effectiveStatus: 'PAUSED' }] };
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const renderIt = (props = {}) => render(<QueryClientProvider client={createQueryClient()}><IgPosts snapshot={snapshot} canEdit {...props} /></QueryClientProvider>);

describe('Posts de Instagram', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/ads/ig-posts') return json({ posts });
      if (url === '/api/ads/ig-posts/m1/promote' && opts.method === 'POST') return json({ ok: true, ad_id: '9' });
      return json({});
    });
  });

  it('muestra tipo, métricas y dónde ya está promocionado', async () => {
    renderIt();
    const reel = (await screen.findByText('Equipo de Panadería Maná')).closest('article');
    expect(within(reel).getByText('Reel')).toBeInTheDocument();
    expect(within(reel).getByText(/40 me gusta/)).toBeInTheDocument();
    expect(within(reel).getByText(/1\.200 de alcance/)).toBeInTheDocument();
    const post = screen.getByText('Chaquetas').closest('article');
    expect(within(post).getByText('Promocionado en WPP_ABIERTO')).toBeInTheDocument();
  });

  it('promocionar manda el conjunto elegido', async () => {
    renderIt();
    const reel = (await screen.findByText('Equipo de Panadería Maná')).closest('article');
    await userEvent.click(within(reel).getByRole('button', { name: 'Promocionar' }));
    await userEvent.selectOptions(screen.getByLabelText('Conjunto'), '902');
    await userEvent.click(screen.getByRole('button', { name: 'Promocionar en Meta' }));
    const call = fetch.mock.calls.find(([u, o]) => u === '/api/ads/ig-posts/m1/promote' && o?.method === 'POST');
    expect(JSON.parse(call[1].body)).toEqual({ adset_id: '902', adset_name: 'WPP_INTERESES', permalink: 'https://ig/1' });
  });

  it('si Instagram falla, muestra el motivo', async () => {
    fetch.mockImplementation(() => json({ error: { code: 'META_ERROR', message: 'Instagram no respondió: sin acceso' } }, 502));
    renderIt();
    expect(await screen.findByText(/Instagram no respondió: sin acceso/)).toBeInTheDocument();
  });
});
