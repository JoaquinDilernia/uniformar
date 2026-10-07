import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../api/queryClient.js';
import { AuthProvider } from '../../state/auth.jsx';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog.jsx';
import { ProjectsPage } from './ProjectsPage.jsx';
import { ProjectDetail } from './ProjectDetail.jsx';

const me = { id: 'u1', name: 'Sofi', can_delete: false, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'view', web: 'view' } };
const projects = [
  { id: 'p1', name: 'Rediseño de la web', status: 'active', task_total: 4, task_done: 1, start_date: '2026-10-01', end_date: null },
  { id: 'p2', name: 'LinkedIn', status: 'proposal', task_total: 0, task_done: 0 },
];
const detail = {
  ...projects[0], goal_text: 'Web nueva:\n- rubros\n- catálogo', doing_text: '', how_text: '',
  tasks: [{ id: 't1', text: 'Brief al diseñador', done: false, due_date: '2026-10-20', assignee_ids: ['u1'] }],
  updates: [{ id: 'n1', body: 'Primera reunión ✅', author_id: 'u2', author_name: 'Bauti', created_at: '2026-10-06T12:00:00Z' }],
  photos: [], pdfs: [],
};
const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function renderAt(path) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider><ConfirmProvider>
          <Routes>
            <Route path="/proyectos" element={<ProjectsPage />} />
            <Route path="/proyectos/:id" element={<ProjectDetail />} />
          </Routes>
        </ConfirmProvider></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('proyectos', () => {
  let taskPatch;
  beforeEach(() => {
    taskPatch = {};
    localStorage.clear();
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: me });
      if (url === '/api/projects') return json({ projects });
      if (url === '/api/projects/p1' && (!opts.method || opts.method === 'GET')) return json({ project: { ...detail, tasks: [{ ...detail.tasks[0], ...taskPatch }] } });
      if (url === '/api/users/directory') return json({ users: [{ id: 'u1', name: 'Sofi', avatar_color: '#775D66' }, { id: 'u2', name: 'Bauti', avatar_color: '#366497' }] });
      if (url === '/api/tasks/t1' && opts.method === 'PATCH') { taskPatch = { ...taskPatch, ...JSON.parse(opts.body) }; return json({ task: { ...detail.tasks[0], ...JSON.parse(opts.body) } }); }
      return json({});
    });
  });

  it('pestañas separan activos y propuestas', async () => {
    renderAt('/proyectos');
    expect(await screen.findByText('Rediseño de la web')).toBeInTheDocument();
    expect(screen.queryByText('LinkedIn')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Propuestas/ }));
    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
  });

  it('detalle: textos completos, tarea se tilda al instante y se guarda', async () => {
    renderAt('/proyectos/p1');
    expect(await screen.findByText((_, el) => el?.textContent === 'Web nueva:\n- rubros\n- catálogo')).toBeInTheDocument();
    const box = screen.getByRole('checkbox', { name: 'Brief al diseñador' });
    await userEvent.click(box);
    expect(box).toBeChecked();
    const patch = fetch.mock.calls.find(([u, o]) => u === '/api/tasks/t1' && o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toEqual({ done: true });
    expect(within(screen.getByRole('region', { name: 'Novedades' })).getByText('Primera reunión ✅')).toBeInTheDocument();
  });

  it('agregar tarea: un solo POST aunque se toque dos veces', async () => {
    let release;
    const base = global.fetch;
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/projects/p1/tasks' && opts.method === 'POST') return new Promise((r) => { release = () => r(new Response(JSON.stringify({ task: {} }), { status: 201, headers: { 'Content-Type': 'application/json' } })); });
      return base(url, opts);
    });
    renderAt('/proyectos/p1');
    await screen.findByRole('checkbox', { name: 'Brief al diseñador' });
    await userEvent.type(screen.getByLabelText('Nueva tarea'), 'Otra{enter}{enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar tarea' }));
    expect(fetch.mock.calls.filter(([u, o]) => u === '/api/projects/p1/tasks' && o?.method === 'POST')).toHaveLength(1);
    release();
  });

  it('asignar: los usuarios que llegan tarde igual se pueden elegir', async () => {
    renderAt('/proyectos/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Asignar' }));
    expect(await screen.findByRole('checkbox', { name: /Bauti/ })).toBeInTheDocument();
  });

  it('borrar proyecto: no vuelve a pedir el detalle borrado', async () => {
    const base = global.fetch;
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: { ...me, can_delete: true } });
      if (url === '/api/projects/p1' && opts.method === 'DELETE') return json({ ok: true });
      return base(url, opts);
    });
    renderAt('/proyectos/p1');
    await userEvent.click(await screen.findByRole('button', { name: /Borrar proyecto/ }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar proyecto' }));
    expect(await screen.findByRole('radio', { name: /Activos/ })).toBeInTheDocument();
    const gets = fetch.mock.calls.filter(([u, o]) => u === '/api/projects/p1' && (!o?.method || o.method === 'GET'));
    expect(gets).toHaveLength(1);
  });
});
