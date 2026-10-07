import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/auth.jsx';
import { can } from './lib/permissions.js';
import { visibleNav } from './components/shell/nav.js';
import { AppShell } from './components/shell/AppShell.jsx';
import { Guard } from './components/shell/Guard.jsx';
import { Spinner } from './components/ui/Spinner.jsx';
import { Button } from './components/ui/Button.jsx';
import { ToastViewport } from './state/Toasts.jsx';
import { Login } from './pages/Login.jsx';
import { ChangePassword } from './pages/ChangePassword.jsx';
import { MorePage } from './pages/More.jsx';
import { ComingSoon } from './pages/ComingSoon.jsx';
import { Placeholder } from './pages/Placeholder.jsx';
import { IdeasPage } from './pages/ideas/IdeasPage.jsx';
import { CalendarPage } from './pages/calendar/CalendarPage.jsx';
import { ProjectsPage } from './pages/projects/ProjectsPage.jsx';
import { ProjectDetail } from './pages/projects/ProjectDetail.jsx';
import { HomePage } from './pages/home/HomePage.jsx';
import { UsersPage } from './pages/users/UsersPage.jsx';
import s from './pages/pages.module.css';

// Las pantallas reales reemplazan a estos placeholders en las Tasks 18–23

const SettingsPage = () => <Placeholder title="Ajustes" />;
const AccountPage = () => <Placeholder title="Mi cuenta" />;

function Home() {
  const { user } = useAuth();
  if (can(user, 'home')) return <HomePage />;
  const first = visibleNav(user).all[0];
  return <Navigate to={first?.to && first.to !== '/' ? first.to : '/cuenta'} replace />;
}

export default function App() {
  const { status, user, retry } = useAuth();
  if (status === 'loading') return <div className={s.center}><Spinner size={28} label="Cargando" /></div>;
  if (status === 'error') {
    return (
      <div className={s.center}>
        <h2>No pudimos conectarnos</h2>
        <p className="muted">Revisá tu conexión y probá de nuevo.</p>
        <Button onClick={() => retry()}>Reintentar</Button>
      </div>
    );
  }
  if (status === 'out') return <><Login /><ToastViewport /></>;
  if (user.must_change_password) return <><ChangePassword /><ToastViewport /></>;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ideas" element={<Guard section="ideas"><IdeasPage /></Guard>} />
        <Route path="/ideas/:id" element={<Guard section="ideas"><IdeasPage /></Guard>} />
        <Route path="/calendario" element={<Guard section="calendar"><CalendarPage /></Guard>} />
        <Route path="/calendario/:date" element={<Guard section="calendar"><CalendarPage /></Guard>} />
        <Route path="/proyectos" element={<Guard section="projects"><ProjectsPage /></Guard>} />
        <Route path="/proyectos/:id" element={<Guard section="projects"><ProjectDetail /></Guard>} />
        <Route path="/pauta" element={<Guard section="ads"><ComingSoon kind="ads" /></Guard>} />
        <Route path="/web" element={<Guard section="web"><ComingSoon kind="web" /></Guard>} />
        <Route path="/usuarios" element={<Guard flag="manage_users"><UsersPage /></Guard>} />
        <Route path="/ajustes" element={<Guard section="calendar" level="edit"><SettingsPage /></Guard>} />
        <Route path="/cuenta" element={<AccountPage />} />
        <Route path="/mas" element={<MorePage />} />
        <Route path="*" element={<div className={s.center}><h2>No encontramos esta página</h2></div>} />
      </Routes>
    </AppShell>
  );
}
