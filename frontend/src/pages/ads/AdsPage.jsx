import { useState } from 'react';
import { AlertTriangle, Check, ImagePlus, Lightbulb, Megaphone, Pause, Play, RefreshCw, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../state/auth.jsx';
import { can } from '../../lib/permissions.js';
import { fileUrl } from '../../api/client.js';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Field, Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import {
  useAdsOverview, useArchiveCreative, useCloseRequest, useCreateCreative, useCreatives, useDecide, useDecisions,
  useDeleteLearning, useLearnings, usePublishCreative, useRefreshMeta, useRequests, useSaveAdSettings, useSetStatus, useStartRun,
} from './api.js';
import s from './ads.module.css';

const ars = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`);
const when = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

const STATUS_LABEL = {
  ACTIVE: 'Activo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campaña pausada', ADSET_PAUSED: 'Conjunto pausado',
  IN_PROCESS: 'En revisión', PENDING_REVIEW: 'En revisión', DISAPPROVED: 'Rechazado', WITH_ISSUES: 'Con problemas',
};
const TONE = { ACTIVE: s.ok, PAUSED: s.muted, CAMPAIGN_PAUSED: s.muted, ADSET_PAUSED: s.muted, DISAPPROVED: s.bad, WITH_ISSUES: s.bad };
const TOOL_LABEL = {
  pause_ad: 'Pausar anuncio', set_status: 'Activar / pausar', propose_budget_change: 'Presupuesto', propose_adset: 'Conjunto nuevo', create_ad: 'Publicar pieza',
};
const DECISION_LABEL = { pending: 'Pendiente', executed: 'Hecho', rejected: 'Rechazado', failed: 'Falló' };

function Badge({ status }) {
  return <span className={`${s.badge} ${TONE[status] ?? ''}`}>{STATUS_LABEL[status] ?? status}</span>;
}

// El informe del agente viene en texto con **negritas**: lo mostramos respetando saltos de línea
function Report({ text }) {
  return (
    <div className={s.report}>
      {text.split('\n').map((line, i) => (
        <p key={i}>{line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith('**') && part.endsWith('**')
          ? <strong key={j}>{part.slice(2, -2)}</strong> : part))}</p>
      ))}
    </div>
  );
}

export function AdsPage() {
  const { user } = useAuth();
  const canEdit = can(user, 'ads', 'edit');
  const [tab, setTab] = usePersistentState('ads-tab', 'summary');
  const overview = useAdsOverview();
  const startRun = useStartRun();
  const refreshMeta = useRefreshMeta();
  const data = overview.data;
  const running = data?.lastRun?.status === 'running';

  const actions = canEdit && data?.configured.agent && (
    <Button icon={Sparkles} size="sm" loading={running || startRun.isPending} onClick={() => startRun.mutate()}>
      {running ? 'Analizando…' : 'Analizar ahora'}
    </Button>
  );

  return (
    <>
      <PageHeader title="Agente de pauta" subtitle="Meta Ads · mensajes a WhatsApp" actions={actions} />
      <div className={s.page}>
        <Segmented label="Sección" value={tab} onChange={setTab} options={[
          { value: 'summary', label: 'Resumen' },
          { value: 'reco', label: `Recomendaciones${data?.pendingCount ? ` (${data.pendingCount})` : ''}` },
          { value: 'creatives', label: 'Anuncios' },
          { value: 'settings', label: 'Ajustes' },
        ]} />
        {overview.isLoading && <div className={s.center}><Spinner size={24} label="Cargando" /></div>}
        {data && !data.configured.meta && (
          <div className={s.alert}><AlertTriangle size={18} aria-hidden /> Falta conectar Meta en el servidor (META_ACCESS_TOKEN).</div>
        )}
        {data && data.configured.meta && !data.configured.agent && (
          <div className={s.alert}><AlertTriangle size={18} aria-hidden /> Falta la clave de Claude (ANTHROPIC_API_KEY): el agente no puede analizar.</div>
        )}
        {data?.metaError && <div className={s.alert}><AlertTriangle size={18} aria-hidden /> Meta no respondió: {data.metaError}</div>}
        {data && tab === 'summary' && <Summary data={data} canEdit={canEdit} onRefresh={() => refreshMeta.mutate()} refreshing={refreshMeta.isPending} />}
        {data && tab === 'reco' && <Recommendations canEdit={canEdit} />}
        {data && tab === 'creatives' && <Creatives snapshot={data.snapshot} canEdit={canEdit} />}
        {data && tab === 'settings' && <Settings settings={data.settings} canEdit={canEdit} />}
      </div>
    </>
  );
}

function Summary({ data, canEdit, onRefresh, refreshing }) {
  const snap = data.snapshot;
  const cap = data.settings.monthly_cap_ars;
  const run = data.lastRun;
  return (
    <div className={s.stack}>
      {snap && (
        <div className={s.tiles}>
          <div className={s.tile}><span>Gasto hoy</span><strong>{ars(snap.spendToday)}</strong></div>
          <div className={s.tile}>
            <span>Gasto del mes</span><strong>{ars(snap.month.spend)}</strong>
            <Progress value={Math.min(snap.month.spend, cap)} max={cap} label="Gasto contra el tope" />
            <small>Tope {ars(cap)}</small>
          </div>
          <div className={s.tile}><span>Conversaciones (7 días)</span><strong>{snap.last7d.conversations}</strong></div>
          <div className={s.tile}><span>Costo por conversación</span><strong>{ars(snap.last7d.costPerConversation)}</strong></div>
        </div>
      )}

      <section className={s.card}>
        <div className={s.cardHead}>
          <h2>Último informe del agente</h2>
          {run && <small>{run.status === 'running' ? 'Analizando…' : when(run.finished_at ?? run.started_at)}</small>}
        </div>
        {!run && <p className="muted">Todavía no corrió. Corre solo todos los días a las 9:00, o tocá “Analizar ahora”.</p>}
        {run?.status === 'running' && <p className={s.inline}><Spinner size={16} /> El agente está mirando la cuenta. Tarda unos minutos.</p>}
        {run?.status === 'failed' && <p className={s.bad}>Falló el análisis: {run.error}</p>}
        {run?.report && run.status !== 'running' && <Report text={run.report} />}
      </section>

      {snap && (
        <section className={s.card}>
          <div className={s.cardHead}>
            <h2>Campañas</h2>
            <Button variant="ghost" size="sm" icon={RefreshCw} loading={refreshing} onClick={onRefresh}>Actualizar</Button>
          </div>
          {snap.campaigns.length === 0 && <p className="muted">No hay campañas en la cuenta.</p>}
          {snap.campaigns.map((c) => (
            <Campaign key={c.id} c={c} snap={snap} canEdit={canEdit} />
          ))}
        </section>
      )}
    </div>
  );
}

function StatusToggle({ level, obj, canEdit }) {
  const confirm = useConfirm();
  const setStatus = useSetStatus();
  if (!canEdit) return null;
  const active = obj.status === 'ACTIVE';
  async function toggle() {
    const ok = await confirm(active
      ? { title: `¿Pausar ${obj.name}?`, confirmLabel: 'Pausar' }
      : { title: `¿Activar ${obj.name}?`, message: 'Empieza a gastar presupuesto en Meta.', confirmLabel: 'Activar' });
    if (ok) setStatus.mutate({ id: obj.id, level, status: active ? 'PAUSED' : 'ACTIVE', name: obj.name });
  }
  return (
    <Button variant="ghost" size="sm" icon={active ? Pause : Play} loading={setStatus.isPending} onClick={toggle}>
      {active ? 'Pausar' : 'Activar'}
    </Button>
  );
}

function Campaign({ c, snap, canEdit }) {
  const adsets = snap.adsets.filter((a) => a.campaignId === c.id);
  return (
    <div className={s.campaign}>
      <div className={s.row}>
        <div className={s.grow}>
          <strong>{c.name}</strong>
          <small>{c.dailyBudgetArs ? `${ars(c.dailyBudgetArs)} por día` : 'Presupuesto por conjunto'}</small>
        </div>
        <Badge status={c.effectiveStatus} />
        <StatusToggle level="campaign" obj={c} canEdit={canEdit} />
      </div>
      {adsets.map((a) => {
        const ads = snap.ads.filter((ad) => ad.adsetId === a.id);
        return (
          <div key={a.id} className={s.adset}>
            <div className={s.row}>
              <div className={s.grow}>
                <span>{a.name}</span>
                <small>
                  {a.last7d.conversations} conversaciones · {ars(a.last7d.spend)} en 7 días
                  {a.learningStage === 'LEARNING' && ' · en aprendizaje'}
                </small>
              </div>
              <Badge status={a.effectiveStatus} />
              <StatusToggle level="adset" obj={a} canEdit={canEdit} />
            </div>
            {ads.length === 0 && <p className={s.warnLine}>Sin anuncios: cargá una pieza en “Anuncios” y publicala acá.</p>}
            {ads.map((ad) => (
              <div key={ad.id} className={`${s.row} ${s.ad}`}>
                {ad.thumbnail && <img src={ad.thumbnail} alt="" className={s.thumb} />}
                <div className={s.grow}>
                  <span>{ad.name}</span>
                  <small>{ad.last7d.conversations} conv. · {ars(ad.last7d.spend)} · costo/conv {ars(ad.last7d.costPerConversation)}</small>
                </div>
                <Badge status={ad.effectiveStatus} />
                <StatusToggle level="ad" obj={ad} canEdit={canEdit} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Recommendations({ canEdit }) {
  const decisions = useDecisions();
  const requests = useRequests();
  const learnings = useLearnings();
  const decide = useDecide();
  const closeRequest = useCloseRequest();
  const deleteLearning = useDeleteLearning();
  const confirm = useConfirm();
  const list = decisions.data ?? [];
  const pending = list.filter((d) => d.status === 'pending');
  const history = list.filter((d) => d.status !== 'pending').slice(0, 30);

  async function approve(d) {
    if (await confirm({ title: `¿Aprobar “${d.title || TOOL_LABEL[d.tool]}”?`, message: 'Se aplica en Meta ahora.', confirmLabel: 'Aprobar' })) {
      decide.mutate({ id: d.id, approve: true });
    }
  }

  return (
    <div className={s.stack}>
      <section className={s.card}>
        <h2>Para aprobar</h2>
        {decisions.isLoading && <Spinner size={20} />}
        {!decisions.isLoading && pending.length === 0 && <p className="muted">No hay recomendaciones pendientes.</p>}
        {pending.map((d) => (
          <article key={d.id} className={s.reco}>
            <div className={s.recoHead}><span className={s.kind}>{TOOL_LABEL[d.tool] ?? d.tool}</span><small>{when(d.created_at)}</small></div>
            <h3>{d.title || TOOL_LABEL[d.tool]}</h3>
            {d.reason && <p>{d.reason}</p>}
            {d.expected_impact && <p className="muted">Qué esperamos: {d.expected_impact}</p>}
            {canEdit && (
              <div className={s.actions}>
                <Button size="sm" icon={Check} loading={decide.isPending && decide.variables?.id === d.id} onClick={() => approve(d)}>Aprobar</Button>
                <Button size="sm" variant="secondary" icon={X} disabled={decide.isPending} onClick={() => decide.mutate({ id: d.id, approve: false })}>Rechazar</Button>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className={s.card}>
        <h2>Piezas que pide el agente</h2>
        {(requests.data ?? []).length === 0 && <p className="muted">No hay pedidos abiertos.</p>}
        {(requests.data ?? []).map((r) => (
          <article key={r.id} className={s.reco}>
            <h3><ImagePlus size={16} aria-hidden /> {r.concept}</h3>
            {r.style_notes && <p>{r.style_notes}</p>}
            {r.reason && <p className="muted">{r.reason}</p>}
            {canEdit && <div className={s.actions}><Button size="sm" variant="secondary" onClick={() => closeRequest.mutate(r.id)}>Ya la cargamos</Button></div>}
          </article>
        ))}
      </section>

      <section className={s.card}>
        <h2>Historial</h2>
        {history.length === 0 && <p className="muted">Todavía no hay movimientos.</p>}
        {history.map((d) => (
          <div key={d.id} className={s.histRow}>
            <span className={`${s.badge} ${d.status === 'executed' ? s.ok : d.status === 'failed' ? s.bad : s.muted}`}>{DECISION_LABEL[d.status]}</span>
            <div className={s.grow}>
              <span>{d.title || TOOL_LABEL[d.tool]}</span>
              <small>{when(d.decided_at ?? d.created_at)}{d.decided_by_name ? ` · ${d.decided_by_name}` : ''}{d.error ? ` · ${d.error}` : ''}</small>
              {d.outcome && <small>Resultado: {d.outcome}</small>}
            </div>
          </div>
        ))}
      </section>

      {(learnings.data ?? []).length > 0 && (
        <section className={s.card}>
          <h2>Lo que fue aprendiendo</h2>
          {learnings.data.map((l) => (
            <div key={l.id} className={s.histRow}>
              <Lightbulb size={16} aria-hidden />
              <div className={s.grow}><span>{l.text}</span><small>{l.evidence}</small></div>
              {canEdit && <Button variant="ghost" size="sm" onClick={() => deleteLearning.mutate(l.id)}>Borrar</Button>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Creatives({ snapshot, canEdit }) {
  const creatives = useCreatives();
  const archive = useArchiveCreative();
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(null);
  const list = (creatives.data ?? []).filter((c) => c.status !== 'archived');

  return (
    <div className={s.stack}>
      {canEdit && <div><Button icon={ImagePlus} onClick={() => setCreating(true)}>Nueva pieza</Button></div>}
      {creatives.isLoading && <Spinner size={20} />}
      {!creatives.isLoading && list.length === 0 && (
        <EmptyState icon={Megaphone} title="Todavía no hay piezas">Subí la imagen (feed 4:5 y, si hay, historia 9:16) con el texto del anuncio. Después la publicás en un conjunto o se la dejás al agente.</EmptyState>
      )}
      <div className={s.grid}>
        {list.map((c) => (
          <article key={c.id} className={s.piece}>
            {c.feed_file_id ? <img src={fileUrl(`/api/files/${c.feed_file_id}/raw`)} alt="" /> : <div className={s.noImg}>Sin imagen</div>}
            <div className={s.pieceBody}>
              <div className={s.row}><strong className={s.grow}>{c.name}</strong>{c.status === 'used' ? <span className={`${s.badge} ${s.ok}`}>Publicada</span> : <span className={s.badge}>Sin usar</span>}</div>
              <p className={s.copy}>{c.copy}</p>
              {c.story_file_id && <small>Con versión historia 9:16</small>}
              {canEdit && c.status === 'unused' && (
                <div className={s.actions}>
                  <Button size="sm" disabled={!snapshot || !c.feed_file_id} onClick={() => setPublishing(c)}>Publicar</Button>
                  <Button size="sm" variant="ghost" onClick={() => archive.mutate(c.id)}>Archivar</Button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {creating && <NewCreative onClose={() => setCreating(false)} />}
      {publishing && <Publish creative={publishing} snapshot={snapshot} onClose={() => setPublishing(null)} />}
    </div>
  );
}

function NewCreative({ onClose }) {
  const create = useCreateCreative();
  const [form, setForm] = useState({ name: '', copy: '', headline: '', notes: '' });
  const [feed, setFeed] = useState(null);
  const [story, setStory] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ok = form.name.trim() && form.copy.trim() && feed;
  const submit = () => create.mutate({ ...form, feed, story }, { onSuccess: onClose });

  return (
    <Sheet open onClose={onClose} title="Nueva pieza" footer={<Button full loading={create.isPending} disabled={!ok} onClick={submit}>Guardar pieza</Button>}>
      <div className={s.form}>
        <Field label="Nombre" required hint="Corto, para reconocerla (ej. Panadería Maná)"><Input value={form.name} onChange={set('name')} maxLength={60} /></Field>
        <Field label="Imagen feed 4:5 (1080×1350)" required hint="JPG o PNG, hasta 8 MB">
          <Input type="file" accept="image/jpeg,image/png" onChange={(e) => setFeed(e.target.files[0] ?? null)} />
        </Field>
        <Field label="Imagen historia 9:16 (1080×1920)" hint="Opcional. Si no la subís, Meta adapta la de feed.">
          <Input type="file" accept="image/jpeg,image/png" onChange={(e) => setStory(e.target.files[0] ?? null)} />
        </Field>
        <Field label="Texto del anuncio" required hint="Lo que se lee arriba de la imagen. Terminá invitando a escribir por WhatsApp.">
          <Textarea value={form.copy} onChange={set('copy')} maxLength={2000} />
        </Field>
        <Field label="Título" hint="Opcional, una línea corta"><Input value={form.headline} onChange={set('headline')} maxLength={80} /></Field>
        <Field label="Notas para el agente" hint="Opcional: a qué público apunta, qué ángulo prueba"><Textarea value={form.notes} onChange={set('notes')} minRows={2} maxLength={2000} /></Field>
      </div>
    </Sheet>
  );
}

function Publish({ creative, snapshot, onClose }) {
  const publish = usePublishCreative();
  const adsets = snapshot?.adsets ?? [];
  const [adsetId, setAdsetId] = useState(adsets[0]?.id ?? '');
  const adset = adsets.find((a) => a.id === adsetId);
  const submit = () => publish.mutate({ id: creative.id, adset_id: adsetId, adset_name: adset?.name ?? '' }, { onSuccess: onClose });
  return (
    <Sheet open onClose={onClose} title={`Publicar “${creative.name}”`} footer={<Button full loading={publish.isPending} disabled={!adsetId} onClick={submit}>Publicar en Meta</Button>}>
      <div className={s.form}>
        <Field label="Conjunto" hint="El anuncio queda activo dentro del conjunto: si el conjunto o la campaña están pausados, no gasta hasta que los actives.">
          <Select value={adsetId} onChange={(e) => setAdsetId(e.target.value)}>
            {adsets.map((a) => <option key={a.id} value={a.id}>{a.name} — {STATUS_LABEL[a.effectiveStatus] ?? a.effectiveStatus}</option>)}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

function Settings({ settings, canEdit }) {
  const save = useSaveAdSettings();
  const [form, setForm] = useState(settings);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  return (
    <section className={s.card}>
      <div className={s.form}>
        <label className={s.check}>
          <input type="checkbox" checked={form.agent_enabled} disabled={!canEdit} onChange={(e) => setForm({ ...form, agent_enabled: e.target.checked })} />
          <span><strong>Informe diario</strong><small>El agente analiza la cuenta todos los días a las 9:00.</small></span>
        </label>
        <label className={s.check}>
          <input type="checkbox" checked={form.autonomous} disabled={!canEdit} onChange={(e) => setForm({ ...form, autonomous: e.target.checked })} />
          <span><strong>Pausar anuncios solo</strong><small>Si está prendido, el agente pausa anuncios que gastan sin traer mensajes sin esperar aprobación. Todo lo demás siempre se aprueba acá.</small></span>
        </label>
        <Field label="Tope mensual (pesos)">
          <Input type="number" min={0} step={10000} value={form.monthly_cap_ars} disabled={!canEdit}
            onChange={(e) => setForm({ ...form, monthly_cap_ars: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Contexto para el agente" hint="Lo que el agente tiene que saber: promos, rubros a priorizar, qué no hacer.">
          <Textarea value={form.business_notes} disabled={!canEdit} onChange={(e) => setForm({ ...form, business_notes: e.target.value })} maxLength={5000} />
        </Field>
        {canEdit && (
          <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({
            agent_enabled: form.agent_enabled, autonomous: form.autonomous, monthly_cap_ars: form.monthly_cap_ars, business_notes: form.business_notes,
          })}>Guardar</Button>
        )}
      </div>
    </section>
  );
}
