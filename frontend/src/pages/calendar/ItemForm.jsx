import { useState } from 'react';
import { useDraft } from '../../hooks/useDraft.js';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { Chip, ChipGroup } from '../../components/ui/Chip.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { CHANNELS, CHANNEL_LABELS, CALENDAR_STATUS_LABELS, IDEA_STATUS_LABELS, IDEA_STATUS_ORDER } from '../../lib/ideaStatus.js';
import { useIdeas } from '../ideas/api.js';
import { useCreateItem, useUpdateItem } from './api.js';
import s from './calendar.module.css';

const IG_COPY_MAX = 2200;
const toForm = (i) => ({ title: i.title, channels: i.channels, status: i.status, idea_id: i.idea_id ?? '', copy: i.copy ?? '', piece_url: i.piece_url ?? '', refs: i.refs ?? '' });

export function ItemForm({ date, item, defaultChannels = [], onDone, onCancel }) {
  const isNew = !item;
  const { data: ideas = [] } = useIdeas();
  const [form, setForm, clearDraft] = useDraft(isNew ? `cal-new-${date}` : `cal-${item.id}`,
    isNew ? { title: '', channels: defaultChannels, status: 'draft', idea_id: '', copy: '', piece_url: '', refs: '' } : toForm(item));
  const [errors, setErrors] = useState({});
  const create = useCreateItem();
  const update = useUpdateItem();
  const pending = create.isPending || update.isPending;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const toggleChannel = (c) => setForm((f) => ({ ...f, channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c] }));
  const linkable = ideas.filter((i) => i.status !== 'no_se_hace');

  function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    const nul = (v) => (v.trim() === '' ? null : v);
    const body = { title: form.title.trim(), channels: CHANNELS.filter((c) => form.channels.includes(c)), status: form.status, idea_id: form.idea_id || null, copy: nul(form.copy), piece_url: nul(form.piece_url.trim()), refs: nul(form.refs) };
    const opts = { onError: (err) => setErrors(err.fields ?? {}), onSuccess: (saved) => { clearDraft(); onDone?.(saved); } };
    if (isNew) create.mutate({ date, ...body }, opts);
    else update.mutate({ id: item.id, patch: body }, opts);
  }

  return (
    <form className={s.form} onSubmit={onSubmit} noValidate>
      <Field label="¿Qué se sube?" error={errors.title}>
        <Textarea minRows={2} value={form.title} onChange={set('title')} placeholder="Ej.: Reel de la entrega a POSTA" />
      </Field>
      <div>
        <p className={s.label}>Dónde se publica</p>
        <ChipGroup label="Canales">
          {CHANNELS.map((c) => <Chip key={c} selected={form.channels.includes(c)} onClick={() => toggleChannel(c)}>{CHANNEL_LABELS[c]}</Chip>)}
        </ChipGroup>
      </div>
      <div>
        <p className={s.label}>Estado</p>
        <Segmented label="Estado" value={form.status} onChange={set('status')} options={Object.entries(CALENDAR_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
      </div>
      <Field label="Idea vinculada">
        <Select value={form.idea_id} onChange={set('idea_id')}>
          <option value="">— Ninguna —</option>
          {IDEA_STATUS_ORDER.filter((st) => st !== 'no_se_hace').map((st) => {
            const group = linkable.filter((i) => i.status === st);
            return group.length ? (
              <optgroup key={st} label={IDEA_STATUS_LABELS[st]}>
                {group.map((i) => <option key={i.id} value={i.id}>{i.text.split('\n')[0].slice(0, 80)}</option>)}
              </optgroup>
            ) : null;
          })}
        </Select>
      </Field>
      <Field label="Copy del posteo" hint={`${form.copy.length} / ${IG_COPY_MAX} caracteres`} error={form.copy.length > IG_COPY_MAX ? 'Instagram admite hasta 2.200 caracteres' : errors.copy}>
        <Textarea minRows={3} value={form.copy} onChange={set('copy')} />
      </Field>
      <Field label="Link de la pieza terminada" hint="Lo carga Santi cuando está lista (Drive, etc.)." error={errors.piece_url}>
        <Input type="url" inputMode="url" value={form.piece_url} onChange={set('piece_url')} placeholder="https://" />
      </Field>
      <Field label="Referencias" hint="Un link por línea.">
        <Textarea minRows={2} value={form.refs} onChange={set('refs')} />
      </Field>
      <div className={s.formActions}>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" loading={pending}>{isNew ? 'Guardar pieza' : 'Guardar cambios'}</Button>
      </div>
    </form>
  );
}
