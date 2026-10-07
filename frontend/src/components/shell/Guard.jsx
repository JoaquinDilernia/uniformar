import { Lock } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { can } from '../../lib/permissions.js';
import s from '../../pages/pages.module.css';

export function Guard({ section, level = 'view', flag, children }) {
  const { user } = useAuth();
  const ok = flag ? Boolean(user?.[flag]) : section ? can(user, section, level) : true;
  if (ok) return children;
  return (
    <div className={s.center}>
      <Lock size={32} aria-hidden className={s.centerIcon} />
      <h2>No tenés acceso a esta sección</h2>
      <p className="muted">Si lo necesitás, pedile a Sofi que te habilite el permiso.</p>
    </div>
  );
}
