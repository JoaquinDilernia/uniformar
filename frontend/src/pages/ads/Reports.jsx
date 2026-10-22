import { useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, RefreshCw, Sparkles, ThumbsDown, ThumbsUp, User } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Field, Input } from '../../components/ui/Field.jsx';
import { useAnalyzeReport, useRefreshReport, useReport } from './api.js';
import { ars, when } from './format.js';
import { ReportText } from './ReportText.jsx';
import s from './ads.module.css';

// Fechas en hora argentina, igual que la cuenta publicitaria
const artToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function periodRange(period, today = artToday()) {
  if (period === '30d') return { since: addDays(today, -29), until: today };
  if (period === 'month') return { since: `${today.slice(0, 8)}01`, until: today };
  if (period === 'prev_month') {
    const until = addDays(`${today.slice(0, 8)}01`, -1);
    return { since: `${until.slice(0, 8)}01`, until };
  }
  return { since: addDays(today, -6), until: today };
}

const PERIODS = [
  { value: '7d', label: '7 días' }, { value: '30d', label: '30 días' }, { value: 'month', label: 'Este mes' },
  { value: 'prev_month', label: 'Mes anterior' }, { value: 'custom', label: 'Elegir fechas' },
];
const BREAKDOWNS = [
  { value: 'placement', label: 'Ubicación' }, { value: 'age', label: 'Edad' }, { value: 'gender', label: 'Género' },
  { value: 'region', label: 'Zona' }, { value: 'hour', label: 'Hora' },
];

const num = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'));
const shortDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function Reports({ canEdit }) {
  const [period, setPeriod] = usePersistentState('ads-report-period', '7d');
  const [custom, setCustom] = useState(() => periodRange('30d'));
  const range = period === 'custom' ? custom : periodRange(period);
  const valid = range.since && range.until && range.since <= range.until && range.until <= artToday();
  const report = useReport(valid ? range : {});
  const refresh = useRefreshReport();
  const data = report.data?.report;

  return (
    <div className={s.stack}>
      <section className={s.card}>
        <div className={s.cardHead}>
          <Segmented label="Período" value={period} onChange={setPeriod} options={PERIODS} />
          <Button variant="ghost" size="sm" icon={RefreshCw} loading={refresh.isPending} disabled={!valid} onClick={() => refresh.mutate(range)}>Actualizar</Button>
        </div>
        {period === 'custom' && (
          <div className={s.dates}>
            <Field label="Desde"><Input type="date" value={custom.since} max={custom.until} onChange={(e) => setCustom({ ...custom, since: e.target.value })} /></Field>
            <Field label="Hasta"><Input type="date" value={custom.until} min={custom.since} max={artToday()} onChange={(e) => setCustom({ ...custom, until: e.target.value })} /></Field>
          </div>
        )}
        {data && (
          <small className={s.rangeNote}>
            Del {shortDate(data.range.since)} al {shortDate(data.range.until)} ({data.range.days} días), comparado con
            {' '}{shortDate(data.previousRange.since)} – {shortDate(data.previousRange.until)}. Datos de Meta de las {when(data.generatedAt)}.
          </small>
        )}
      </section>

      {!valid && <div className={s.alert}><AlertTriangle size={18} aria-hidden /> Elegí un período que no termine en el futuro.</div>}
      {report.isLoading && valid && <div className={s.center}><Spinner size={24} label="Armando el reporte" /></div>}
      {report.error && <div className={s.alert}><AlertTriangle size={18} aria-hidden /> {report.error.message}</div>}

      {data && (
        <>
          <Kpis totals={data.totals} />
          <DailyChart days={data.daily} />
          <Analysis range={range} analysis={report.data.analysis} canAnalyze={canEdit && report.data.canAnalyze} />
          <Ranking ads={data.ads} />
          <Adsets adsets={data.adsets.all} />
          <Breakdowns breakdowns={data.breakdowns} />
          <Organic organic={data.organic} />
          <Actions actions={data.actions} />
        </>
      )}
    </div>
  );
}

