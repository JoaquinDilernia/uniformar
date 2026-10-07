import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Textarea } from '../../components/ui/Field.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { useDraft } from '../../hooks/useDraft.js';
import { relativeTime } from '../../lib/dates.js';
import { useCreateUpdate, useDeleteUpdate } from './api.js';
import s from './projects.module.css';

export function UpdatesFeed({ project, canEdit }) {
  const { user } = useAuth();
  const [draft, setDraft, clear] = useDraft(`update-${project.id}`, { body: '' });
  const create = useCreateUpdate(project.id);
  const remove = useDeleteUpdate(project.id);
  const confirm = useConfirm();
  const [error, setError] = useState(null);

  function publish() {
    if (create.isPending) return;
    if (!draft.body.trim()) return setError('Escribí la novedad');
    setError(null);
    create.mutate(draft.body, { onSuccess: clear });
  }

  return (
    <section className={s.block} aria-label="Novedades">
      <div className={s.blockHead}><h2>Novedades</h2></div>
      {canEdit && (
        <div className={s.composer}>
          <Textarea aria-label="Nueva novedad" minRows={2} value={draft.body} onChange={(e) => setDraft({ body: e.target.value })} placeholder="¿Cómo viene el proyecto?" />
          {error && <p className={s.err}>{error}</p>}
          <Button size="sm" onClick={publish} loading={create.isPending}>Publicar</Button>
        </div>
      )}
      <ul className={s.feed}>
        {project.updates.map((u) => (
          <li key={u.id} className={s.update}>
            <Avatar user={{ name: u.author_name, avatar_color: u.author_color }} size={30} />
            <div className={s.updateMain}>
              <p className={s.updateHead}><strong>{u.author_name ?? 'Alguien'}</strong> <span className="muted">· {relativeTime(u.created_at)}</span></p>
              <p className="prewrap">{u.body}</p>
            </div>
            {canEdit && (u.author_id === user?.id || user?.can_delete) && (
              <IconButton icon={Trash2} label="Borrar novedad" size="sm"
                onClick={async () => (await confirm({ title: '¿Borrar esta novedad?', confirmLabel: 'Borrar', danger: true })) && remove.mutate(u.id)} />
            )}
          </li>
        ))}
        {project.updates.length === 0 && <li className="muted">Todavía no hay novedades.</li>}
      </ul>
    </section>
  );
}
