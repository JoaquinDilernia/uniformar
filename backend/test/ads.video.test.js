import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from './helpers/testApp.js';
import { config, fakeMeta, fakeAnthropic, contextSection } from './helpers/adsFakes.js';
import { MP4_MIN, PNG_1x1 } from './helpers/fixtures.js';
import { createAdsRepo } from '../src/repo/ads.js';
import { buildContext } from '../src/ads/agent.js';

let ctx, meta, admin;
beforeAll(async () => {
  meta = fakeMeta();
  ctx = await createTestContext({ ads: { meta, anthropic: fakeAnthropic([]), config } });
  admin = (await ctx.asUser({ template: 'admin' })).agent;
});
afterAll(() => ctx.close());

async function uploadVideo(creativeId, ownerType) {
  const link = await admin.post('/api/files/upload-url').send({ owner_type: ownerType, owner_id: creativeId, mime: 'video/mp4', bytes: MP4_MIN.length, original_name: 'reel.mp4' });
  await admin.put(link.body.upload_url).set('Content-Type', 'video/mp4').send(MP4_MIN);
  return (await admin.post('/api/files/complete').send({ token: link.body.token })).body.file;
}

describe('piezas con video', () => {
  it('feed imagen + historia video: sube cada uno como corresponde y publica', async () => {
    const id = (await admin.post('/api/ads/creatives').send({ name: 'Reel Maná', copy: 'Escribinos 👇' })).body.creative.id;
    await admin.post('/api/files').field('owner_type', 'ad_feed').field('owner_id', id).attach('file', PNG_1x1, 'feed.png');
    const video = await uploadVideo(id, 'ad_story');

    const list = (await admin.get('/api/ads/creatives')).body.creatives;
    const c = list.find((x) => x.id === id);
    expect(c.feed).toMatchObject({ kind: 'image' });
    expect(c.story).toMatchObject({ id: video.id, kind: 'video', url: `/api/files/${video.id}/raw` });

    const text = await buildContext({ meta, repo: createAdsRepo(ctx.db), config });
    expect(contextSection(text, 'unusedCreatives').find((x) => x.id === id)).toMatchObject({ feed: 'image', story: 'video' });

    meta.calls.length = 0;
    const pub = await admin.post(`/api/ads/creatives/${id}/publish`).send({ adset_id: '901', adset_name: 'WPP_X' });
    expect(pub.status).toBe(200);
    // Storage local: no hay URL pública, el video va como archivo
    const up = meta.calls.find((c) => c[0] === 'uploadVideo')[1];
    expect(Buffer.isBuffer(up.buffer)).toBe(true);
    expect(meta.calls).toContainEqual(['waitVideoReady', 'vid1']);
    const spec = meta.calls.find((c) => c[0] === 'createCreative')[1];
    expect(spec.asset_feed_spec.videos[0]).toMatchObject({ video_id: 'vid1', thumbnail_url: 'https://t/thumb.jpg' });
  });
});
