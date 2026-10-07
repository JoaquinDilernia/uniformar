import { WifiOff } from 'lucide-react';
import { useOnline } from '../../hooks/useOnline.js';
import s from './AppShell.module.css';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className={s.offline} role="status">
      <WifiOff size={16} aria-hidden /> Sin conexión. Lo que cambies no se va a guardar hasta que vuelva internet.
    </div>
  );
}
