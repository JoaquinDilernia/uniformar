import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDraft } from '../../hooks/useDraft.js';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { CATEGORY_LABELS } from '../../lib/ideaStatus.js';
import { useClients, useCreateIdea, useDirectory, useUpdateIdea } from './api.js';
import s from './ideas.module.css';

const EMPTY = { kind: 'idea', format: 'video', category: 'domingo', text: '', client_name: '', assignee_id: '', reference_url: '', due_date: '', note_sofi: '' };

const toForm = (i) => ({
  kind: i.kind, format: i.format, category: i.category, text: i.text, client_name: i.client_name ?? '',
  assignee_id: i.assignee_id ?? '', reference_url: i.reference_url ?? '', due_date: i.due_date ?? '',
});

function toBody(f, isNew) {
  const nul = (v) => (v === '' ? null : v);
  return {
    kind: f.kind, format: f.format, category: f.category, text: f.text,
    client_name: f.category === 'viernes' ? nul(f.client_name.trim()) : null,
    assignee_id: nul(f.assignee_id), reference_url: nul(f.reference_url.trim()),
    due_date: f.kind === 'must' ? nul(f.due_date) : null,
    ...(isNew ? { note_sofi: nul(f.note_sofi) } : {}),
  };
}

// Formulario de alta y edición. formId permite que el botón de guardar viva en el pie de la hoja.
export function IdeaForm({ formId, initial, onSaved, onPendingChange }) {
  const isNew = !initial;
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const { data: users = [] } = useDirectory();
  const [form, setForm, clearDraft] = useDraft(isNew ? 'idea-new' : `idea-${initial.id}`, isNew ? EMPTY : toForm(initial));
  const [errors, setErrors] = useState({});
  const create = useCreateIdea();
  const update = useUpdateIdea(initial?.id, { success: 'Cambios guardados ✓' });
  const pending = create.isPending || update.isPending;
  useEffect(() => { onPendingChange?.(pending); }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  // Por defecto las ideas nuevas son para Santi (el que graba)
  useEffect(() => {
    if (isNew && !form.assignee_id) {
      const santi = users.find((u) => u.name.toLowerCase().startsWith('santi'));
      if (santi) setForm((f) => ({ ...f, assignee_id: santi.id }));
    }
  }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    if (!form.text.trim()) return setErrors({ text: 'Escribí la idea' });
    setErrors({});
    const body = toBody(form, isNew);
    const opts = { onError: (err) => setErrors(err.fields ?? {}) };
    if (isNew) {
      create.mutate(body, { ...opts, onSuccess: (idea) => { clearDraft(); navigate(`/ideas/${idea.id}`, { replace: true }); } });
    } else {
      update.mutate(body, { ...opts, onSuccess: () => { clearDraft(); onSaved?.(); } });
    }
  }

  return (
    <form id={formId} className={s.form} onSubmit={onSubmit} noValidate>
      <Segmented label="Tipo" value={form.kind} onChange={set('kind')} options={[{ value: 'idea', label: '💡 Idea' }, { value: 'must', label: '📌 Sí o sí' }]} />
      <p className={s.formHelp}>{form.kind === 'idea' ? 'Santi decide si la hace.' : 'Contenido obligatorio: va directo a "por hacer".'}</p>
      <Segmented label="Formato" value={form.format} onChange={set('format')} options={[{ value: 'video', label: '🎬 Video' }, { value: 'photo', label: '📷 Foto' }]} />
      <Field label="Tipo de contenido">
        <Select value={form.category} onChange={set('category')}>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      {form.category === 'viernes' && (
        <Field label="Cliente" hint="Elegí uno de la lista o escribí uno nuevo.">
          <Input list="clients-list" value={form.client_name} onChange={set('client_name')} placeholder="Ej.: Estudio Wonder" autoComplete="off" />
        </Field>
      )}
      <datalist id="clients-list">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <Field label="Idea" required error={errors.text}>
        <Textarea value={form.text} onChange={set('text')} minRows={4} placeholder="¿Qué hay que grabar o fotografiar? Contalo con todo el detalle que quieras." />
      </Field>
      <Field label="Asignada a">
        <Select value={form.assignee_id} onChange={set('assignee_id')}>
          <option value="">Sin asignar</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Link de referencia" hint="Reel de IG, TikTok, Pinterest…" error={errors.reference_url}>
        <Input type="url" inputMode="url" value={form.reference_url} onChange={set('reference_url')} placeholder="https://" />
      </Field>
      {form.kind === 'must' && (
        <Field label="Fecha límite" error={errors.due_date}>
          <Input type="date" value={form.due_date} onChange={set('due_date')} />
        </Field>
      )}
      {isNew && (
        <Field label="Nota de Sofi (opcional)">
          <Textarea value={form.note_sofi} onChange={set('note_sofi')} minRows={2} />
        </Field>
      )}
      {isNew && form.format === 'photo' && <p className={s.formHelp}>Las fotos de referencia se suben después de guardar.</p>}
    </form>
  );
}
