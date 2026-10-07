import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clapperboard, Camera, Megaphone, Globe, ExternalLink } from 'lucide-react';
import { useAuth, useCan } from '../../state/auth.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { WEEKDAY_SHORT, addDays, formatLong, formatShort, todayART, weekdayOf } from '../../lib/dates.js';
import { useHome } from './api.js';
import s from './home.module.css';
import p from '../pages.module.css';

function greeting(now = new Date()) {
  const h = (now.getUTCHours() + 21) % 24; // hora argentina
  return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

const FormatIcon = ({ format }) => (format === 'photo' ? <Camera size={16} aria-hidden /> : <Clapperboard size={16} aria-hidden />);

function IdeaLinks({ ideas }) {
  return (
    <ul className={s.list}>
      {ideas.map((i) => (
        <li key={i.id}>
          <Link to={`/ideas/${i.id}`} className={s.link}>
            <FormatIcon format={i.format} />
            <span className={s.linkText}>{i.text.split('\n')[0]}</span>
            <StatusBadge kind="idea" status={i.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TaskLinks({ tasks }) {
  return (
    <ul className={s.list}>
      {tasks.map((t) => (
        <li key={t.id}>
          <Link to={`/proyectos/${t.project_id}`} className={s.link}>
            <span className={s.linkText}>{t.text}</span>
            <span className="muted">{t.project_name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Block({ title, children, action }) {
  return (
    <section className={s.block}>
      <div className={s.blockHead}><h2>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const can = useCan();
  const [week, setWeek] = useState(null);
  const { data, isPending, isError, refetch } = useHome(week);
  if (isError && !data) {
    return (
      <div className={p.center}>
        <p>No pudimos cargar el inicio.</p>
        <Button onClick={() => refetch()}>Reintentar</Button>
      </div>
    );
  }
  if (isPending || !data || !user) return <div className={p.center}><Spinner size={28} label="Cargando" /></div>;

  const { counters, mine } = data;
  const today = todayART();
  const mineCount = mine.to_decide.length + mine.to_do.length + mine.tasks.length;
  const firstName = (user.name || '').split(' ')[0];

  const mineBlocks = (
    <>
      {mine.to_decide.length > 0 && <Block title={`Te toca decidir (${mine.to_decide.length})`}><IdeaLinks ideas={mine.to_decide} /></Block>}
      {mine.to_do.length > 0 && <Block title={`Te toca hacer (${mine.to_do.length})`}><IdeaLinks ideas={mine.to_do} /></Block>}
      {mine.tasks.length > 0 && <Block title={`Tus tareas (${mine.tasks.length})`}><TaskLinks tasks={mine.tasks} /></Block>}
    </>
  );

  const weekBlock = data.week.days && (
    <Block title="Esta semana" action={(
      <div className={s.weekNav}>
        <IconButton icon={ChevronLeft} size="sm" label="Semana anterior" onClick={() => setWeek(addDays(data.week.start, -7))} />
        <span className="muted">{formatShort(data.week.start)} – {formatShort(data.week.end)}</span>
        <IconButton icon={ChevronRight} size="sm" label="Semana siguiente" onClick={() => setWeek(addDays(data.week.start, 7))} />
      </div>
    )}>
      <div className={s.week}>
        {data.week.days.map((d) => (
          <Link key={d.date} to={`/calendario/${d.date}`} className={`${s.day} ${d.date === today ? s.today : ''} ${d.rules.length ? s.ruled : ''}`} aria-label={formatLong(d.date)}>
            <span className={s.dayName}>{WEEKDAY_SHORT[weekdayOf(d.date)]} <strong>{Number(d.date.slice(8))}</strong></span>
            <span className={s.dayTheme}>{d.rules.map((r) => r.theme).join(' · ') || 'Libre'}</span>
            {d.items.map((i) => <span key={i.id} className={s.dayItem}>{i.title || 'Sin título'}</span>)}
            {(d.rules.length > 0 || d.items.length > 0) && <StatusBadge kind="day" status={d.state} />}
          </Link>
        ))}
      </div>
    </Block>
  );

  return (
    <div className={p.page}>
      <header className={s.hello}>
        <h1>{greeting()}, {firstName}</h1>
        <p className="muted">{formatLong(today)}</p>
      </header>

      <div className={s.counters}>
        {[['Ideas nuevas', counters.new_ideas_week], ['Por decidir', counters.to_decide], ['Realizadas', counters.done_week], ['Proyectos activos', counters.active_projects]]
          .filter(([, v]) => v != null)
          .map(([label, v]) => <div key={label} className={s.counter}><strong>{v}</strong><span>{label}</span></div>)}
      </div>

      {mineCount > 0 ? <>{mineBlocks}{weekBlock}</> : <>{weekBlock}</>}

      {data.to_decide && data.to_decide.length > 0 && (
        <Block title="Ideas esperando respuesta" action={<Link to="/ideas" className={s.more}>Ver todas</Link>}>
          <IdeaLinks ideas={data.to_decide.slice(0, 6)} />
        </Block>
      )}

      {data.pending_by_user.some((c) => c.ideas.length || c.tasks.length) && (
        <Block title="Pendientes de cada uno">
          <div className={s.columns}>
            {data.pending_by_user.map(({ user: u, ideas, tasks }) => (
              <div key={u.id} className={s.column}>
                <p className={s.colHead}><Avatar user={u} size={24} /> {u.name} <span className="muted">{ideas.length + tasks.length}</span></p>
                {ideas.length + tasks.length === 0 ? <p className="muted">Nada pendiente 🎉</p> : <><IdeaLinks ideas={ideas} /><TaskLinks tasks={tasks} /></>}
              </div>
            ))}
          </div>
        </Block>
      )}

      {data.recently_done && data.recently_done.length > 0 && (
        <Block title="Contenido realizado">
          <div className={s.done}>
            {data.recently_done.map((d) => (
              <a key={d.id} href={d.result_url} target="_blank" rel="noreferrer" className={s.doneCard}>
                {d.thumb_url ? <img src={d.thumb_url} alt="" /> : <span className={s.doneIcon}><FormatIcon format={d.format} /></span>}
                <span className={s.doneText}>{d.text.split('\n')[0]}</span>
                <ExternalLink size={14} aria-hidden className="muted" />
              </a>
            ))}
          </div>
        </Block>
      )}

      {data.projects && (
        <Block title="Proyectos activos" action={<Link to="/proyectos" className={s.more}>Ver todos</Link>}>
          <ul className={s.list}>
            {data.projects.active.map((x) => (
              <li key={x.id}>
                <Link to={`/proyectos/${x.id}`} className={s.projectRow}>
                  <strong>{x.name}</strong>
                  <Progress value={x.task_done} max={x.task_total} label={`Avance de ${x.name}`} />
                  <span className="muted">{x.task_done}/{x.task_total}</span>
                </Link>
              </li>
            ))}
          </ul>
          {data.projects.proposals.length > 0 && <p className={s.proposals}>Propuestas: {data.projects.proposals.map((x) => <Link key={x.id} to={`/proyectos/${x.id}`}>{x.name}</Link>).reduce((a, b) => [a, ', ', b])}</p>}
        </Block>
      )}

      <div className={s.soon}>
        {can('ads') && <Link to="/pauta" className={s.soonCard}><Megaphone size={20} aria-hidden /><span><strong>Agente de pauta</strong><br /><span className="muted">Gasto vs. tope, campañas y consultas · Próximamente</span></span></Link>}
        {can('web') && <Link to="/web" className={s.soonCard}><Globe size={20} aria-hidden /><span><strong>Admin web</strong><br /><span className="muted">Banners y productos · Próximamente</span></span></Link>}
      </div>

      <Collapsible title="¿Cómo se usa?">
        <div className={s.howto}>
          <p><strong>Ideas:</strong> Sofi carga ideas; Santi toca “Sí, la hago” o “No la hago”. Cuando la grabás, “Ya la hice” y pegás el link (Drive, IG, TikTok). Los “sí o sí” van directo a hacer.</p>
          <p><strong>Calendario:</strong> cada día muestra la grilla fija. Tocá un día para cargar qué se sube, el copy y las previsualizaciones (1080×1350 para feed, 1080×1920 para historias y reels).</p>
          <p><strong>Proyectos:</strong> tareas con responsables y fechas, novedades, fotos y PDFs. Solo las tareas de proyectos activos aparecen acá.</p>
          <p><strong>Videos:</strong> no se suben al sistema; se comparten con link de Drive.</p>
        </div>
      </Collapsible>
    </div>
  );
}
