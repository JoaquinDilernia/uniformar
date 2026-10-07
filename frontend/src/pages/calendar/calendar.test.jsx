import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { AuthProvider } from '../../state/auth.jsx';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { DaySheet } from './DaySheet.jsx';
import { PreviewMockup } from './PreviewMockup.jsx';

const me = { id: 'u1', name: 'Sofi', can_delete: true, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'edit', web: 'edit' } };
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function wrap(ui) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter><AuthProvider><ConfirmProvider>{ui}</ConfirmProvider></AuthProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DaySheet', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: me });
      if (url === '/api/ideas') return json({ ideas: [] });
      if (url === '/api/calendar' && opts.method === 'POST') return json({ item: { id: 'n1', date: '2026-10-09', title: JSON.parse(opts.body).title, channels: JSON.parse(opts.body).channels, status: 'draft', previews: [] } }, 201);
      return json({});
    });
  });

  it('muestra la grilla fija y, sin piezas, abre el alta con los canales de la grilla', async () => {
    const rules = [{ weekday: 5, theme: 'Cliente real', format: 'Reel', channels: ['ig_reel', 'tiktok'], time: null, active: true }];
    wrap(<DaySheet date="2026-10-09" items={[]} rules={rules} rangeKey={['calendar', 'a', 'b']} onClose={() => {}} />);
    expect(await screen.findByText(/Cliente real · Reel · Reel IG \+ TikTok/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reel IG' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Post IG' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.type(screen.getByLabelText('¿Qué se sube?'), 'Reel entrega POSTA');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar pieza' }));
    const post = fetch.mock.calls.find(([u, o]) => u === '/api/calendar' && o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toMatchObject({ date: '2026-10-09', title: 'Reel entrega POSTA', channels: ['ig_reel', 'tiktok'], status: 'draft' });
  });
});

describe('DaySheet, grilla tardía', () => {
  it('si las reglas llegan después del montaje, el alta queda con los canales de la grilla', async () => {
    global.fetch = vi.fn((url) => (url === '/api/auth/me' ? json({ user: me }) : url === '/api/ideas' ? json({ ideas: [] }) : json({})));
    const client = createQueryClient();
    const tree = (rules, rulesReady) => (
      <QueryClientProvider client={client}>
        <MemoryRouter><AuthProvider><ConfirmProvider>
          <DaySheet date="2026-10-09" items={[]} rules={rules} rulesReady={rulesReady} onClose={() => {}} />
        </ConfirmProvider></AuthProvider></MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(tree([], false));
    await screen.findByText('Viernes 9 de octubre', { exact: false }).catch(() => {});
    expect(screen.queryByLabelText('¿Qué se sube?')).not.toBeInTheDocument();
    rerender(tree([{ weekday: 5, theme: 'Cliente real', format: 'Reel', channels: ['ig_reel', 'tiktok'], time: null, active: true }], true));
    expect(await screen.findByRole('button', { name: 'Reel IG' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'TikTok' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('PreviewMockup', () => {
  it('historia/reel → marco vertical; post → marco de feed con copy', () => {
    const files = [{ id: 'f1', url: '/x.png' }];
    const { container, rerender } = render(<PreviewMockup files={files} channels={['ig_story']} copy="Hola" />);
    expect(container.firstChild.className).toMatch(/mockStory/);
    rerender(<PreviewMockup files={files} channels={['ig_post']} copy={'Uniformá tu negocio\n#gastronomía'} />);
    expect(container.firstChild.className).toMatch(/mockFeed/);
    expect(screen.getByText(/Uniformá tu negocio/)).toBeInTheDocument();
  });
});
