import { useState } from 'react';
import { Inbox, Star, MessageCircle, Check, X, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Field, Select, Textarea } from '../../components/ui/Field.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { useAuth } from '../../state/auth.jsx';
import { can } from '../../lib/permissions.js';
import { when } from '../ads/format.js';
import { useDeleteReview, usePatchQuote, useQuotes, useReviews, useSetReviewStatus, useWebSummary } from './api.js';
import s from './web.module.css';

export const QUOTE_STATUS = { new: 'Nuevo', contacted: 'Contactado', won: 'Vendido', lost: 'No avanzó' };
const REVIEW_STATUS = { pending: 'Por aprobar', approved: 'Publicada', rejected: 'Rechazada' };

// Link a WhatsApp con el teléfono que dejó la persona (sin código de país se asume celular de Argentina: 549)
export const waLink = (phone) => {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.length < 8) return null;
  if (d.startsWith('0')) d = d.slice(1);
  if (!d.startsWith('54')) d = `549${d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2')}`;
  return `https://wa.me/${d}`;
};

export function WebPage() {
  const [tab, setTab] = useState('quotes');
  const summary = useWebSummary();
  const n = summary.data ?? {};
  return (
    <>
      <PageHeader title="Admin web" subtitle="Lo que llega desde uniformar.ar" />
      <div className={s.page}>
        <Segmented label="Sección" value={tab} onChange={setTab} options={[
          { value: 'quotes', label: `Presupuestos${n.new_quotes ? ` · ${n.new_quotes} nuevos` : ''}` },
          { value: 'reviews', label: `Reseñas${n.pending_reviews ? ` · ${n.pending_reviews} por aprobar` : ''}` },
        ]} />
        {tab === 'quotes' ? <Quotes /> : <Reviews />}
      </div>
    </>
  );
}

function Quotes() {
  const { user } = useAuth();
  const canEdit = can(user, 'web', 'edit');
  const [status, setStatus] = useState('new');
  const q = useQuotes(status === 'all' ? undefined : status);
  const list = q.data ?? [];
  return (
    <section className={s.card}>
      <Segmented label="Estado" value={status} onChange={setStatus} options={[
        { value: 'new', label: 'Nuevos' }, { value: 'contacted', label: 'Contactados' },
        { value: 'won', label: 'Vendidos' }, { value: 'lost', label: 'No avanzaron' }, { value: 'all', label: 'Todos' },
      ]} />
      {q.isLoading && <Spinner size={20} />}
      {!q.isLoading && list.length === 0 && (
        <EmptyState icon={Inbox} title="No hay presupuestos acá">Los pedidos del formulario "Cotizá" de la web aparecen en esta lista.</EmptyState>
      )}
      {list.map((item) => <QuoteCard key={item.id} q={item} canEdit={canEdit} />)}
    </section>
  );
}

function QuoteCard({ q, canEdit }) {
  const patch = usePatchQuote();
  const [note, setNote] = useState(q.note ?? '');
  const wa = waLink(q.phone);
  return (
    <article className={s.item}>
      <div className={s.head}>
        <div className={s.grow}>
          <h3>{q.name}{q.company && <span className={s.muted}> · {q.company}</span>}</h3>
          <small>{when(q.created_at)}{q.updated_by_name && ` · último cambio: ${q.updated_by_name}`}</small>
        </div>
        <span className={`${s.badge} ${s[q.status]}`}>{QUOTE_STATUS[q.status]}</span>
      </div>
      <dl className={s.facts}>
        {q.phone && <><dt>Teléfono</dt><dd>{q.phone}</dd></>}
        {q.rubro && <><dt>Rubro</dt><dd>{q.rubro}</dd></>}
        {q.quantity && <><dt>Cantidad</dt><dd>{q.quantity}</dd></>}
      </dl>
      {q.message && <p className={s.msg}>{q.message}</p>}
      {canEdit && (
        <div className={s.edit}>
          <Field label="Estado del pedido">
            <Select value={q.status} disabled={patch.isPending} onChange={(e) => patch.mutate({ id: q.id, status: e.target.value })}>
              {Object.entries(QUOTE_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Nota interna">
            <Textarea value={note} minRows={1} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className={s.actions}>
            <Button size="sm" variant="secondary" disabled={note === (q.note ?? '') || patch.isPending} onClick={() => patch.mutate({ id: q.id, note })}>Guardar nota</Button>
            {wa && <a className={s.link} href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden /> Abrir WhatsApp</a>}
          </div>
        </div>
      )}
      {!canEdit && q.note && <p className={s.note}>{q.note}</p>}
    </article>
  );
}

function Reviews() {
  const { user } = useAuth();
  const canEdit = can(user, 'web', 'edit');
  const [status, setStatus] = useState('pending');
  const r = useReviews(status);
  const list = r.data ?? [];
  return (
    <section className={s.card}>
      <Segmented label="Estado" value={status} onChange={setStatus} options={Object.entries(REVIEW_STATUS).map(([value, label]) => ({ value, label }))} />
      {r.isLoading && <Spinner size={20} />}
      {!r.isLoading && list.length === 0 && (
        <EmptyState icon={Star} title={status === 'pending' ? 'No hay reseñas para aprobar' : 'No hay reseñas acá'}>
          Los clientes dejan su reseña en la web y solo se publica cuando la aprueban acá.
        </EmptyState>
      )}
      {list.map((item) => <ReviewCard key={item.id} r={item} canEdit={canEdit} canDelete={!!user.can_delete} />)}
    </section>
  );
}

function ReviewCard({ r, canEdit, canDelete }) {
  const setStatus = useSetReviewStatus();
  const del = useDeleteReview();
  const confirm = useConfirm();
  const busy = setStatus.isPending || del.isPending;
  async function remove() {
    const ok = await confirm({ title: '¿Borrar la reseña?', message: 'Se borra para siempre y no se puede recuperar.', confirmLabel: 'Borrar' });
    if (ok) del.mutate(r.id);
  }
  return (
    <article className={s.item}>
      <div className={s.head}>
        <div className={s.grow}>
          <h3>{r.name}{r.company && <span className={s.muted}> · {r.company}</span>}</h3>
          <small>{when(r.created_at)}{r.reviewed_by_name && ` · revisó ${r.reviewed_by_name}`}</small>
        </div>
        <span className={s.stars} role="img" aria-label={`${r.rating} de 5 estrellas`}>{'★'.repeat(r.rating)}<span className={s.off}>{'★'.repeat(5 - r.rating)}</span></span>
      </div>
      <p className={s.msg}>{r.text}</p>
      {canEdit && (
        <div className={s.actions}>
          {r.status !== 'approved' && <Button size="sm" icon={Check} disabled={busy} onClick={() => setStatus.mutate({ id: r.id, status: 'approved' })}>Aprobar y publicar</Button>}
          {r.status === 'approved' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStatus.mutate({ id: r.id, status: 'pending' })}>Sacar de la web</Button>}
          {r.status !== 'rejected' && <Button size="sm" variant="ghost" icon={X} disabled={busy} onClick={() => setStatus.mutate({ id: r.id, status: 'rejected' })}>Rechazar</Button>}
          {canDelete && <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={remove}>Borrar</Button>}
        </div>
      )}
    </article>
  );
}
