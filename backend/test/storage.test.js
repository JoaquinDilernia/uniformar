import { describe, it, expect } from 'vitest';
import { createS3Storage } from '../src/services/storage.js';

describe('R2: link firmado para subir videos', () => {
  it('no lleva checksum de cuerpo vacío y firma tamaño y tipo', async () => {
    const storage = createS3Storage({ endpoint: 'https://acc.r2.cloudflarestorage.com', bucket: 'uniformar', accessKeyId: 'a', secretAccessKey: 'b' });
    const url = new URL(await storage.presignPut('ad_feed/x/v.mp4', 'video/mp4', 1234));
    const keys = [...url.searchParams.keys()];
    expect(keys.filter((k) => /checksum/i.test(k))).toEqual([]);
    expect(url.searchParams.get('X-Amz-SignedHeaders').split(';')).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
  });
});
