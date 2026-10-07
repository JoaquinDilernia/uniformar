// Igual que backend/src/routes/home.js
export function dayState(items) {
  if (!items.length) return 'empty';
  if (items.every((i) => i.status === 'published')) return 'published';
  if (items.every((i) => i.status !== 'draft')) return 'ready';
  return 'planned';
}
