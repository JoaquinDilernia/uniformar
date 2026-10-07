import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import s from './AppShell.module.css';

// Botón flotante contextual, solo en celular (en escritorio la acción va en el encabezado)
export function Fab({ icon: Icon, label, onClick }) {
  const desktop = useIsDesktop();
  if (desktop) return null;
  return (
    <button type="button" className={s.fab} onClick={onClick} aria-label={label}>
      <Icon size={26} aria-hidden />
    </button>
  );
}
