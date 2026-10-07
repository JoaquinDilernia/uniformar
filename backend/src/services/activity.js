const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function diffFields(before, after, fields) {
  const d = {};
  for (const f of fields) {
    if (after[f] !== undefined && !same(before[f], after[f])) d[f] = { from: before[f] ?? null, to: after[f] ?? null };
  }
  return d;
}

// Se llama con el `q` de la transacción para que el historial y el cambio se guarden juntos
export async function logActivity(q, { actorId, entityType, entityId, action, diff = null }) {
  await q.query(
    'INSERT INTO activity_log (actor_id, entity_type, entity_id, action, diff) VALUES ($1, $2, $3, $4, $5)',
    [actorId ?? null, entityType, entityId, action, diff && Object.keys(diff).length ? JSON.stringify(diff) : null],
  );
}
