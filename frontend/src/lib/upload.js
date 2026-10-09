import { api } from '../api/client.js';
import { compressImage } from './imageCompress.js';

export const PDF_MAX = 10 * 1024 * 1024;

export async function uploadFile({ ownerType, ownerId, file, kind }) {
  const form = new FormData();
  form.append('owner_type', ownerType);
  form.append('owner_id', ownerId);
  if (kind === 'pdf') {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('Elegí un archivo PDF.');
    if (file.size > PDF_MAX) throw new Error('El PDF pesa más de 10 MB. Comprimilo antes de subirlo.');
    form.append('file', file, file.name);
  } else if (kind === 'raw') {
    // Tal cual, sin comprimir: las piezas de pauta van a Meta en JPG/PNG original
    if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Elegí una imagen JPG o PNG.');
    if (file.size > 8 * 1024 * 1024) throw new Error('La imagen pesa más de 8 MB.');
    form.append('file', file, file.name);
  } else {
    const { blob } = await compressImage(file);
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    form.append('file', blob, `${file.name.replace(/\.[^.]+$/, '')}.${ext}`);
  }
  return (await api.upload('/files', form)).file;
}
