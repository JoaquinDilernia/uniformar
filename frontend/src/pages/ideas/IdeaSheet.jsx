import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, CalendarPlus, Clapperboard, Camera, CalendarDays } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth, useCan } from '../../state/auth.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input, Textarea } from '../../components/ui/Field.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { ImageUploader } from '../../components/media/ImageUploader.jsx';
import { EmbedPreview } from '../../components/media/EmbedPreview.jsx';
import { CATEGORY_LABELS } from '../../lib/ideaStatus.js';
import { formatShort, todayART } from '../../lib/dates.js';
import { useDeleteIdea, useIdea, useIdeaAction, useUpdateIdea, ideaKeys } from './api.js';
import { IdeaForm } from './IdeaForm.jsx';
import { IdeaActivity } from './IdeaActivity.jsx';
import s from './ideas.module.css';

function NoteField({ idea, field, label, canEdit }) {
  const update = useUpdateIdea(idea.id, { success: 'Nota guardada ✓' });
  const [value, setValue] = useState(idea[field] ?? '');
  const by = idea[`${field}_by_name`];
  const save = () => {
    if ((idea[field] ?? '') !== value) update.mutate({ [field]: value.trim() === '' ? null : value });
  };
  return (
    <Field label={by ? `${label} · ${by}` : label}>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} readOnly={!canEdit} minRows={2} placeholder={canEdit ? 'Escribí una nota…' : 'Sin nota'} />
    </Field>
  );
}

function ScheduleIdea({ idea }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayART());
  const [open, setOpen] = useState(false);
  const channels = idea.category === 'domingo' || idea.category === 'viernes' ? ['ig_reel', 'tiktok'] : idea.format === 'photo' ? ['ig_post'] : ['ig_reel'];
  const schedule = useMutation({
    mutationFn: () => api.post('/calendar', { date, title: idea.text.split('\n')[0].slice(0, 300), idea_id: idea.id, channels }),
    meta: { success: 'Agregada al calendario ✓' },
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ideaKeys.one(idea.id) });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
  if (!open) return <Button variant="secondary" size="sm" icon={CalendarPlus} onClick={() => setOpen(true)}>Programar en el calendario</Button>;
  return (
    <div className={s.inline}>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Día de publicación" />
      <Button size="sm" loading={schedule.isPending} onClick={() => schedule.mutate()}>Agregar</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
    </div>
  );
}

