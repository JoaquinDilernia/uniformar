import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FolderKanban } from 'lucide-react';
import { useCan } from '../../state/auth.jsx';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Segmented } from '../../components/ui/Segmented.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Fab } from '../../components/shell/Fab.jsx';
import { formatShort } from '../../lib/dates.js';
import { useCreateProject, useProjects } from './api.js';
import { ProjectForm } from './ProjectForm.jsx';
import s from './projects.module.css';
import p from '../pages.module.css';

const TABS = [['active', 'Activos'], ['proposal', 'Propuestas'], ['upcoming', 'Próximos'], ['done', 'Terminados']];

export function ProjectsPage() {
  const navigate = useNavigate();
  const canEdit = useCan()('projects', 'edit');
  const { data: projects = [] } = useProjects();
  const [tab, setTab] = usePersistentState('projects-tab', 'active');
  const [creating, setCreating] = useState(false);
  const create = useCreateProject();
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, projects.filter((x) => x.status === k).length])), [projects]);
  const list = projects.filter((x) => x.status === tab);

  function submit(body, onError) {
    if (create.isPending) return;
    create.mutate(body, { onError, onSuccess: (proj) => navigate(`/proyectos/${proj.id}`) });
  }

  return (
    <>
      <PageHeader title="Proyectos" subtitle={`${counts.active} activos`} actions={canEdit && <Button className="desktop-only" icon={Plus} onClick={() => setCreating(true)}>Nuevo proyecto</Button>} />
      <div className={p.page}>
        <div className={s.tabs}>
          <Segmented label="Estado de los proyectos" value={tab} onChange={setTab} options={TABS.map(([value, label]) => ({ value, label: `${label} ${counts[value]}` }))} />
        </div>
        {list.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No hay proyectos acá" />
        ) : (
          <div className={s.cards}>
            {list.map((x) => (
              <Link key={x.id} to={`/proyectos/${x.id}`} className={s.card}>
                <h2 className={s.cardTitle}>{x.name}</h2>
                {(x.start_date || x.end_date) && <p className="muted">{x.start_date ? formatShort(x.start_date) : '…'} → {x.end_date ? formatShort(x.end_date) : 'sin fecha'}</p>}
                <Progress value={x.task_done} max={x.task_total} label={`Avance de ${x.name}`} />
                <p className={s.cardMeta}>{x.task_total ? `${x.task_done} de ${x.task_total} tareas` : 'Sin tareas todavía'}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
      {canEdit && <Fab icon={Plus} label="Nuevo proyecto" onClick={() => setCreating(true)} />}
      <Sheet open={creating} onClose={() => setCreating(false)} title="Nuevo proyecto"
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" form="project-new" loading={create.isPending}>Crear</Button></>}>
        <ProjectForm formId="project-new" onSubmit={submit} />
      </Sheet>
    </>
  );
}
