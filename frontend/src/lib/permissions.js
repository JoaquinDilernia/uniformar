// "decide" queda entre ver y editar (en ideas: aceptar/rechazar, marcar realizada y dejar nota)
const RANK = { none: 0, view: 1, decide: 2, edit: 3 };

export function can(user, section, level = 'view') {
  if (!user) return false;
  return RANK[user.permissions?.[section] ?? 'none'] >= RANK[level];
}
