import { describe, it, expect, vi } from 'vitest';
import { fitWithin, compressImage, encodeCanvas, MAX_BYTES } from './imageCompress.js';

const fakeFile = (size = 1000) => ({ size, name: 'foto.jpg', type: 'image/jpeg' });
const blob = (size, type = 'image/webp') => ({ size, type });

describe('compresión de imágenes', () => {
  it('fitWithin lleva el lado largo a 2048 manteniendo proporción', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(1080, 1920)).toEqual({ width: 1080, height: 1920 });
  });

  it('usa la primera calidad que entra en 2 MB', async () => {
    const encode = vi.fn()
      .mockResolvedValueOnce(blob(MAX_BYTES + 1))
      .mockResolvedValueOnce(blob(900_000));
    const out = await compressImage(fakeFile(), { decode: async () => ({ width: 4000, height: 3000 }), encode });
    expect(encode).toHaveBeenNthCalledWith(1, expect.anything(), 2048, 1536, 0.82);
    expect(encode).toHaveBeenNthCalledWith(2, expect.anything(), 2048, 1536, 0.75);
    expect(out).toMatchObject({ width: 2048, height: 1536, type: 'image/webp' });
  });

  it('si no entra ni a calidad 0,6, error claro', async () => {
    const encode = vi.fn().mockResolvedValue(blob(MAX_BYTES + 1));
    await expect(compressImage(fakeFile(), { decode: async () => ({ width: 100, height: 100 }), encode }))
      .rejects.toThrow('No pudimos achicar la imagen a menos de 2 MB. Probá con otra.');
    expect(encode).toHaveBeenCalledTimes(4);
  });

  it('rechaza originales de más de 25 MB', async () => {
    await expect(compressImage(fakeFile(26 * 1024 * 1024))).rejects.toThrow('La imagen pesa más de 25 MB. Elegí una más liviana.');
  });

  it('si no puede leer la imagen (p. ej. HEIC en Chrome), error claro', async () => {
    await expect(compressImage(fakeFile(), { decode: async () => { throw new Error('x'); } }))
      .rejects.toThrow('No pudimos leer esa imagen. Probá con una JPG o PNG.');
  });

  it('Safari sin WebP: cae a JPEG', async () => {
    const toBlob = vi.fn((canvas, type) => Promise.resolve(blob(1000, type === 'image/webp' ? 'image/png' : type)));
    const out = await encodeCanvas({}, 0.82, toBlob);
    expect(toBlob).toHaveBeenNthCalledWith(1, {}, 'image/webp', 0.82);
    expect(toBlob).toHaveBeenNthCalledWith(2, {}, 'image/jpeg', 0.82);
    expect(out.type).toBe('image/jpeg');
  });
});
