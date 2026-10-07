import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { AuthProvider } from '../../state/auth.jsx';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { IdeasPage } from './IdeasPage.jsx';

const me = { id: 'u1', name: 'Santi', can_delete: false, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' } };
const ideas = [
  { id: 'a', kind: 'idea', format: 'video', category: 'domingo', status: 'por_decidir', decision: 'pending', text: 'Reel humor delantal', created_at: '2026-10-01T10:00:00Z', ref_count: 0 },
  { id: 'b', kind: 'must', format: 'photo', category: 'producto', status: 'si_o_si', decision: 'pending', text: 'Fotos catálogo', due_date: '2026-10-20', created_at: '2026-10-02T10:00:00Z', ref_count: 2 },
];
const detail = { ...ideas[0], ref_files: [], result_files: [], calendar_links: [], note_santi: null, note_sofi: 'Grabar con luz natural\nfondo blanco' };
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function renderAt(path) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ConfirmProvider>
            <Routes>
              <Route path="/ideas" element={<IdeasPage />} />
              <Route path="/ideas/:id" element={<IdeasPage />} />
            </Routes>
          </ConfirmProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('IdeasPage', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: me });
      if (url === '/api/ideas') return json({ ideas });
      if (url === '/api/ideas/a' && (!opts.method || opts.method === 'GET')) return json({ idea: detail });
      if (url === '/api/ideas/a/complete') return json({ error: { code: 'X', message: 'no debería llamarse' } }, 500);
      if (url === '/api/users/directory') return json({ users: [] });
      if (url === '/api/clients') return json({ clients: [] });
      return json({});
    });
  });

  it('grupos cerrados con contador; al abrir se ven las filas', async () => {
    renderAt('/ideas');
    const group = await screen.findByRole('button', { name: /Domingo · humor/ });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Reel humor delantal')).not.toBeInTheDocument();
    await userEvent.click(group);
    expect(screen.getByText('Reel humor delantal')).toBeInTheDocument();
  });

  it('filtro por formato deja solo el grupo que corresponde', async () => {
    renderAt('/ideas');
    await screen.findByRole('button', { name: /Domingo · humor/ });
    await userEvent.click(within(screen.getByRole('group', { name: 'Formato' })).getByRole('button', { name: 'Fotos' }));
    expect(screen.queryByRole('button', { name: /Domingo · humor/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /📌 Sí o sí/ })).toBeInTheDocument();
  });

  it('detalle: notas completas y acciones "Sí, la hago / No la hago"', async () => {
    renderAt('/ideas/a');
    expect(await screen.findByRole('button', { name: 'Sí, la hago' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No la hago' })).toBeInTheDocument();
    // getByDisplayValue colapsa los saltos de línea al comparar: se busca normalizado y se verifica el valor real completo
    const note = screen.getByDisplayValue('Grabar con luz natural fondo blanco');
    expect(note.value).toBe('Grabar con luz natural\nfondo blanco');
  });
});
