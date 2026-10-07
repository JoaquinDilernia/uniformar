import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../api/queryClient.js';
import { AuthProvider } from '../state/auth.jsx';
import { ConfirmProvider } from '../components/ui/ConfirmDialog.jsx';
import { SettingsPage } from './Settings.jsx';

const me = { id: 'u1', name: 'Sofi', can_delete: true, manage_users: true, permissions: { home: 'edit', ideas: 'edit', calendar: 'edit', projects: 'edit', ads: 'edit', web: 'edit' } };
const rules = [{ id: 'r1', weekday: 2, time: null, theme: 'Foco por rubro', format: 'Carrusel / post', channels: ['ig_post'], active: true }];
const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('Ajustes', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: me });
      if (url === '/api/settings/content-rules' && opts.method === 'PUT') return json({ rules: JSON.parse(opts.body).rules });
      if (url === '/api/settings/content-rules') return json({ rules });
      if (url === '/api/clients') return json({ clients: [] });
      return json({});
    });
  });

  it('edita la grilla fija y guarda la lista completa', async () => {
    render(<QueryClientProvider client={createQueryClient()}><MemoryRouter><AuthProvider><ConfirmProvider><SettingsPage /></ConfirmProvider></AuthProvider></MemoryRouter></QueryClientProvider>);
    const theme = await screen.findByDisplayValue('Foco por rubro');
    await userEvent.clear(theme);
    await userEvent.type(theme, 'Rubro de la semana');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar día' }));
    await userEvent.type(screen.getAllByLabelText('Temática').at(-1), 'Detrás de escena');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grilla' }));
    const put = fetch.mock.calls.find(([u, o]) => u === '/api/settings/content-rules' && o?.method === 'PUT');
    const body = JSON.parse(put[1].body);
    expect(body.rules.map((r) => r.theme)).toEqual(['Rubro de la semana', 'Detrás de escena']);
    expect(body.rules[0]).toMatchObject({ weekday: 2, channels: ['ig_post'], active: true, time: null });
  });

  it('si la grilla no carga muestra error con Reintentar', async () => {
    let fail = true;
    fetch.mockImplementation((url, opts = {}) => {
      if (url === '/api/auth/me') return json({ user: me });
      if (url === '/api/settings/content-rules' && fail) return Promise.resolve(new Response(JSON.stringify({ error: { code: 'x', message: 'Falló' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
      if (url === '/api/settings/content-rules') return json({ rules });
      if (url === '/api/clients') return json({ clients: [] });
      return json({});
    });
    render(<QueryClientProvider client={createQueryClient()}><MemoryRouter><AuthProvider><ConfirmProvider><SettingsPage /></ConfirmProvider></AuthProvider></MemoryRouter></QueryClientProvider>);
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByDisplayValue('Foco por rubro')).toBeTruthy();
  });
});
