const ident = (k) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw new Error(`columna inválida: ${k}`);
  return k;
};

export function buildInsert(table, values) {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined).map(ident);
  return {
    text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    params: keys.map((k) => values[k]),
  };
}

export function buildUpdate(table, id, values, { touch = true } = {}) {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined).map(ident);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  if (touch) sets.push('updated_at = now()');
  if (!sets.length) return null;
  return { text: `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params: [id, ...keys.map((k) => values[k])] };
}

export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
