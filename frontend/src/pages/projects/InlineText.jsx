import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useDraft } from '../../hooks/useDraft.js';
import { useUpdateProject } from './api.js';
import s from './projects.module.css';

const hasStoredDraft = (draftKey, value) => {
  try {
    const raw = localStorage.getItem(`uf:draft:${draftKey}`);
    return raw ? JSON.parse(raw)?.text !== (value ?? '') && typeof JSON.parse(raw)?.text === 'string' : false;
  } catch {
    return false;
  }
};

// Texto largo que se ve completo y se edita en el lugar (con borrador local por si se corta la sesión).
// Cada campo tiene su propia mutación, así dos guardados seguidos no se pisan.
export function InlineText({ draftKey, projectId, field, label, value, canEdit, placeholder }) {
  const update = useUpdateProject(projectId);
  const [recovered] = useState(() => hasStoredDraft(draftKey, value));
  const [editing, setEditing] = useState(recovered);
  const [draft, setDraft, clear] = useDraft(draftKey, { text: value ?? '' });
  const saving = update.isPending;
  const start = () => { setDraft({ text: value ?? '' }); setEditing(true); };
  const close = () => { clear(); setEditing(false); };

  function save() {
    if (saving) return;
    update.mutate({ [field]: draft.text }, { onSuccess: close });
  }

  return (
    <section className={s.block} aria-label={label}>
      <div className={s.blockHead}>
        <h2>{label}</h2>
        {canEdit && !editing && <Button variant="ghost" size="sm" icon={Pencil} onClick={start}>Editar</Button>}
      </div>
      {editing ? (
        <>
          {recovered && <p className="muted">Recuperamos lo que estabas escribiendo.</p>}
          <Textarea aria-label={label} value={draft.text} onChange={(e) => setDraft({ text: e.target.value })} minRows={4} autoFocus />
          <div className={s.blockActions}>
            <Button variant="secondary" size="sm" disabled={saving} onClick={close}>Cancelar</Button>
            <Button size="sm" loading={saving} onClick={save}>Guardar</Button>
          </div>
        </>
      ) : value ? (
        <p className="prewrap">{value}</p>
      ) : (
        <p className="muted">{placeholder}</p>
      )}
    </section>
  );
}
