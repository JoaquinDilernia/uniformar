import s from './Spinner.module.css';

export function Spinner({ size = 20, label }) {
  return <span className={s.spinner} style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label} />;
}
