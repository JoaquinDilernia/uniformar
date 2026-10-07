export const PRESETS = {
  ig_post: { w: 1080, h: 1350, name: 'Post / carrusel IG' },
  ig_story: { w: 1080, h: 1920, name: 'Historia IG' },
  ig_reel: { w: 1080, h: 1920, name: 'Reel IG' },
  tiktok: { w: 1080, h: 1920, name: 'TikTok' },
  square: { w: 1080, h: 1080, name: 'Post cuadrado' },
  product: { w: 1080, h: 1350, name: 'Foto de producto' },
  photo: { w: null, h: null, name: 'Foto' },
};

const COMMON = [[1, 1], [4, 5], [5, 4], [9, 16], [16, 9], [3, 4], [4, 3], [2, 3], [3, 2]];

export function ratioLabel(w, h) {
  const r = w / h;
  const hit = COMMON.find(([a, b]) => Math.abs(r - a / b) / (a / b) <= 0.01);
  return hit ? `${hit[0]}:${hit[1]}` : `${w}×${h}`;
}

export function aspectWarning(w, h, presetKey) {
  const p = PRESETS[presetKey];
  if (!p?.w) return null;
  const target = p.w / p.h;
  if (Math.abs(w / h - target) / target <= 0.03) return null;
  return `Esta imagen es ${ratioLabel(w, h)}; para ${p.name} se recomienda ${ratioLabel(p.w, p.h)} (${p.w}×${p.h}).`;
}

export function presetForChannels(channels = []) {
  if (channels.includes('ig_story') && channels.length === 1) return 'ig_story';
  if (channels.some((c) => c === 'ig_reel' || c === 'tiktok' || c === 'ig_story')) return 'ig_reel';
  return 'ig_post';
}
