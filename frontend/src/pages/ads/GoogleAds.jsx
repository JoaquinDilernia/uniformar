import { useState } from 'react';
import { AlertTriangle, Check, Lightbulb, Pause, Play, RefreshCw, X } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { Field, Input, Textarea } from '../../components/ui/Field.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import {
  useDeleteGoogleLearning, useGoogleDecide, useGoogleDecisions, useGoogleLearnings, useGoogleSetStatus, useRefreshGoogle, useSaveGoogleSettings,
} from './gapi.js';
import { ars, when } from './format.js';
import { AgentQuestions } from './Questions.jsx';
import { ReportText } from './ReportText.jsx';
import s from './ads.module.css';

const STATUS_LABEL = { ENABLED: 'Activa', PAUSED: 'Pausada' };
const TOOL_LABEL = {
  propose_search_campaign: 'Campaña nueva', set_status: 'Activar / pausar', propose_budget_change: 'Presupuesto',
  add_negative_keywords: 'Palabras negativas', add_keywords: 'Palabras clave', propose_search_ad: 'Anuncio nuevo',
};
const DECISION_LABEL = { pending: 'Pendiente', executed: 'Hecho', rejected: 'Rechazado', failed: 'Falló' };
const MATCH_LABEL = { EXACT: 'exacta', PHRASE: 'frase', BROAD: 'amplia' };

function Badge({ status }) {
  return <span className={`${s.badge} ${status === 'ENABLED' ? s.ok : s.muted}`}>{STATUS_LABEL[status] ?? status}</span>;
}

// Sección Google de Pauta: misma lógica que Meta (informe, recomendaciones a aprobar, preguntas, ajustes)
export function GoogleAds({ data, canEdit, running }) {
  const [tab, setTab] = usePersistentState('gads-tab', 'summary');
  const refresh = useRefreshGoogle();
  return (
    <>
      <Segmented label="Sección" value={tab} onChange={setTab} options={[
        { value: 'summary', label: `Resumen${data.openQuestions ? ` (${data.openQuestions})` : ''}` },
        { value: 'reco', label: `Recomendaciones${data.pendingCount ? ` (${data.pendingCount})` : ''}` },
        { value: 'settings', label: 'Ajustes' },
      ]} />
      {!data.configured.google && (
        <div className={s.alert}><AlertTriangle size={18} aria-hidden /> Falta conectar Google Ads en el servidor (GOOGLE_ADS_SERVICE_ACCOUNT y GOOGLE_ADS_CUSTOMER_ID).</div>
      )}
      {data.configured.google && !data.configured.agent && (
        <div className={s.alert}><AlertTriangle size={18} aria-hidden /> Falta la clave de Claude (ANTHROPIC_API_KEY): el agente no puede analizar.</div>
      )}
      {data.googleError && <div className={s.alert}><AlertTriangle size={18} aria-hidden /> Google no respondió: {data.googleError}</div>}
      {tab === 'summary' && <Summary data={data} canEdit={canEdit} running={running} onRefresh={() => refresh.mutate()} refreshing={refresh.isPending} />}
      {tab === 'reco' && <Recommendations canEdit={canEdit} />}
      {tab === 'settings' && <Settings settings={data.settings} canEdit={canEdit} />}
    </>
  );
}

function Summary({ data, canEdit, running, onRefresh, refreshing }) {
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
            <Progress value={Math.min(snap.month.spend, cap)} max={cap || 1} label="Gasto contra el tope" />
            <small>Tope {ars(cap)}{data.projectedMonth != null ? ` · cierra en ~${ars(data.projectedMonth)}` : ''}</small>
          </div>
          <div className={s.tile}><span>Consultas (7 días)</span><strong>{snap.last7d.leads}</strong><small>{snap.last7d.clicks} clics</small></div>
          <div className={s.tile}><span>Costo por consulta</span><strong>{ars(snap.last7d.costPerLead)}</strong><small>CPC {ars(snap.last7d.cpc)}</small></div>
        </div>
      )}
      {snap && snap.conversionActions.length === 0 && (
        <div className={s.alert}><AlertTriangle size={18} aria-hidden /> Todavía no se miden las consultas (WhatsApp y Cotizá) en Google: falta la conversión en la cuenta.</div>
      )}

      <section className={s.card}>
        <div className={s.cardHead}>
          <h2>Último informe del agente</h2>
          {run && <small>{run.status === 'running' ? 'Analizando…' : when(run.finished_at ?? run.started_at)}</small>}
        </div>
        {!run && <p className="muted">Todavía no corrió. Corre solo todos los días a las 9:15, o tocá “Analizar ahora”.</p>}
        {running && <p className={s.inline}><Spinner size={16} /> El agente está mirando la cuenta de Google. Tarda unos minutos.</p>}
        {run?.status === 'failed' && <p className={s.bad}>Falló el análisis: {run.error}</p>}
        {run?.report && !running && <ReportText text={run.report} />}
      </section>

      <AgentQuestions canEdit={canEdit} base="/gads" />

      {snap && <Campaigns snap={snap} canEdit={canEdit} onRefresh={onRefresh} refreshing={refreshing} />}
      {snap && snap.searchTerms.length > 0 && <SearchTerms terms={snap.searchTerms} />}
    </div>
  );
}