export function IdeaSheet({ id, onClose }) {
  const { data: idea, isPending, isError } = useIdea(id);
  const can = useCan();
  const { user } = useAuth();
  const canEdit = can('ideas', 'edit');
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [resultError, setResultError] = useState(null);
  const action = useIdeaAction(id);
  const del = useDeleteIdea();
  const confirm = useConfirm();

  if (isPending || isError) {
    return (
      <Sheet open onClose={onClose} title="Idea">
        {isPending ? <div className={s.pad}><Spinner /></div> : <p className="muted">No encontramos esta idea. Puede que la hayan borrado.</p>}
      </Sheet>
    );
  }

  const run = (act, body) => action.mutate({ action: act, body });
  function submitComplete() {
    if (!/^https?:\/\/\S+$/i.test(resultUrl.trim())) {
      setResultError('Pegá el link del resultado (Drive, Instagram, TikTok…)');
      return;
    }
    setResultError(null);
    action.mutate({ action: 'complete', body: { result_url: resultUrl.trim() } }, { onSuccess: () => setCompleting(false) });
  }

  let footer = null;
  if (canEdit && !editing) {
    if (completing) {
      footer = <><Button variant="secondary" onClick={() => setCompleting(false)}>Cancelar</Button><Button onClick={submitComplete} loading={action.isPending}>Marcar realizada</Button></>;
    } else if (idea.status === 'por_decidir') {
      footer = <><Button variant="secondary" onClick={() => run('decide', { decision: 'no' })}>No la hago</Button><Button onClick={() => run('decide', { decision: 'yes' })}>Sí, la hago</Button></>;
    } else if (idea.status === 'por_hacer' || idea.status === 'si_o_si') {
      footer = <>{idea.status === 'por_hacer' && <Button variant="ghost" onClick={() => run('undecide')}>Deshacer</Button>}<Button onClick={() => setCompleting(true)}>Ya la hice</Button></>;
    } else if (idea.status === 'realizada') {
      footer = <Button variant="secondary" onClick={() => run('reopen')}>Reabrir</Button>;
    } else if (idea.status === 'no_se_hace') {
      footer = <Button variant="secondary" onClick={() => run('undecide')}>Deshacer "No la hago"</Button>;
    }
  }
  if (editing) {
    footer = <><Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button><Button type="submit" form="idea-edit">Guardar cambios</Button></>;
  }

  async function onDelete() {
    if (await confirm({ title: '¿Borrar esta idea?', message: 'Se borran también sus fotos. No se puede deshacer.', confirmLabel: 'Borrar', danger: true })) {
      del.mutate(id, { onSuccess: onClose });
    }
  }

  const FormatIcon = idea.format === 'video' ? Clapperboard : Camera;
  return (
    <Sheet open onClose={onClose} title={idea.kind === 'must' ? '📌 Sí o sí' : '💡 Idea'} size="lg" footer={footer}>
      {editing ? (
        <IdeaForm formId="idea-edit" initial={idea} onSaved={() => setEditing(false)} />
      ) : (
        <div className={s.detail}>
          <div className={s.badges}>
            <StatusBadge kind="idea" status={idea.status} />
            <span className={s.tag}><FormatIcon size={14} aria-hidden /> {idea.format === 'video' ? 'Video' : 'Foto'}</span>
            <span className={s.tag}>{CATEGORY_LABELS[idea.category]}{idea.client_name ? ` · ${idea.client_name}` : ''}</span>
            {idea.due_date && <span className={s.tag}>Hasta {formatShort(idea.due_date)}</span>}
          </div>

          {completing && (
            <div className={s.completeBox}>
              <Field label="Link del resultado" required error={resultError} hint="Donde quedó el video o las fotos: Drive, Instagram, TikTok…">
                <Input type="url" inputMode="url" autoFocus value={resultUrl} onChange={(e) => setResultUrl(e.target.value)} placeholder="https://" />
              </Field>
            </div>
          )}

          <p className={`prewrap ${s.text}`}>{idea.text}</p>
          <div className={s.metaRow}>
            {idea.assignee_name && <span className={s.assignee}><Avatar user={{ name: idea.assignee_name, avatar_color: idea.assignee_color }} size={22} /> {idea.assignee_name}</span>}
            {canEdit && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>}
          </div>

          {idea.status === 'realizada' && idea.result_url && (
            <section className={s.section}>
              <h3>Resultado</h3>
              <EmbedPreview url={idea.result_url} />
              {(idea.format === 'photo' || idea.result_files.length > 0) && (
                <ImageUploader ownerType="idea_result" ownerId={idea.id} files={idea.result_files} invalidate={[ideaKeys.one(id), ideaKeys.all, ['home']]}
                  canEdit={canEdit} canDelete={user.can_delete} label="Subir fotos del resultado" />
              )}
            </section>
          )}

          {idea.reference_url && (
            <section className={s.section}>
              <h3>Referencia</h3>
              <EmbedPreview url={idea.reference_url} />
            </section>
          )}

          {(idea.format === 'photo' || idea.ref_files.length > 0) && (
            <section className={s.section}>
              <h3>Fotos de referencia</h3>
              <ImageUploader ownerType="idea_ref" ownerId={idea.id} files={idea.ref_files} invalidate={[ideaKeys.one(id), ideaKeys.all]}
                canEdit={canEdit} canDelete={user.can_delete} />
            </section>
          )}

          <section className={s.section}>
            <h3>Notas</h3>
            <NoteField key={`s-${idea.note_santi}`} idea={idea} field="note_santi" label="Nota de Santi" canEdit={canEdit} />
            <NoteField key={`f-${idea.note_sofi}`} idea={idea} field="note_sofi" label="Nota de Sofi" canEdit={canEdit} />
          </section>

          {can('calendar') && (
            <section className={s.section}>
              <h3>Calendario</h3>
              {idea.calendar_links.length > 0 && (
                <div className={s.badges}>
                  {idea.calendar_links.map((l) => (
                    <Link key={l.id} to={`/calendario/${l.date}`} className={s.tag}><CalendarDays size={14} aria-hidden /> {formatShort(l.date)}</Link>
                  ))}
                </div>
              )}
              {can('calendar', 'edit') && <ScheduleIdea idea={idea} />}
            </section>
          )}

          <Collapsible title="Historial de cambios"><IdeaActivity id={idea.id} /></Collapsible>

          {canEdit && user.can_delete && (
            <Button variant="danger" size="sm" icon={Trash2} onClick={onDelete} loading={del.isPending}>Borrar idea</Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
