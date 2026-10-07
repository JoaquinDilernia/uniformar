import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Merge } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../state/auth.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Chip, ChipGroup } from '../components/ui/Chip.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { useConfirm } from '../components/ui/ConfirmDialog.jsx';
import { CHANNELS, CHANNEL_LABELS } from '../lib/ideaStatus.js';
import { useRules } from './calendar/api.js';
import { useClients } from './ideas/api.js';
import s from './settings.module.css';
import p from './pages.module.css';

const WEEKDAYS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];
const blankRule = () => ({ weekday: 1, time: '', theme: '', format: '', channels: [], active: true });
const toDraft = (list) => list.map((r) => ({ ...r, time: r.time ?? '', format: r.format ?? '' }));

function RulesEditor() {
  const qc = useQueryClient();
  const { data, isError, refetch } = useRules();
  const [rules, setRules] = useState(null);
  const [errors, setErrors] = useState({});
  useEffect(() => { if (data && !rules) setRules(toDraft(data)); }, [data, rules]);
  const save = useMutation({
    mutationFn: (list) => api.put('/settings/content-rules', { rules: list }).then((r) => r.rules),
    meta: { success: 'Grilla guardada ✓' },
    onSuccess: (saved) => { setRules(toDraft(saved)); qc.invalidateQueries({ queryKey: ['rules'] }); qc.invalidateQueries({ queryKey: ['home'] }); },
    onError: (err) => setErrors(err.fields ?? {}),
  });
  if (!rules) {
    if (isError) {
      return (
        <section className={s.card}>
          <h2>Grilla fija de publicaciones</h2>
          <p>No pudimos cargar la grilla.</p>
          <div><Button onClick={() => refetch()}>Reintentar</Button></div>
        </section>
      );
    }
    return <section className={s.card}><Spinner size={24} label="Cargando" /></section>;
  }
  const update = (i, patch) => setRules((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toggle = (i, c) => update(i, { channels: rules[i].channels.includes(c) ? rules[i].channels.filter((x) => x !== c) : [...rules[i].channels, c] });

  function onSave() {
    if (save.isPending) return;
    const missing = rules.findIndex((r) => !r.theme.trim());
    if (missing >= 0) return setErrors({ [`rules.${missing}.theme`]: 'Poné la temática' });
    setErrors({});
    save.mutate(rules.map((r) => ({ weekday: Number(r.weekday), time: r.time || null, theme: r.theme.trim(), format: r.format.trim(), channels: CHANNELS.filter((c) => r.channels.includes(c)), active: r.active })));
  }

  return (
    <section className={s.card}>
      <h2>Grilla fija de publicaciones</h2>
      <p className="muted">Lo que se publica cada semana. Se marca en el calendario y en el Inicio.</p>
      {rules.map((r, i) => (
        <div key={i} className={s.rule}>
          <div className={s.ruleRow}>
            <Field label="Día"><Select value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}>{WEEKDAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Hora" error={errors[`rules.${i}.time`]}><Input type="time" value={r.time} onChange={(e) => update(i, { time: e.target.value })} /></Field>
          </div>
          <Field label="Temática" error={errors[`rules.${i}.theme`]}><Input value={r.theme} onChange={(e) => update(i, { theme: e.target.value })} /></Field>
          <Field label="Formato"><Input value={r.format} onChange={(e) => update(i, { format: e.target.value })} placeholder="Ej.: Reel, 1–2 historias" /></Field>
          <ChipGroup label={`Canales de la regla ${i + 1}`}>
            {CHANNELS.map((c) => <Chip key={c} selected={r.channels.includes(c)} onClick={() => toggle(i, c)}>{CHANNEL_LABELS[c]}</Chip>)}
          </ChipGroup>
          <div className={s.ruleFoot}>
            <label className={s.switch}><input type="checkbox" checked={r.active} onChange={(e) => update(i, { active: e.target.checked })} /> Activa</label>
            <IconButton icon={Trash2} label="Quitar" onClick={() => setRules((list) => list.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
      <div className={s.actions}>
        <Button variant="secondary" icon={Plus} onClick={() => setRules((list) => [...list, blankRule()])}>Agregar día</Button>
        <Button onClick={onSave} loading={save.isPending} disabled={save.isPending}>Guardar grilla</Button>
      </div>
    </section>
  );
}

function ClientsEditor() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const confirm = useConfirm();
  const { data: clients = [], isError, refetch } = useClients();
  const [names, setNames] = useState({});
  const [mergeFrom, setMergeFrom] = useState(null);
  const [mergeInto, setMergeInto] = useState('');
  const refresh = () => Promise.all([['clients'], ['ideas']].map((k) => qc.invalidateQueries({ queryKey: k })));
  const clearName = (id) => setNames((n) => { const rest = { ...n }; delete rest[id]; return rest; });
  const rename = useMutation({
    mutationFn: ({ id, name }) => api.patch(`/clients/${id}`, { name }),
    meta: { success: 'Cliente renombrado ✓' },
    onError: (_e, { id }) => clearName(id),
    onSettled: refresh,
  });
  const merge = useMutation({ mutationFn: ({ id, into }) => api.post(`/clients/${id}/merge`, { into_id: into }), meta: { success: 'Clientes unificados ✓' }, onSettled: refresh });
  const canMerge = Boolean(user?.can_delete);

  async function onMerge() {
    if (merge.isPending || !mergeFrom || !mergeInto) return;
    const ok = await confirm({ title: '¿Unificar clientes?', message: `Las ideas de "${mergeFrom.name}" pasan al otro y "${mergeFrom.name}" se borra.`, confirmLabel: 'Unificar' });
    if (ok) merge.mutate({ id: mergeFrom.id, into: mergeInto }, { onSuccess: () => setMergeFrom(null) });
  }

  return (
    <section className={s.card}>
      <h2>Clientes (para los viernes)</h2>
      <p className="muted">Si un cliente quedó cargado dos veces con distinto nombre, unificalos.</p>
      {isError && clients.length === 0 && (
        <div><p>No pudimos cargar los clientes.</p><Button onClick={() => refetch()}>Reintentar</Button></div>
      )}
      {!isError && clients.length === 0 && <p className="muted">Todavía no hay clientes. Se crean solos al cargar una idea de viernes.</p>}
      {clients.map((c) => (
        <div key={c.id} className={s.client}>
          <Input aria-label={`Nombre de ${c.name}`} value={names[c.id] ?? c.name} disabled={rename.isPending && rename.variables?.id === c.id} onChange={(e) => setNames((n) => ({ ...n, [c.id]: e.target.value }))}
            onBlur={() => { if (rename.isPending) return; const v = (names[c.id] ?? c.name).trim(); if (v && v !== c.name) rename.mutate({ id: c.id, name: v }); else clearName(c.id); }} />
          <span className="muted">{c.idea_count} ideas</span>
          {canMerge && <IconButton icon={Merge} label={`Unificar ${c.name}`} onClick={() => { setMergeFrom(c); setMergeInto(''); }} />}
        </div>
      ))}
      {mergeFrom && (
        <div className={s.merge}>
          <p>Unificar <strong>{mergeFrom.name}</strong> dentro de:</p>
          <Select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} aria-label="Cliente destino">
            <option value="">Elegí un cliente</option>
            {clients.filter((c) => c.id !== mergeFrom.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className={s.actions}>
            <Button variant="secondary" onClick={() => setMergeFrom(null)} disabled={merge.isPending}>Cancelar</Button>
            <Button disabled={!mergeInto || merge.isPending} loading={merge.isPending} onClick={onMerge}>Unificar</Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className={`${p.page} ${s.stack}`}>
        <RulesEditor />
        <ClientsEditor />
      </div>
    </>
  );
}
