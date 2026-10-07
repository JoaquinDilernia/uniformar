import { useState } from 'react';
import { Plus, Trash2, ChevronDown, CalendarDays } from 'lucide-react';
import { useAuth, useCan } from '../../state/auth.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { ImageUploader } from '../../components/media/ImageUploader.jsx';
import { EmbedPreview } from '../../components/media/EmbedPreview.jsx';
import { CHANNEL_LABELS } from '../../lib/ideaStatus.js';
import { formatLong } from '../../lib/dates.js';
import { presetForChannels } from '../../lib/sizes.js';
import { ItemForm } from './ItemForm.jsx';
import { PreviewMockup } from './PreviewMockup.jsx';
import { useDeleteItem } from './api.js';
import s from './calendar.module.css';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function ItemCard({ item, open, onToggle, canEdit, canDelete }) {
  const del = useDeleteItem();
  const confirm = useConfirm();
  return (
    <article className={s.item}>
      <button type="button" className={s.itemHead} onClick={onToggle} aria-expanded={open}>
        <span className={s.itemTitles}>
          <strong>{item.title || 'Sin título'}</strong>
          <span className="muted">{item.channels.map((c) => CHANNEL_LABELS[c]).join(' · ') || 'Sin canales'}</span>
        </span>
        <StatusBadge kind="calendar" status={item.status} />
        <ChevronDown size={18} className={open ? s.rot : ''} aria-hidden />
      </button>
      {open && (
        <div className={s.itemBody}>
          {item.previews.length > 0 && <PreviewMockup files={item.previews} channels={item.channels} copy={item.copy} />}
          <ImageUploader ownerType="calendar_preview" ownerId={item.id} files={item.previews} invalidate={[['calendar']]}
            canEdit={canEdit} canDelete={canDelete} preset={presetForChannels(item.channels)} label="Subir previsualización" max={10} />
          {item.piece_url && !canEdit && <EmbedPreview url={item.piece_url} />}
          {canEdit ? <ItemForm item={item} /> : (
            <div className={s.readonly}>
              {item.idea && <p><strong>Idea:</strong> {item.idea.text}</p>}
              {item.copy && <p className="prewrap">{item.copy}</p>}
              {item.refs && <p className="prewrap muted">{item.refs}</p>}
            </div>
          )}
          {canEdit && canDelete && (
            <Button variant="danger" size="sm" icon={Trash2} loading={del.isPending}
              onClick={async () => (await confirm({ title: '¿Borrar esta pieza?', confirmLabel: 'Borrar', danger: true })) && del.mutate(item.id)}>
              Borrar pieza
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

export function DaySheet({ date, items, rules, rulesReady = true, onClose }) {
  const canEdit = useCan()('calendar', 'edit');
  const { user } = useAuth();
  // null = automático: sin piezas, el alta arranca abierta (aunque la sesión llegue después del primer render)
  const [addingOverride, setAdding] = useState(null);
  const adding = addingOverride ?? (items.length === 0 && canEdit);
  const [openOverride, setOpenId] = useState(undefined);
  const openId = openOverride === undefined ? (items.length === 1 ? items[0].id : null) : openOverride;

  return (
    <Sheet open onClose={onClose} title={cap(formatLong(date))} size="lg">
      <div className={s.day}>
        {rules.length > 0 && (
          <div className={s.ruleBox}>
            {rules.map((r) => (
              <p key={`${r.weekday}-${r.theme}`}>
                <strong>Grilla fija:</strong> {[r.theme, r.format, r.channels.map((c) => CHANNEL_LABELS[c]).join(' + ')].filter(Boolean).join(' · ')}{r.time ? ` · ${r.time} h` : ''}
              </p>
            ))}
          </div>
        )}
        {items.map((item) => (
          <ItemCard key={item.id} item={item} open={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)}
            canEdit={canEdit} canDelete={Boolean(user?.can_delete)} />
        ))}
        {items.length === 0 && !adding && <EmptyState icon={CalendarDays} title="Nada cargado para este día" />}
        {canEdit && (adding ? (
          <div className={s.item}>
            <div className={s.itemBody}>
              {!rulesReady ? <Spinner /> : <ItemForm date={date} defaultChannels={rules[0]?.channels ?? []} onDone={(saved) => { setAdding(false); setOpenId(saved.id); }} onCancel={items.length ? () => setAdding(false) : undefined} />}
            </div>
          </div>
        ) : (
          <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>Agregar pieza</Button>
        ))}
      </div>
    </Sheet>
  );
}
