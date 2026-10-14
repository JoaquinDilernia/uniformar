import { api, API_BASE, getToken } from '../api/client.js';
import { compressImage } from './imageCompress.js';
import { putWithProgress } from './putWithProgress.js';

export const PDF_MAX = 10 * 1024 * 1024;
export const VIDEO_MAX = 200 * 1024 * 1024;
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const RAW_IMAGE_TYPES = ['image/jpeg', 'image/png'];

// Videos: el servidor da un link firmado, el navegador sube directo al storage y después se confirma
async function uploadVideo({ ownerType, ownerId, file, onProgress }) {
  if (file.size > VIDEO_MAX) throw new Error('El video pesa más de 200 MB.');
  const { upload_url: url, token } = await api.post('/files/upload-url', {
    owner_type: ownerType, owner_id: ownerId, mime: file.type, bytes: file.size, original_name: file.name,
  });
  const local = url.startsWith('/api/');
  const auth = local && getToken() ? { Authorization: `Bearer ${getToken()}` } : {};
  await putWithProgress(local ? `${API_BASE}${url}` : url, file, { headers: { 'Content-Type': file.type, ...auth }, onProgress });
  return (await api.post('/files/complete', { token })).file;
}

export async function uploadFile({ ownerType, ownerId, file, kind: requested, onProgress }) {
  let kind = requested;
  // Piezas de pauta: imagen JPG/PNG tal cual o video
  if (kind === 'media') {
    if (VIDEO_TYPES.includes(file.type)) return uploadVideo({ ownerType, ownerId, file, onProgress });
    if (!RAW_IMAGE_TYPES.includes(file.type)) throw new Error('Elegí una imagen JPG/PNG o un video MP4/MOV.');
    kind = 'raw';
  }
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
