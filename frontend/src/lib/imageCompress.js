export const MAX_SIDE = 2048;
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const QUALITY_STEPS = [0.82, 0.75, 0.68, 0.6];

export function fitWithin(width, height, max = MAX_SIDE) {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const defaultToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Safari puede devolver PNG cuando se le pide WebP: en ese caso se usa JPEG
export async function encodeCanvas(canvas, quality, toBlob = defaultToBlob) {
  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;
  return toBlob(canvas, 'image/jpeg', quality);
}

async function decodeImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { width: bitmap.width, height: bitmap.height, source: bitmap };
}

function drawAndEncode(img, width, height, quality, jpeg = false) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img.source, 0, 0, width, height);
  return jpeg ? defaultToBlob(canvas, 'image/jpeg', quality) : encodeCanvas(canvas, quality);
}

// jpeg: fuerza JPEG (Instagram no acepta WebP ni PNG). maxSide/maxBytes cambian los límites por defecto.
export async function compressImage(file, { decode = decodeImage, encode = drawAndEncode, jpeg = false, maxSide = MAX_SIDE, maxBytes = MAX_BYTES } = {}) {
  if (file.size > MAX_INPUT_BYTES) throw new Error('La imagen pesa más de 25 MB. Elegí una más liviana.');
  let img;
  try {
    img = await decode(file);
  } catch {
    throw new Error('No pudimos leer esa imagen. Probá con una JPG o PNG.');
  }
  const { width, height } = fitWithin(img.width, img.height, maxSide);
  for (const q of QUALITY_STEPS) {
    const blob = await encode(img, width, height, q, jpeg);
    if (blob && blob.size <= maxBytes) return { blob, width, height, type: blob.type };
  }
  throw new Error(`No pudimos achicar la imagen a menos de ${maxBytes / 1024 / 1024} MB. Probá con otra.`);
}