function StatusToggle({ level, obj, canEdit }) {
  const confirm = useConfirm();
  const setStatus = useGoogleSetStatus();
  if (!canEdit) return null;
  const active = obj.status === 'ENABLED';
  async function toggle() {
    const ok = await confirm(active
      ? { title: `¿Pausar ${obj.name}?`, confirmLabel: 'Pausar' }
      : { title: `¿Activar ${obj.name}?`, message: 'Empieza a gastar presupuesto en Google.', confirmLabel: 'Activar' });
    if (ok) setStatus.mutate({ id: obj.id, level, status: active ? 'PAUSED' : 'ENABLED', name: obj.name });
  }
  return (
    <Button variant="ghost" size="sm" icon={active ? Pause : Play} loading={setStatus.isPending} onClick={toggle}>
      {active ? 'Pausar' : 'Activar'}
    </Button>
  );
}

const stats = (m) => `${m.leads} consultas · ${m.clicks} clics · ${ars(m.spend)} en 7 días${m.costPerLead ? ` · ${ars(m.costPerLead)} por consulta` : ''}`;

function Campaigns({ snap, canEdit, onRefresh, refreshing }) {
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2>Campañas</h2>
        <Button variant="ghost" size="sm" icon={RefreshCw} loading={refreshing} onClick={onRefresh}>Actualizar</Button>
      </div>
      {snap.campaigns.length === 0 && <p className="muted">No hay campañas en Google todavía. El agente propone la primera en Recomendaciones.</p>}
      {snap.campaigns.map((c) => (
        <div key={c.id} className={s.campaign}>
          <div className={s.row}>
            <div className={s.grow}>
              <strong>{c.name}</strong>
              <small>{c.dailyBudgetArs ? `${ars(c.dailyBudgetArs)} por día` : ''} · {stats(c.last7d)}</small>
            </div>
            <Badge status={c.status} />
            <StatusToggle level="campaign" obj={c} canEdit={canEdit} />
          </div>
          {snap.adGroups.filter((g) => g.campaignId === c.id).map((g) => {
            const kws = snap.keywords.filter((k) => k.adGroupId === g.id);
            return (
              <div key={g.id} className={s.adset}>
                <div className={s.row}>
                  <div className={s.grow}>
                    <span>{g.name}</span>
                    <small>{stats(g.last7d)}</small>
                  </div>
                  <Badge status={g.status} />
                  <StatusToggle level="ad_group" obj={g} canEdit={canEdit} />
                </div>
                {kws.length > 0 && (
                  <Collapsible title="Palabras clave" count={kws.length}>
                    {kws.map((k) => (
                      <div key={k.id} className={s.histRow}>
                        <div className={s.grow}>
                          <span>{k.text} <small>({MATCH_LABEL[k.matchType] ?? k.matchType})</small></span>
                          <small>{k.last7d.clicks} clics · {ars(k.last7d.spend)} · {k.last7d.leads} consultas</small>
                        </div>
                        {k.status !== 'ENABLED' && <Badge status={k.status} />}
                      </div>
                    ))}
                  </Collapsible>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function SearchTerms({ terms }) {
  return (
    <section className={s.card}>
      <div className={s.cardHead}><h2>Qué buscó la gente</h2><small>Últimos 14 días</small></div>
      {terms.slice(0, 25).map((t) => (
        <div key={`${t.adGroupId}|${t.term}`} className={s.histRow}>
          <div className={s.grow}><span>{t.term}</span></div>
          <div className={s.figures}><span>{ars(t.spend)}</span><small>{t.clicks} clics · {t.leads} consultas</small></div>
        </div>
      ))}
    </section>
  );
}

// Detalle de lo que el agente quiere crear, para aprobar sin abrir Google Ads
function Detail({ d }) {
  const i = d.input ?? {};
  if (d.tool === 'propose_search_campaign') {
    return (
      <div className={s.placement}>
        <small>
          {ars(i.daily_budget_ars)} por día · {i.bidding?.strategy === 'MAXIMIZE_CONVERSIONS' ? 'maximizar consultas' : `maximizar clics${i.bidding?.max_cpc_ars ? ` (tope ${ars(i.bidding.max_cpc_ars)} por clic)` : ''}`}
          {' · '}{i.location_ids?.length ? `${i.location_ids.length} ubicaciones` : 'toda Argentina'}
        </small>
        {(i.ad_groups ?? []).map((g) => (
          <Collapsible key={g.name} title={g.name} count={g.keywords?.length}>
            <p><strong>Palabras:</strong> {(g.keywords ?? []).map((k) => `${k.text} (${MATCH_LABEL[k.match_type] ?? k.match_type})`).join(', ')}</p>
            <p><strong>Títulos:</strong> {(g.headlines ?? []).join(' · ')}</p>
            <p><strong>Descripciones:</strong> {(g.descriptions ?? []).join(' · ')}</p>
          </Collapsible>
        ))}
        {i.negative_keywords?.length > 0 && <small>Negativas: {i.negative_keywords.join(', ')}</small>}
      </div>
    );
  }
  if (d.tool === 'add_keywords') return <small>{(i.keywords ?? []).map((k) => `${k.text} (${MATCH_LABEL[k.match_type] ?? k.match_type})`).join(', ')}{i.ad_group_name ? ` → ${i.ad_group_name}` : ''}</small>;
  if (d.tool === 'add_negative_keywords') return <small>{(i.keywords ?? []).join(', ')}{i.target_name ? ` → ${i.target_name}` : ''}</small>;
  if (d.tool === 'propose_search_ad') return <small>{(i.headlines ?? []).join(' · ')}</small>;
  if (d.tool === 'propose_budget_change') return <small>{i.campaign_name ?? ''}: {ars(i.current_budget_ars)} → {ars(i.proposed_budget_ars)} por día</small>;
  return null;
}

function Recommendations({ canEdit }) {
  const decisions = useGoogleDecisions();
  const learnings = useGoogleLearnings();
  const decide = useGoogleDecide();
  const deleteLearning = useDeleteGoogleLearning();
  const confirm = useConfirm();
  const list = decisions.data ?? [];
  const pending = list.filter((d) => d.status === 'pending');
  const history = list.filter((d) => d.status !== 'pending').slice(0, 30);

  async function approve(d) {
    const message = d.tool === 'propose_search_campaign' ? 'Se crea en Google Ads y arranca ACTIVA: empieza a gastar hoy.' : 'Se aplica en Google Ads ahora.';
    if (await confirm({ title: `¿Aprobar “${d.title || TOOL_LABEL[d.tool]}”?`, message, confirmLabel: 'Aprobar' })) {
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
            <Detail d={d} />
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

function Settings({ settings, canEdit }) {
  const save = useSaveGoogleSettings();
  const [form, setForm] = useState(settings);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  return (
    <section className={s.card}>
      <div className={s.form}>
        <label className={s.check}>
          <input type="checkbox" checked={form.agent_enabled} disabled={!canEdit} onChange={(e) => setForm({ ...form, agent_enabled: e.target.checked })} />
          <span><strong>Informe diario</strong><small>El agente analiza la cuenta de Google todos los días a las 9:15.</small></span>
        </label>
        <Field label="Tope mensual de Google (pesos)" hint="Aparte del tope de Meta. El agente no propone nada que lo pase.">
          <Input type="number" min={0} step={10000} value={form.monthly_cap_ars} disabled={!canEdit}
            onChange={(e) => setForm({ ...form, monthly_cap_ars: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Contexto para el agente" hint="Rubros a priorizar, zonas, qué no hacer.">
          <Textarea value={form.business_notes} disabled={!canEdit} onChange={(e) => setForm({ ...form, business_notes: e.target.value })} maxLength={5000} />
        </Field>
        {canEdit && (
          <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({
            agent_enabled: form.agent_enabled, monthly_cap_ars: form.monthly_cap_ars, business_notes: form.business_notes,
          })}>Guardar</Button>
        )}
      </div>
    </section>
  );
}
