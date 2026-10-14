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
