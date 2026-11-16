import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { GoogleImages } from './GoogleImages.jsx';

const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const images = [{ id: 'g1', name: 'Camisa grafa', source_creative_id: 'c1', source_name: 'Camisa grafa', file: { url: '/f/1', width: 1080, height: 1350 } }];
const creatives = [
  { id: 'c1', name: 'Camisa grafa', status: 'used', feed: { kind: 'image', url: '/f/a' } },
  { id: 'c2', name: 'Chaqueta cocina', status: 'unused', feed: { kind: 'image', url: '/f/b' } },
  { id: 'c3', name: 'Reel obra', status: 'unused', feed: { kind: 'video', url: '/f/c' } },
];

describe('Pauta · Google · Imágenes', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/gads/images') return json({ images });
      if (url === '/api/ads/creatives') return json({ creatives });
      if (url === '/api/gads/images/from-creative/c2' && opts.method === 'POST') return json({ image: { id: 'g2' } });
      return json({});
    });
  });

  it('lista las imágenes con sus descargas y trae de Meta solo piezas con imagen que no están', async () => {
    render(<QueryClientProvider client={createQueryClient()}><GoogleImages canEdit /></QueryClientProvider>);
    expect(await screen.findByText('Camisa grafa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cuadrada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Horizontal' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Traer de Meta' }));
    expect(await screen.findByText('Chaqueta cocina')).toBeInTheDocument();
    expect(screen.queryByText('Reel obra')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ya está en Google' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Usar en Google' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/gads/images/from-creative/c2', expect.objectContaining({ method: 'POST' })));
  });
});
