import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client.js', () => ({
  API_BASE: '',
  getToken: () => 'tok',
  api: {
    upload: vi.fn(async () => ({ file: { id: 'f1' } })),
    post: vi.fn(async (path) => (path === '/files/upload-url'
      ? { upload_url: 'https://r2.example/put?sig=1', token: 'up1' }
      : { file: { id: 'v1', kind: 'video' } })),
  },
}));
vi.mock('./imageCompress.js', () => ({ compressImage: vi.fn(async () => ({ blob: new Blob(['x'], { type: 'image/webp' }), width: 10, height: 10 })) }));
vi.mock('./putWithProgress.js', () => ({ putWithProgress: vi.fn(async (_u, _f, { onProgress }) => { onProgress?.(0.5); onProgress?.(1); }) }));

const { uploadFile, PDF_MAX, VIDEO_MAX } = await import('./upload.js');
const { api } = await import('../api/client.js');
const { putWithProgress } = await import('./putWithProgress.js');

describe('uploadFile', () => {
  beforeEach(() => api.upload.mockClear());

  it('imagen: comprime y manda dueño + archivo .webp', async () => {
    const file = new File(['abc'], 'Foto Producto.JPG', { type: 'image/jpeg' });
    await uploadFile({ ownerType: 'idea_ref', ownerId: 'i1', file, kind: 'image' });
    const form = api.upload.mock.calls[0][1];
    expect(form.get('owner_type')).toBe('idea_ref');
    expect(form.get('owner_id')).toBe('i1');
    expect(form.get('file').name).toBe('Foto Producto.webp');
  });

  it('PDF de más de 10 MB se rechaza antes de subir', async () => {
    const big = { name: 'brief.pdf', type: 'application/pdf', size: PDF_MAX + 1 };
    await expect(uploadFile({ ownerType: 'project_pdf', ownerId: 'p1', file: big, kind: 'pdf' }))
      .rejects.toThrow('El PDF pesa más de 10 MB. Comprimilo antes de subirlo.');
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('si no es PDF, avisa', async () => {
    const doc = { name: 'brief.docx', type: 'application/msword', size: 10 };
    await expect(uploadFile({ ownerType: 'project_pdf', ownerId: 'p1', file: doc, kind: 'pdf' })).rejects.toThrow('Elegí un archivo PDF.');
  });
});

describe('uploadFile media (piezas de pauta)', () => {
  beforeEach(() => { api.upload.mockClear(); api.post.mockClear(); putWithProgress.mockClear(); });

  it('video: pide link, sube directo con progreso y confirma', async () => {
    const file = new File(['abc'], 'reel.mp4', { type: 'video/mp4' });
    const progress = [];
    const res = await uploadFile({ ownerType: 'ad_story', ownerId: 'c1', file, kind: 'media', onProgress: (p) => progress.push(p) });
    expect(api.post).toHaveBeenNthCalledWith(1, '/files/upload-url', { owner_type: 'ad_story', owner_id: 'c1', mime: 'video/mp4', bytes: 3, original_name: 'reel.mp4' });
    expect(putWithProgress.mock.calls[0][0]).toBe('https://r2.example/put?sig=1');
    expect(putWithProgress.mock.calls[0][2].headers).toEqual({ 'Content-Type': 'video/mp4' });
    expect(api.post).toHaveBeenNthCalledWith(2, '/files/complete', { token: 'up1' });
    expect(progress).toEqual([0.5, 1]);
    expect(res).toEqual({ id: 'v1', kind: 'video' });
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('con storage local el PUT va a la API con la sesión', async () => {
    api.post.mockImplementationOnce(async () => ({ upload_url: '/api/files/local-upload/xyz', token: 'up2' }));
    await uploadFile({ ownerType: 'ad_feed', ownerId: 'c1', file: new File(['a'], 'a.mov', { type: 'video/quicktime' }), kind: 'media' });
    expect(putWithProgress.mock.calls[0][0]).toBe('/api/files/local-upload/xyz');
    expect(putWithProgress.mock.calls[0][2].headers).toEqual({ 'Content-Type': 'video/quicktime', Authorization: 'Bearer tok' });
  });

  it('video de más de 200 MB o de otro formato se rechaza antes de subir', async () => {
    await expect(uploadFile({ ownerType: 'ad_feed', ownerId: 'c1', kind: 'media', file: { name: 'x.mp4', type: 'video/mp4', size: VIDEO_MAX + 1 } }))
      .rejects.toThrow('El video pesa más de 200 MB.');
    await expect(uploadFile({ ownerType: 'ad_feed', ownerId: 'c1', kind: 'media', file: { name: 'x.webm', type: 'video/webm', size: 10 } }))
      .rejects.toThrow('Elegí una imagen JPG/PNG o un video MP4/MOV.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('imagen: va tal cual por el endpoint de siempre', async () => {
    await uploadFile({ ownerType: 'ad_feed', ownerId: 'c1', file: new File(['a'], 'feed.png', { type: 'image/png' }), kind: 'media' });
    expect(api.upload.mock.calls[0][1].get('file').name).toBe('feed.png');
  });
});
