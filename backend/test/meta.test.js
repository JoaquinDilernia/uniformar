import { describe, it, expect } from 'vitest';
import { createMetaClient } from '../src/services/meta.js';

// fetch falso: handler(url: URL, opts) → JSON de respuesta
function fakeFetch(handler) {
  const fn = async (url, opts = {}) => {
    const u = new URL(url);
    fn.calls.push({ url: u, opts });
    return { json: async () => handler(u, opts) };
  };
  fn.calls = [];
  return fn;
}

describe('posts de Instagram', () => {
  it('normaliza tipo, métricas y alcance; si insights falla, reach queda null', async () => {
    const fetchFn = fakeFetch((u) => {
      if (u.pathname.endsWith('/222/media')) {
        return { data: [
          { id: 'm1', media_type: 'VIDEO', media_product_type: 'REELS', caption: 'Reel', thumbnail_url: 'https://t/1.jpg', permalink: 'https://ig/1', timestamp: '2026-10-10T10:00:00+0000', like_count: 40, comments_count: 3 },
          { id: 'm2', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', media_url: 'https://t/2.jpg', permalink: 'https://ig/2', timestamp: '2026-10-09T10:00:00+0000' },
        ] };
      }
      if (u.pathname.endsWith('/m1/insights')) return { data: [{ name: 'reach', values: [{ value: 1200 }] }] };
      if (u.pathname.endsWith('/m2/insights')) return { error: { code: 10, message: 'Application does not have permission' } };
      return {};
    });
    const meta = createMetaClient({ accessToken: 't', accountId: 'act_1', fetchFn, retryDelayMs: 0 });
    const posts = await meta.getIgMedia('222');
    expect(posts).toEqual([
      { id: 'm1', type: 'reel', caption: 'Reel', thumbnail: 'https://t/1.jpg', permalink: 'https://ig/1', timestamp: '2026-10-10T10:00:00+0000', likes: 40, comments: 3, reach: 1200 },
      { id: 'm2', type: 'carousel', caption: '', thumbnail: 'https://t/2.jpg', permalink: 'https://ig/2', timestamp: '2026-10-09T10:00:00+0000', likes: 0, comments: 0, reach: null },
    ]);
    expect(fetchFn.calls[0].url.searchParams.get('limit')).toBe('25');
    expect(fetchFn.calls.find((c) => c.url.pathname.endsWith('/m1/insights')).url.searchParams.get('metric')).toBe('reach');
  });
});

describe('videos', () => {
  it('sube por URL o por archivo', async () => {
    const fetchFn = fakeFetch(() => ({ id: 'v1' }));
    const meta = createMetaClient({ accessToken: 't', accountId: 'act_1', fetchFn, retryDelayMs: 0 });
    expect(await meta.uploadVideo({ fileUrl: 'https://r2/x.mp4', name: 'Reel' })).toBe('v1');
    expect(fetchFn.calls[0].url.pathname).toBe('/v23.0/act_1/advideos');
    expect(JSON.parse(fetchFn.calls[0].opts.body)).toEqual({ file_url: 'https://r2/x.mp4', name: 'Reel' });
    expect(await meta.uploadVideo({ buffer: Buffer.from('abc'), name: 'Reel' })).toBe('v1');
    const form = fetchFn.calls[1].opts.body;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('name')).toBe('Reel');
    expect(form.get('source')).toBeInstanceOf(Blob);
  });

  it('espera a que Meta procese el video', async () => {
    const states = ['processing', 'processing', 'ready'];
    const fetchFn = fakeFetch(() => ({ status: { video_status: states.shift() } }));
    const meta = createMetaClient({ accessToken: 't', accountId: 'act_1', fetchFn, retryDelayMs: 0 });
    await meta.waitVideoReady('v1', { intervalMs: 1 });
    expect(fetchFn.calls).toHaveLength(3);
    expect(fetchFn.calls[0].url.searchParams.get('fields')).toBe('status');
  });

  it('error de procesamiento y tiempo agotado', async () => {
    const failing = createMetaClient({ accessToken: 't', accountId: 'act_1', retryDelayMs: 0,
      fetchFn: fakeFetch(() => ({ status: { video_status: 'error', processing_phase: { errors: [{ message: 'codec no soportado' }] } } })) });
    await expect(failing.waitVideoReady('v1', { intervalMs: 1 })).rejects.toThrow('Meta no pudo procesar el video: codec no soportado');
    const slow = createMetaClient({ accessToken: 't', accountId: 'act_1', retryDelayMs: 0,
      fetchFn: fakeFetch(() => ({ status: { video_status: 'processing' } })) });
    await expect(slow.waitVideoReady('v1', { intervalMs: 1, timeoutMs: 20 }))
      .rejects.toThrow('Meta sigue procesando el video, probá publicar de nuevo en unos minutos.');
  });

  it('miniatura preferida', async () => {
    const fetchFn = fakeFetch(() => ({ data: [{ uri: 'https://t/a.jpg' }, { uri: 'https://t/b.jpg', is_preferred: true }] }));
    const meta = createMetaClient({ accessToken: 't', accountId: 'act_1', fetchFn, retryDelayMs: 0 });
    expect(await meta.videoThumbnail('v1')).toBe('https://t/b.jpg');
    expect(fetchFn.calls[0].url.pathname).toBe('/v23.0/v1/thumbnails');
  });
});
