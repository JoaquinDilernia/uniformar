import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { PublishMedia, PublishStatus } from './PublishPanel.jsx';

const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const base = {
  id: 'i1', date: '2026-10-26', channels: ['ig_reel', 'ig_post', 'tiktok'], status: 'ready', publish_time: '18:30', publications: [],
  media: [
    { id: 'f1', kind: 'video', url: 'https://r2.test/a.mp4' },
    { id: 'f2', kind: 'image', url: 'https://r2.test/b.jpg' },
  ],
};
const wrap = (ui) => render(<QueryClientProvider client={createQueryClient()}><ConfirmProvider>{ui}</ConfirmProvider></QueryClientProvider>);

describe('Publicación en Instagram', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/calendar/publishing') return json({ instagram: true });
      if (url === '/api/calendar/i1/publish' && opts.method === 'POST') return json({ item: base }, 202);
      if (url === '/api/files/order' && opts.method === 'PATCH') return json({ ok: true });
      return json({});
    });
  });

  it('muestra cuándo se publica cada canal de IG (TikTok no) y publica ahora con confirmación', async () => {
    wrap(<PublishStatus item={base} canEdit />);
    expect(screen.getAllByText(/Se publica solo el .* a las 18:30 h/)).toHaveLength(2);
    expect(screen.queryByText('TikTok')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar ahora' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Se publica en Post IG, Reel IG');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    await vi.waitFor(() => expect(global.fetch.mock.calls.some(([u, o]) => u === '/api/calendar/i1/publish' && o.method === 'POST')).toBe(true));
  });

  it('publicado con link, fallado con el error y "Reintentar"', async () => {
    const item = {
      ...base,
      publications: [
        { channel: 'ig_reel', status: 'published', permalink: 'https://instagram.com/p/x' },
        { channel: 'ig_post', status: 'failed', error: 'Meta 9004: no se pudo descargar la imagen' },
      ],
    };
    wrap(<PublishStatus item={item} canEdit />);
    expect(screen.getByRole('link', { name: 'ver' })).toHaveAttribute('href', 'https://instagram.com/p/x');
    expect(screen.getByText(/Falló: Meta 9004/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('sin hora o sin "lista" explica cómo programarla; sin edición no hay botón', async () => {
    wrap(<PublishStatus item={{ ...base, status: 'draft' }} canEdit={false} />);
    expect(screen.getAllByText(/poné la hora y marcala como “Listo para publicar”/)).toHaveLength(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('los archivos se muestran numerados y se pueden reordenar', async () => {
    wrap(<PublishMedia item={base} canEdit canDelete />);
    expect(screen.getByText('1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mover después' }));
    const call = global.fetch.mock.calls.find(([u]) => u === '/api/files/order');
    expect(JSON.parse(call[1].body)).toEqual({ ids: ['f2', 'f1'] });
  });
});
