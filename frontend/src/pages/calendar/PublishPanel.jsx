import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, PlayCircle, Send, Upload, X } from 'lucide-react';
import { api, fileUrl } from '../../api/client.js';
import { uploadFile, VIDEO_TYPES } from '../../lib/upload.js';
import { toastBus } from '../../state/toastBus.js';
import { CHANNEL_LABELS } from '../../lib/ideaStatus.js';
import { formatShort } from '../../lib/dates.js';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { usePublishing, usePublishItem } from './api.js';
import s from './calendar.module.css';

export const IG_CHANNELS = ['ig_post', 'ig_reel', 'ig_story'];
const MAX = 10;

// Archivos finales que se publican en Instagram (aparte de las previsualizaciones)
export function PublishMedia({ item, canEdit, canDelete }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const confirm = useConfirm();
  const [progress, setProgress] = useState(null);
  const files = item.media ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['calendar'] });

  const upload = useMutation({
    mutationFn: async (list) => {
      try {
        for (const [i, file] of list.entries()) {
          await uploadFile({
            ownerType: 'calendar_media', ownerId: item.id, file, kind: 'igmedia',
            onProgress: (p) => setProgress({ n: i + 1, total: list.length, p }),
          });
        }
      } finally {
        setProgress(null);
        await refresh();
      }
    },
    meta: { success: 'Archivos listos para publicar ✓' },
  });
  const reorder = useMutation({ mutationFn: (ids) => api.patch('/files/order', { ids }), meta: { success: false }, onSettled: refresh });
  const remove = useMutation({ mutationFn: (id) => api.del(`/files/${id}`), meta: { success: 'Archivo borrado' }, onSettled: refresh });

  function onPick(e) {
    const list = [...e.target.files];
    e.target.value = '';
    if (!list.length) return;
    if (files.length + list.length > MAX) {
      toastBus.error(`Máximo ${MAX} archivos por pieza.`);
      return;
    }
    upload.mutate(list);
  }
  function move(i, dir) {
    const ids = files.map((f) => f.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    reorder.mutate(ids);
  }

  if (!canEdit && !files.length) return null;
  return (
    <div className={s.publishMedia}>
      <p className={s.label}>Archivos para publicar</p>
      <div className={s.mediaGrid}>
        {files.map((f, i) => (
          <div key={f.id} className={s.mediaTile}>
            {f.kind === 'video'
              ? <><video src={fileUrl(f.url)} muted playsInline preload="metadata" /><PlayCircle size={28} className={s.mediaPlay} aria-label="Video" /></>
              : <img src={fileUrl(f.url)} alt="" loading="lazy" />}
            <span className={s.mediaNum}>{i + 1}</span>
            {canEdit && (
              <div className={s.mediaTools}>
                {i > 0 && <button type="button" onClick={() => move(i, -1)} aria-label="Mover antes"><ChevronLeft size={14} /></button>}
                {i < files.length - 1 && <button type="button" onClick={() => move(i, 1)} aria-label="Mover después"><ChevronRight size={14} /></button>}
                {canDelete && (
                  <button type="button" aria-label="Borrar archivo"
                    onClick={async () => (await confirm({ title: '¿Borrar este archivo?', confirmLabel: 'Borrar', danger: true })) && remove.mutate(f.id)}>
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {canEdit && files.length < MAX && (
          <button type="button" className={s.mediaAdd} onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Spinner size={22} /> : <Upload size={22} aria-hidden />}
            <span>{upload.isPending ? 'Subiendo…' : 'Subir archivos'}</span>
          </button>
        )}
      </div>
      {progress && progress.p != null && (
        <Progress value={Math.round(progress.p * 100)} max={100} label={`Subiendo ${progress.n} de ${progress.total}: ${Math.round(progress.p * 100)}%`} />
      )}
      {canEdit && (
        <small className="muted">
          Reel: un video. Post: una imagen, un carrusel (hasta 10) o un video. Historias: cada archivo es una historia.
          Con reel y post en la misma pieza, el video va al reel y las imágenes al post. Las imágenes se pasan a JPG solas.
        </small>
      )}
      <input ref={input} type="file" accept={`image/*,${VIDEO_TYPES.join(',')}`} multiple hidden onChange={onPick} />
    </div>
  );
}

function scheduleText(item) {
  if (item.status !== 'ready' || !item.publish_time) return 'Para que se publique solo: poné la hora y marcala como “Listo para publicar”.';
  return `Se publica solo el ${formatShort(item.date)} a las ${item.publish_time} h.`;
}

// Estado de la publicación en cada canal de Instagram, con "Publicar ahora" / "Reintentar"
export function PublishStatus({ item, canEdit }) {
  const { data: publishing } = usePublishing();
  const publish = usePublishItem();
  const confirm = useConfirm();
  const channels = IG_CHANNELS.filter((c) => item.channels.includes(c));
  if (!channels.length) return null;
  const pubs = Object.fromEntries((item.publications ?? []).map((p) => [p.channel, p]));
  const pending = channels.filter((c) => !['published', 'publishing'].includes(pubs[c]?.status));
  const failed = pending.some((c) => pubs[c]?.status === 'failed');

  async function publishNow() {
    const ok = await confirm({
      title: failed ? '¿Reintentar la publicación?' : '¿Publicar ya en Instagram?',
      message: `Se publica en ${pending.map((c) => CHANNEL_LABELS[c]).join(', ')} con el copy y los archivos de la pieza.`,
      confirmLabel: 'Publicar',
    });
    if (ok) publish.mutate(item.id);
  }

  return (
    <div className={s.publishBox}>
      <p className={s.label}>Instagram</p>
      {publishing && !publishing.instagram && <p className="muted">El servidor no está conectado a Meta: por ahora hay que publicar a mano.</p>}
      {channels.map((c) => {
        const p = pubs[c];
        return (
          <div key={c} className={s.pubRow}>
            <strong>{CHANNEL_LABELS[c]}</strong>
            {p?.status === 'published' && (
              <span className={s.pubOk}><CheckCircle2 size={16} aria-hidden /> Publicado{p.permalink && <> · <a href={p.permalink} target="_blank" rel="noreferrer">ver</a></>}</span>
            )}
            {p?.status === 'publishing' && <span className={s.pubMuted}><Spinner size={14} /> Publicando…</span>}
            {p?.status === 'failed' && <span className={s.pubBad}><AlertTriangle size={16} aria-hidden /> Falló: {p.error}</span>}
            {!p && <span className={s.pubMuted}><Clock size={16} aria-hidden /> {scheduleText(item)}</span>}
          </div>
        );
      })}
      {canEdit && publishing?.instagram && pending.length > 0 && (
        <div>
          <Button size="sm" variant={failed ? 'primary' : 'secondary'} icon={Send} loading={publish.isPending} disabled={!(item.media ?? []).length} onClick={publishNow}>
            {failed ? 'Reintentar' : 'Publicar ahora'}
          </Button>
        </div>
      )}
    </div>
  );
}
