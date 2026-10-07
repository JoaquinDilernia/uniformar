import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError, setUnauthenticatedHandler, getToken, setToken, clearToken, fileUrl } from './client.js';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('cliente de API', () => {
  beforeEach(() => { global.fetch = vi.fn(); clearToken(); });

  it('GET devuelve el JSON, va a /api/... y no manda credentials', async () => {
    fetch.mockReturnValue(json(200, { ideas: [] }));
    expect(await api.get('/ideas')).toEqual({ ideas: [] });
    expect(fetch).toHaveBeenCalledWith('/api/ideas', expect.objectContaining({ method: 'GET' }));
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('credentials');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('con token guardado manda Authorization: Bearer', async () => {
    setToken('x');
    fetch.mockReturnValue(json(200, {}));
    await api.get('/ideas');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer x');
  });

  it('el header X-Session-Token de la respuesta reemplaza el token guardado', async () => {
    setToken('viejo');
    fetch.mockReturnValue(Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'X-Session-Token': 'nuevo' } })));
    await api.get('/ideas');
    expect(getToken()).toBe('nuevo');
    expect(localStorage.getItem('uf_token')).toBe('nuevo');
  });

  it('un 401 borra el token', async () => {
    setToken('vencido');
    fetch.mockReturnValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'Tu sesión expiró. Volvé a entrar.' } }));
    await api.get('/ideas').catch(() => {});
    expect(getToken()).toBeNull();
    expect(localStorage.getItem('uf_token')).toBeNull();
  });

  it('fileUrl agrega ?token= a las URLs de la API y deja intactas las externas', () => {
    setToken('a b');
    expect(fileUrl('/api/files/1/raw')).toBe('/api/files/1/raw?token=a%20b');
    expect(fileUrl('/api/files/1/raw?x=1')).toBe('/api/files/1/raw?x=1&token=a%20b');
    expect(fileUrl('https://r2.example.com/f?sig=1')).toBe('https://r2.example.com/f?sig=1');
    expect(fileUrl(null)).toBeNull();
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
