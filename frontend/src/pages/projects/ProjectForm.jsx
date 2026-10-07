import { useState } from 'react';
import { Field, Input, Select } from '../../components/ui/Field.jsx';

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' }, { value: 'proposal', label: 'Propuesta' },
  { value: 'upcoming', label: 'Próximo' }, { value: 'done', label: 'Terminado' },
];

// Datos básicos del proyecto (alta y edición). Los textos largos se editan en el detalle.
export function ProjectForm({ formId, initial, onSubmit }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '', status: initial?.status ?? 'active',
    start_date: initial?.start_date ?? '', end_date: initial?.end_date ?? '',
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setErrors({ name: 'Poné un nombre' });
    if (form.start_date && form.end_date && form.end_date < form.start_date) return setErrors({ end_date: 'No puede ser anterior al inicio' });
    setErrors({});
    onSubmit({ name: form.name.trim(), status: form.status, start_date: form.start_date || null, end_date: form.end_date || null }, (err) => setErrors(err.fields ?? {}));
  }

  return (
    <form id={formId} onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <Field label="Nombre" required error={errors.name}><Input value={form.name} onChange={set('name')} placeholder="Ej.: Rediseño de la web" /></Field>
      <Field label="Estado"><Select value={form.status} onChange={set('status')}>{STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
      <Field label="Inicio" error={errors.start_date}><Input type="date" value={form.start_date} onChange={set('start_date')} /></Field>
      <Field label="Cierre estimado" error={errors.end_date}><Input type="date" value={form.end_date} onChange={set('end_date')} /></Field>
    </form>
  );
}
