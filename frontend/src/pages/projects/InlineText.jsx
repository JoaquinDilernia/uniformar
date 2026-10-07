import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Textarea } from '../../components/ui/Field.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useDraft } from '../../hooks/useDraft.js';
import s from './projects.module.css';

// Texto largo que se ve completo y se edita en el lugar (con borrador local por si se corta la sesión)
export function InlineText({ draftKey, label, value, onSave, canEdit, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft, clear] = useDraft(draftKey, { text: value ?? '' });
  const start = () => { setDraft({ text: value ?? '' }); setEditing(true); };
  const close = () => { clear(); setEditing(false); };

  function save() {
    if (saving) return;
    setSaving(true);
    onSave(draft.text, { onSuccess: close, onSettled: () => setSaving(false) });
  }

  return (
    <section className={s.block} aria-label={label}>
      <div className={s.blockHead}>
        <h2>{label}</h2>
        {canEdit && !editing && <Button variant="ghost" size="sm" icon={Pencil} onClick={start}>Editar</Button>}
      </div>
      {editing ? (
        <>
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