// Variación contra el período anterior; en costos, bajar es bueno
function Delta({ cur, prev, lowerIsBetter }) {
  if (cur == null || prev == null || prev === 0) return <small>Sin dato anterior</small>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <small>Igual que antes</small>;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  return <small className={`${s.delta} ${good ? s.up : s.down}`}><Icon size={14} aria-hidden />{pct > 0 ? '+' : ''}{pct}% vs. antes</small>;
}

const KPIS = [
  { key: 'conversations', label: 'Conversaciones', fmt: num },
  { key: 'costPerConversation', label: 'Costo por conversación', fmt: ars, lowerIsBetter: true },
  { key: 'spend', label: 'Gasto', fmt: ars, neutral: true },
  { key: 'replied', label: 'Conversaciones respondidas', fmt: num },
  { key: 'reach', label: 'Alcance', fmt: num },
  { key: 'frequency', label: 'Frecuencia', fmt: (v) => (v == null ? '—' : v.toLocaleString('es-AR')), neutral: true },
  { key: 'ctr', label: 'CTR', fmt: (v) => (v == null ? '—' : `${v.toLocaleString('es-AR')}%`) },
  { key: 'cpm', label: 'Costo cada mil impresiones', fmt: ars, lowerIsBetter: true },
];

function Kpis({ totals }) {
  const { current, previous } = totals;
  return (
    <div className={s.tiles}>
      {KPIS.map((k) => (
        <div key={k.key} className={s.tile}>
          <span>{k.label}</span>
          <strong>{k.fmt(current[k.key])}</strong>
          {k.neutral
            ? <small>Antes: {k.fmt(previous[k.key])}</small>
            : <Delta cur={current[k.key]} prev={previous[k.key]} lowerIsBetter={k.lowerIsBetter} />}
        </div>
      ))}
    </div>
  );
}

// Barras: conversaciones del día. Línea: gasto del día (cada serie con su propia escala)
function DailyChart({ days }) {
  if (!days.length) return null;
  const W = 600;
  const H = 150;
  const pad = 6;
  const maxConv = Math.max(1, ...days.map((d) => d.conversations));
  const maxSpend = Math.max(1, ...days.map((d) => d.spend));
  const slot = W / days.length;
  const barW = Math.max(2, slot * 0.6);
  const y = (v, max) => H - pad - (v / max) * (H - pad * 2);
  const line = days.map((d, i) => `${(i + 0.5) * slot},${y(d.spend, maxSpend)}`).join(' ');
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2>Día a día</h2>
        <div className={s.legend}><span className={s.legBar} /> Conversaciones <span className={s.legLine} /> Gasto</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.chart} role="img" aria-label="Conversaciones y gasto por día" preserveAspectRatio="none">
        {days.map((d, i) => (
          <g key={d.date}>
            <title>{`${shortDate(d.date)}: ${d.conversations} conversaciones · ${ars(d.spend)}`}</title>
            <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
            <rect x={(i + 0.5) * slot - barW / 2} y={y(d.conversations, maxConv)} width={barW} height={H - pad - y(d.conversations, maxConv)} rx={2} className={s.bar} />
          </g>
        ))}
        <polyline points={line} className={s.line} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={s.axis}><span>{shortDate(days[0].date)}</span><span>Máx. {maxConv} conv. · {ars(maxSpend)} por día</span><span>{shortDate(days.at(-1).date)}</span></div>
    </section>
  );
}

function Analysis({ range, analysis, canAnalyze }) {
  const analyze = useAnalyzeReport();
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2><Sparkles size={18} aria-hidden /> Lectura del agente</h2>
        {analysis && <small>{when(analysis.created_at)}{analysis.created_by_name ? ` · pedida por ${analysis.created_by_name}` : ''}</small>}
      </div>
      {analyze.isPending && <p className={s.inline}><Spinner size={16} /> El agente está leyendo el período. Tarda menos de un minuto.</p>}
      {!analyze.isPending && analysis && <ReportText text={analysis.text} />}
      {!analyze.isPending && !analysis && <p className="muted">Todavía no hay lectura de este período. El agente usa solo los números de este reporte.</p>}
      {canAnalyze && (
        <div className={s.actions}>
          <Button size="sm" variant={analysis ? 'secondary' : 'primary'} icon={Sparkles} loading={analyze.isPending} onClick={() => analyze.mutate(range)}>
            {analysis ? 'Pedir de nuevo' : 'Pedir lectura al agente'}
          </Button>
        </div>
      )}
    </section>
  );
}

