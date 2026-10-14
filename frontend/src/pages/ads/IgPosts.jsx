import { useState } from 'react';
import { AlertTriangle, Instagram } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Field, Select } from '../../components/ui/Field.jsx';
import { usePromoteIgPost, useIgPosts } from './api.js';
import s from './ads.module.css';

const TYPE_LABEL = { reel: 'Reel', carousel: 'Carrusel', post: 'Post' };
const num = (n) => n.toLocaleString('es-AR');
const day = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

// Posts y reels ya publicados en @uniform.ar, para promocionarlos como anuncio
export function IgPosts({ snapshot, canEdit }) {
  const posts = useIgPosts();
  const [promoting, setPromoting] = useState(null);

  return (
    <section className={s.card}>
      <div className={s.cardHead}><h2><Instagram size={18} aria-hidden /> Posts de Instagram</h2></div>
      {posts.isLoading && <Spinner size={20} />}
      {posts.error && <div className={s.alert}><AlertTriangle size={18} aria-hidden /> {posts.error.message}</div>}
      {posts.data?.length === 0 && <p className="muted">No hay posts en la cuenta.</p>}
      <div className={s.grid}>
        {(posts.data ?? []).map((p) => (
          <article key={p.id} className={s.piece}>
            {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <div className={s.noImg}>Sin vista previa</div>}
            <div className={s.pieceBody}>
              <div className={s.row}><span className={s.kind}>{TYPE_LABEL[p.type]}</span><small className={s.grow}>{day(p.timestamp)}</small></div>
              <p className={s.copy}>{p.caption}</p>
              <small>
                {num(p.likes)} me gusta · {num(p.comments)} comentarios{p.reach != null ? ` · ${num(p.reach)} de alcance` : ''}
              </small>
              {p.promotedIn.map((x) => <span key={x.adset_id} className={`${s.badge} ${s.ok}`}>Promocionado en {x.adset_name || x.adset_id}</span>)}
              <div className={s.actions}>
                {canEdit && <Button size="sm" disabled={!snapshot} onClick={() => setPromoting(p)}>Promocionar</Button>}
                <a className={s.link} href={p.permalink} target="_blank" rel="noreferrer">Ver en Instagram</a>
              </div>
            </div>
          </article>
        ))}
      </div>
      {promoting && <Promote post={promoting} snapshot={snapshot} onClose={() => setPromoting(null)} />}
    </section>
  );
}

function Promote({ post, snapshot, onClose }) {
  const promote = usePromoteIgPost();
  const already = new Set(post.promotedIn.map((x) => x.adset_id));
  const adsets = (snapshot?.adsets ?? []).filter((a) => !already.has(a.id));
  const [adsetId, setAdsetId] = useState(adsets[0]?.id ?? '');
  const adset = adsets.find((a) => a.id === adsetId);
  const submit = () => promote.mutate({ id: post.id, adset_id: adsetId, adset_name: adset?.name ?? '', permalink: post.permalink }, { onSuccess: onClose });
  return (
    <Sheet open onClose={onClose} title={`Promocionar ${TYPE_LABEL[post.type].toLowerCase()}`}
      footer={<Button full loading={promote.isPending} disabled={!adsetId} onClick={submit}>Promocionar en Meta</Button>}>
      <div className={s.form}>
        <p className={s.copy}>{post.caption}</p>
        {adsets.length === 0
          ? <p className="muted">Ya está promocionado en todos los conjuntos.</p>
          : (
            <Field label="Conjunto" hint="Se usa el post original con botón de WhatsApp. El anuncio queda activo dentro del conjunto: si el conjunto o la campaña están pausados, no gasta.">
              <Select value={adsetId} onChange={(e) => setAdsetId(e.target.value)}>
                {adsets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
      </div>
    </Sheet>
  );
}
