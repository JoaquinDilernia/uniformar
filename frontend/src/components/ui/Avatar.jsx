import s from './Avatar.module.css';

const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function Avatar({ user, size = 28 }) {
  return (
    <span className={s.avatar} style={{ width: size, height: size, fontSize: size * 0.4, background: user?.avatar_color ?? 'var(--c-text-3)' }} title={user?.name} aria-label={user?.name}>
      {initials(user?.name)}
    </span>
  );
}

export function AvatarStack({ users, max = 3, size = 24 }) {
  const shown = users.slice(0, max);
  return (
    <span className={s.stack}>
      {shown.map((u) => <Avatar key={u.id} user={u} size={size} />)}
      {users.length > max && <span className={s.more} style={{ width: size, height: size }}>+{users.length - max}</span>}
    </span>
  );
}
