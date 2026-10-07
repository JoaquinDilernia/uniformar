// En dev queda vacío (proxy de Vite); en producción es la URL del backend en Railway.
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

const TOKEN_KEY = 'uf_token';
let memoryToken = null; // respaldo si localStorage no está disponible
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}
export function setToken(token) {
  memoryToken = token;
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* sin storage: queda en memoria */ }
}
export function clearToken() {
  memoryToken = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* nada que borrar */ }
}

// <img>/<iframe>/<a> no pueden mandar headers: los archivos de la API llevan el token en la URL.
// Las URLs externas (R2 firmadas) quedan como vienen.
export function fileUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/api/')) return url;
  const token = getToken();
  const full = `${API_BASE}${url}`;
  if (!token) return full;
  return `${full}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let onUnauthenticated = () => {};
export const setUnauthenticatedHandler = (fn) => { onUnauthenticated = fn; };

async function request(path, { method = 'GET', body, form } = {}) {
  let res;
  try {
    const token = getToken();
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sin conexión. Revisá internet y probá de nuevo.');
  }
  const renewed = res.headers.get('X-Session-Token');
  if (renewed) setToken(renewed);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    const err = e
      ? new ApiError(res.status, e.code, e.message, e.fields)
      : new ApiError(res.status, `HTTP_${res.status}`, `El servidor no respondió bien (${res.status}). Probá de nuevo en un momento.`);
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      clearToken();
      onUnauthenticated(err);
    }
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, form) => request(path, { method: 'POST', form }),
};
