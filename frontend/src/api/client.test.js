import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError, setUnauthenticatedHandler } from './client.js';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('cliente de API', () => {
  beforeEach(() => { global.fetch = vi.fn(); });

  it('GET devuelve el JSON y manda cookies', async () => {
    fetch.mockReturnValue(json(200, { ideas: [] }));
    expect(await api.get('/ideas')).toEqual({ ideas: [] });
    expect(fetch).toHaveBeenCalledWith('/api/ideas', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }));
  });

  it('POST manda JSON', async () => {
    fetch.mockReturnValue(json(201, { idea: { id: 1 } }));
    await api.post('/ideas', { text: 'x' });
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.body).toBe('{"text":"x"}');
  });

  it('error del backend → ApiError con code, message y fields', async () => {
    fetch.mockReturnValue(json(400, { error: { code: 'VALIDATION', message: 'Revisá los datos: Escribí la idea', fields: { text: 'Escribí la idea' } } }));
    const err = await api.post('/ideas', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION', message: 'Revisá los datos: Escribí la idea', fields: { text: 'Escribí la idea' } });
  });

  it('sin conexión → NETWORK con mensaje claro', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await api.get('/ideas').catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK', message: 'Sin conexión. Revisá internet y probá de nuevo.' });
  });

  it('401 avisa al handler de sesión (salvo en el login)', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    fetch.mockReturnValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'Tu sesión expiró. Volvé a entrar.' } }));
    await api.get('/ideas').catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
    fetch.mockReturnValue(json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos' } }));
    await api.post('/auth/login', {}).catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('respuesta no JSON con error → mensaje genérico con el status', async () => {
    fetch.mockReturnValue(Promise.resolve(new Response('<html>502</html>', { status: 502 })));
    const err = await api.get('/ideas').catch((e) => e);
    expect(err.message).toBe('El servidor no respondió bien (502). Probá de nuevo en un momento.');
  });
});
