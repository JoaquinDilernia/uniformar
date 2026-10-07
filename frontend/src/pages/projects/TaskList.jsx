import { useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { AvatarStack } from '../../components/ui/Avatar.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { formatShort, todayART } from '../../lib/dates.js';
import { useDirectory } from '../ideas/api.js';
import { useCreateTask, useDeleteTask, useUpdateTask } from './api.js';
import s from './projects.module.css';

function AssignSheet({ task, users, onSave, onClose }) {
  const [ids, setIds] = useState(task.assignee_ids);
  const toggle = (id) => setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  return (
    <Sheet open onClose={onClose} title="¿Quién la hace?" footer={<Button onClick={() => { onSave(ids); onClose(); }}>Listo</Button>}>
      <div className={s.assignList}>
        {users.length === 0 && <p className="muted">Cargando equipo…</p>}
        {users.map((u) => (
          <label key={u.id} className={s.assignRow}>
            <input type="checkbox" checked={ids.includes(u.id)} onChange={() => toggle(u.id)} />
            <span className={s.dot} style={{ background: u.avatar_color }} aria-hidden /> {u.name}
          </label>
        ))}
      </div>
    </Sheet>
  );
}

export function TaskList({ project, canEdit }) {
  const { user } = useAuth();
  const { data: users = [] } = useDirectory();
  const create = useCreateTask(project.id);
  const update = useUpdateTask(project.id);
  const remove = useDeleteTask(project.id);
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [assigning, setAssigning] = useState(null);
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const today = todayART();

  function add(e) {
    e.preventDefault();
    if (create.isPending || !text.trim()) return;
    create.mutate({ text: text.trim(), assignee_ids: [] }, { onSuccess: () => setText('') });
  }

  return (
    <section className={s.block} aria-label="Tareas">
      <div className={s.blockHead}><h2>Tareas</h2><span className="muted">{project.tasks.filter((t) => t.done).length}/{project.tasks.length}</span></div>
      <ul className={s.tasks}>
        {project.tasks.map((t) => (
          <li key={t.id} className={`${s.task} ${t.done ? s.done : ''}`}>
            <input type="checkbox" className={s.check} checked={t.done} disabled={!canEdit} aria-label={t.text}
              onChange={() => update.mutate({ id: t.id, patch: { done: !t.done } })} />
            <span className={s.taskText}>{t.text}</span>
            {t.due_date && <span className={`${s.due} ${!t.done && t.due_date < today ? s.overdue : ''}`}>{formatShort(t.due_date)}</span>}
            <button type="button" className={s.assignBtn} disabled={!canEdit} onClick={() => setAssigning(t)} aria-label="Asignar">
              {t.assignee_ids.length ? <AvatarStack users={t.assignee_ids.map((id) => byId[id]).filter(Boolean)} /> : <UserPlus size={18} />}
            </button>
            {canEdit && user?.can_delete && (
              <IconButton icon={Trash2} label="Borrar tarea" size="sm"
                onClick={async () => (await confirm({ title: '¿Borrar esta tarea?', confirmLabel: 'Borrar', danger: true })) && remove.mutate(t.id)} />
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className={s.addTask} onSubmit={add}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nueva tarea" aria-label="Nueva tarea" />
          <Button type="submit" icon={Plus} loading={create.isPending} aria-label="Agregar tarea" />
        </form>
      )}
      {assigning && (
        <AssignSheet task={assigning} users={users} onClose={() => setAssigning(null)}
          onSave={(ids) => update.mutate({ id: assigning.id, patch: { assignee_ids: ids } })} />
      )}
    </section>
  );
}
