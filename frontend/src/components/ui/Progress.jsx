export function Progress({ value, max, label }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}
      style={{ height: 6, borderRadius: 3, background: 'var(--c-surface-3)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--c-success)' : 'var(--c-accent)', transition: 'width var(--dur) var(--ease)' }} />
    </div>
  );
}
