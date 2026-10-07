import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client.js', () => ({ api: { upload: vi.fn(async () => ({ file: { id: 'f1' } })) } }));
vi.mock('./imageCompress.js', () => ({ compressImage: vi.fn(async () => ({ blob: new Blob(['x'], { type: 'image/webp' }), width: 10, height: 10 })) }));

const { uploadFile, PDF_MAX } = await import('./upload.js');
const { api } = await import('../api/client.js');

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