function AdRow({ ad }) {
  return (
    <div className={`${s.row} ${s.rankRow}`}>
      {ad.thumbnail ? <img src={ad.thumbnail} alt="" className={s.thumb} /> : <div className={`${s.thumb} ${s.noThumb}`} />}
      <div className={s.grow}>
        <span>{ad.name}</span>
        <small>{ad.adset}</small>
      </div>
      <div className={s.figures}>
        <strong>{ad.conversations > 0 ? ars(ad.costPerConversation) : 'Sin conv.'}</strong>
        <small>{ad.conversations} conv. · {ars(ad.spend)}</small>
      </div>
    </div>
  );
}

function Ranking({ ads }) {
  if (!ads.count) return null;
  return (
    <section className={s.card}>
      <h2>Anuncios</h2>
      <div className={s.twoCols}>
        <div className={s.stackS}>
          <h3 className={s.sub}><ThumbsUp size={16} aria-hidden /> Donde mejor nos va</h3>
          {ads.best.length === 0 && <p className="muted">Ningún anuncio trajo conversaciones por debajo del promedio todavía.</p>}
          {ads.best.map((a) => <AdRow key={a.id} ad={a} />)}
        </div>
        <div className={s.stackS}>
          <h3 className={s.sub}><ThumbsDown size={16} aria-hidden /> Los que menos rinden</h3>
          {ads.worst.length === 0 && <p className="muted">Ninguno gastó de más sin resultados.</p>}
          {ads.worst.map((a) => <AdRow key={a.id} ad={a} />)}
        </div>
      </div>
      <small className={s.rangeNote}>Ordenados por costo por conversación. Para estar en “menos rinden” un anuncio tiene que haber gastado al menos lo que cuesta una conversación promedio.</small>
    </section>
  );
}

function Adsets({ adsets }) {
  if (!adsets.length) return null;
  const maxConv = Math.max(1, ...adsets.map((a) => a.conversations));
  return (
    <section className={s.card}>
      <h2>Conjuntos</h2>
      {adsets.map((a) => <ShareRow key={a.id} label={a.name} sub={a.campaign} item={a} max={maxConv} />)}
    </section>
  );
}

function ShareRow({ label, sub, item, max }) {
  return (
    <div className={s.share}>
      <div className={s.row}>
        <div className={s.grow}><span>{label}</span>{sub && <small>{sub}</small>}</div>
        <div className={s.figures}>
          <strong>{item.conversations} conv.</strong>
          <small>{ars(item.spend)} · {item.conversations > 0 ? `${ars(item.costPerConversation)} c/u` : 'sin conv.'}</small>
        </div>
      </div>
      <div className={s.shareTrack}><div className={s.shareFill} style={{ width: `${(item.conversations / max) * 100}%` }} /></div>
    </div>
  );
}

function Breakdowns({ breakdowns }) {
  const [kind, setKind] = usePersistentState('ads-report-breakdown', 'placement');
  const rows = breakdowns[kind];
  const list = Array.isArray(rows) ? rows.filter((r) => r.spend > 0 || r.conversations > 0) : [];
  const maxConv = Math.max(1, ...list.map((r) => r.conversations));
  const best = list.filter((r) => r.conversations > 0).sort((a, b) => a.costPerConversation - b.costPerConversation)[0];
  return (
    <section className={s.card}>
      <h2>Dónde destacamos</h2>
      <Segmented label="Desglose" value={kind} onChange={setKind} options={BREAKDOWNS} />
      {rows?.error && <p className="muted">Meta no dio este desglose: {rows.error}</p>}
      {Array.isArray(rows) && list.length === 0 && <p className="muted">Sin datos en este período.</p>}
      {best && list.length > 1 && <p className={s.highlight}>Más barato: <strong>{best.label}</strong> a {ars(best.costPerConversation)} por conversación.</p>}
      {list.map((r) => <ShareRow key={r.label} label={r.label} item={r} max={maxConv} />)}
    </section>
  );
}

const TYPE_NAME = { reel: 'Reel', post: 'Post', carousel: 'Carrusel' };

