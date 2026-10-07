import { Spinner } from './Spinner.jsx';
import s from './Button.module.css';

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, full = false, className = '', disabled, type = 'button', children, ...rest }) {
  return (
    <button
      type={type}
      className={[s.btn, s[variant], s[size], full && s.full, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : Icon ? <Icon size={18} aria-hidden /> : null}
      {children != null && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className = '', ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className={[s.btn, s.iconOnly, s[variant], s[size], className].join(' ')} {...rest}>
      <Icon size={size === 'sm' ? 18 : 20} aria-hidden />
    </button>
  );
}
