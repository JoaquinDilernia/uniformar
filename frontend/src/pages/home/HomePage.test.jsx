import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { AuthProvider } from '../../state/auth.jsx';
import { HomePage } from './HomePage.jsx';

const me = { id: 'santi', name: 'Santi Pérez', can_delete: false, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'none' } };
const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map((date, i) => ({
  date, weekday: (i + 1) % 7, rules: i === 4 ? [{ theme: 'Cliente real' }] : [], items: i === 4 ? [{ id: 'c1', title: 'Reel POSTA', status: 'ready' }] : [], state: i === 4 ? 'ready' : 'empty',
}));
const home = {
  week: { start: '2026-10-05', end: '2026-10-11', days },
  counters: { new_ideas_week: 3, to_decide: 2, done_week: 1, active_projects: 2 },
  mine: { to_decide: [{ id: 'i1', text: 'Reel humor delantal', status: 'por_decidir', format: 'video' }], to_do: [], tasks: [] },
  to_decide: [{ id: 'i1', text: 'Reel humor delantal', status: 'por_decidir', format: 'video' }, { id: 'i2', text: 'Otra', status: 'por_decidir', format: 'photo' }],
  recently_done: [],
  pending_by_user: [{ user: { id: 'bauti', name: 'Bauti', avatar_color: '#366497' }, ideas: [], tasks: [{ id: 't1', text: 'Duplicar conjunto', project_id: 'p1', project_name: 'Meta Ads' }] }],
  projects: { active: [{ id: 'p1', name: 'Meta Ads', task_total: 4, task_done: 1 }], proposals: [{ id: 'p2', name: 'LinkedIn' }], upcoming: [] },
};
const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('Inicio', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => (url === '/api/auth/me' ? json({ user: me }) : json(home)));
  });

  it('saluda, prioriza "Te toca decidir" y muestra semana, pendientes y proyectos', async () => {
    render(<QueryClientProvider client={createQueryClient()}><MemoryRouter><AuthProvider><HomePage /></AuthProvider></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: /Santi/ })).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toMatch(/Te toca decidir/);
    expect(screen.getAllByText('Reel humor delantal').length).toBeGreaterThan(0);
    expect(screen.getByText('Reel POSTA')).toBeInTheDocument();
    expect(screen.getByText('Duplicar conjunto')).toBeInTheDocument();
    expect(screen.getByText('Meta Ads', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Agente de pauta')).toBeInTheDocument();
    expect(screen.queryByText('Admin web')).not.toBeInTheDocument(); // sin permiso de web
    expect(screen.getByRole('button', { name: /¿Cómo se usa\?/ })).toHaveAttribute('aria-expanded', 'false');
  });
});