function Organic({ organic }) {
  if (!organic) return null;
  if (organic.error) {
    return <section className={s.card}><h2>Orgánico de Instagram</h2><p className="muted">Instagram no respondió: {organic.error}</p></section>;
  }
  const { current, previous, byType, top } = organic;
  const stats = [
    { label: 'Publicaciones', cur: current.posts, prev: previous.posts },
    { label: 'Likes', cur: current.likes, prev: previous.likes },
    { label: 'Comentarios', cur: current.comments, prev: previous.comments },
    { label: 'Alcance promedio', cur: current.avgReach, prev: previous.avgReach },
  ];
  return (
    <section className={s.card}>
      <h2>Orgánico de Instagram</h2>
      {current.posts === 0 && <p className="muted">No se publicó nada en Instagram en este período.</p>}
      {current.posts > 0 && (
        <>
          <div className={s.tiles}>
            {stats.map((x) => (
              <div key={x.label} className={s.tile}><span>{x.label}</span><strong>{num(x.cur)}</strong><Delta cur={x.cur} prev={x.prev} /></div>
            ))}
          </div>
          {byType.length > 1 && (
            <div className={s.stackS}>
              <h3 className={s.sub}>Por formato</h3>
              {byType.map((t) => (
                <div key={t.type} className={`${s.row} ${s.rankRow}`}>
                  <div className={s.grow}><span>{t.label}</span><small>{t.posts} publicados</small></div>
                  <div className={s.figures}>
                    <strong>{num(t.avgEngagement)} interacciones c/u</strong>
                    <small>{t.avgReach != null ? `alcance prom. ${num(t.avgReach)}` : 'sin dato de alcance'}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className={s.stackS}>
            <h3 className={s.sub}><ThumbsUp size={16} aria-hidden /> Lo que más conectó</h3>
            {top.map((p) => (
              <a key={p.id} href={p.permalink} target="_blank" rel="noreferrer" className={`${s.row} ${s.rankRow} ${s.postLink}`}>
                {p.thumbnail ? <img src={p.thumbnail} alt="" className={s.thumb} /> : <div className={`${s.thumb} ${s.noThumb}`} />}
                <div className={s.grow}>
                  <span className={s.clamp}>{p.caption || '(sin texto)'}</span>
                  <small>{TYPE_NAME[p.type] ?? p.type} · {shortDate(p.date)}</small>
                </div>
                <div className={s.figures}>
                  <strong>{num(p.likes + p.comments)} interacciones</strong>
                  <small>{p.reach != null ? `${num(p.reach)} alcance · ${p.engagementRate}%` : `${p.likes} likes · ${p.comments} coment.`}</small>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Window({ label, w }) {
  if (!w) return <div className={s.window}><span>{label}</span><strong>Muy reciente</strong><small>Se mide desde mañana</small></div>;
  const perDay = w.days ? (w.conversations / w.days).toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '—';
  return (
    <div className={s.window}>
      <span>{label} ({w.days} días)</span>
      <strong>{w.conversations > 0 ? `${ars(w.costPerConversation)} c/conv.` : 'Sin conv.'}</strong>
      <small>{w.conversations} conv. ({perDay} por día) · {ars(w.spend)}</small>
    </div>
  );
}

function Actions({ actions }) {
  return (
    <section className={s.card}>
      <h2>Qué se hizo y cómo resultó</h2>
      {actions.length === 0 && <p className="muted">No hubo acciones ejecutadas en este período.</p>}
      {actions.map((a) => (
        <article key={a.id} className={s.reco}>
          <div className={s.recoHead}>
            <span className={s.kind}>{a.byAgent ? <><Bot size={12} aria-hidden /> Agente</> : <><User size={12} aria-hidden /> {a.decidedBy ?? 'Manual'}</>}</span>
            <small>{shortDate(a.date)} · {a.scope}</small>
          </div>
          <h3>{a.title}</h3>
          <div className={s.windows}><Window label="Antes" w={a.before} /><Window label="Después" w={a.after} /></div>
          {a.outcome && <p className="muted">Lo que anotó el agente: {a.outcome}</p>}
        </article>
      ))}
    </section>
  );
}
