export const ars = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`);
export const when = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
