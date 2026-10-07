export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-2)', textAlign: 'center', padding: 'var(--sp-6) var(--sp-4)', color: 'var(--c-text-2)' }}>
      {Icon && <Icon size={28} aria-hidden style={{ color: 'var(--c-text-3)' }} />}
      <p style={{ fontWeight: 600, color: 'var(--c-text)' }}>{title}</p>
      {children && <p style={{ fontSize: 'var(--fs-s)' }}>{children}</p>}
      {action}
    </div>
  );
}
