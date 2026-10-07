import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import { ToastViewport } from '../../state/Toasts.jsx';
import { Sidebar } from './Sidebar.jsx';
import { BottomNav } from './BottomNav.jsx';
import { OfflineBanner } from './OfflineBanner.jsx';
import s from './AppShell.module.css';

export function AppShell({ children }) {
  const desktop = useIsDesktop();
  return (
    <div className={s.shell}>
      {desktop && <Sidebar />}
      <main className={s.main}>
        <OfflineBanner />
        <div className={s.content}>{children}</div>
      </main>
      {!desktop && <BottomNav />}
      <ToastViewport />
    </div>
  );
}
