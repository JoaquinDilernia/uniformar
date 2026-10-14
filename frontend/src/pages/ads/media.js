// Debe coincidir con ALLOW_MIXED_MEDIA de backend/src/ads/creativeSpec.js
export const ALLOW_MIXED_MEDIA = true;
export const MEDIA_ACCEPT = 'image/jpeg,image/png,video/mp4,video/quicktime';
export const mediaKind = (file) => (file?.type?.startsWith('video/') ? 'video' : 'image');
