import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../api/queryClient.js';
import { AuthProvider } from '../state/auth.jsx';
import { Login } from './Login.jsx';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function renderLogin() {
  return render(<QueryClientProvider client={createQueryClient()}><AuthProvider><Login /></AuthProvider></QueryClientProvider>);
}

describe('Login', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => (url === '/api/auth/me'
      ? json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })
      : json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos' } })));
  });

  it('muestra el error del backend debajo del formulario', async () => {
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'sofi@uniform.ar');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos');
  });

  it('no deja enviar vacío', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(fetch).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });
});
