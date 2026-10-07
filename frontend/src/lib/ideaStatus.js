// Espejo de backend/src/lib/ideaStatus.js — mantener iguales
export const IDEA_STATUS_LABELS = {
  si_o_si: 'Sí o sí', por_decidir: 'Por decidir', por_hacer: 'Por hacer', realizada: 'Realizada', no_se_hace: 'No se hace',
};
export const IDEA_STATUS_ORDER = ['si_o_si', 'por_decidir', 'por_hacer', 'realizada', 'no_se_hace'];

export function deriveIdeaStatus({ kind, decision, done_at }) {
  if (decision === 'no') return 'no_se_hace';
  if (done_at) return 'realizada';
  if (kind === 'must') return 'si_o_si';
  if (decision === 'yes') return 'por_hacer';
  return 'por_decidir';
}

export const CATEGORY_LABELS = { domingo: 'Domingo · humor', viernes: 'Viernes · cliente', producto: 'Producto · catálogo', otra: 'Otros' };
export const CALENDAR_STATUS_LABELS = { draft: 'Borrador', ready: 'Listo para publicar', published: 'Publicado' };
export const CHANNEL_LABELS = { ig_story: 'Historias IG', ig_post: 'Post IG', ig_reel: 'Reel IG', tiktok: 'TikTok' };
export const CHANNELS = ['ig_story', 'ig_post', 'ig_reel', 'tiktok'];
