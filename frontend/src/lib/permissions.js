const RANK = { none: 0, view: 1, edit: 2 };

export function can(user, section, level = 'view') {
  if (!user) return false;
  return RANK[user.permissions?.[section] ?? 'none'] >= RANK[level];
}
