import { useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Fab } from '../../components/shell/Fab.jsx';
import { relativeTime } from '../../lib/dates.js';
import { useUsers } from './api.js';
import { NewUserSheet, EditUserSheet } from './UserSheet.jsx';
import s from './users.module.css';
import p from '../pages.module.css';

function roleLabel(u) {
  if (u.manage_users) return 'Admin';
  const levels = Object.values(u.permissions);
  if (levels.every((l) => l !== 'edit')) return 'Solo lectura';
  return 'Equipo';
}

export function UsersPage() {
  const { data: users, isPending, isError, refetch } = useUsers();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const editing = users?.find((u) => u.id === editingId);

  let body;
  if (isPending) body = <div className={p.center}><Spinner /></div>;
  else if (isError || !users) {
    body = (
      <div className={p.center}>
        <p>No pudimos cargar los usuarios.</p>
        <Button onClick={() => refetch()}>Reintentar</Button>
      </div>
    );
  } else {
    body = (
      <div className={p.list}>
        {users.map((u) => (
          <button key={u.id} type="button" className={`${p.listItem} ${s.userRow} ${u.is_active ? '' : s.inactive}`} onClick={() => setEditingId(u.id)}>
            <Avatar user={u} size={36} />
            <span className={s.userMain}>
              <strong>{u.name}</strong>
              <span className="muted">{u.email}</span>
            </span>
            <span className={s.userMeta}>
              <span className={s.role}>{u.is_active ? roleLabel(u) : 'Desactivado'}</span>
              <span className="muted">{u.last_login_at ? `Entró ${relativeTime(u.last_login_at)}` : 'Nunca entró'}</span>
            </span>
            <ChevronRight size={18} aria-hidden className="muted" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Quién entra y qué puede hacer" actions={<Button className="desktop-only" icon={Plus} onClick={() => setCreating(true)}>Nuevo usuario</Button>} />
      <div className={p.page}>{body}</div>
      <Fab icon={Plus} label="Nuevo usuario" onClick={() => setCreating(true)} />
      {creating && <NewUserSheet onClose={() => setCreating(false)} />}
      {editing && <EditUserSheet key={editing.id + JSON.stringify(editing.permissions)} user={editing} onClose={() => setEditingId(null)} />}
    </>
  );
}
