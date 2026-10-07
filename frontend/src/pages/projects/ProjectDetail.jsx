import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { useAuth, useCan } from '../../state/auth.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Progress } from '../../components/ui/Progress.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { ImageUploader } from '../../components/media/ImageUploader.jsx';
import { PdfList } from '../../components/media/PdfList.jsx';
import { formatShort, relativeTime } from '../../lib/dates.js';
import { projectKeys, useDeleteProject, useProject, useProjectActivity, useUpdateProject } from './api.js';
import { InlineText } from './InlineText.jsx';
import { TaskList } from './TaskList.jsx';
import { UpdatesFeed } from './UpdatesFeed.jsx';
import { ProjectForm } from './ProjectForm.jsx';
import s from './projects.module.css';
import p from '../pages.module.css';

const ACTION = { create: 'creó el proyecto', update: 'editó el proyecto', task_create: 'agregó una tarea', task_update: 'actualizó una tarea', task_delete: 'borró una tarea' };

function Activity({ id }) {
  const { data = [], isPending } = useProjectActivity(id, true);
  if (isPending) return <div style={{ padding: 16 }}><Spinner /></div>;
  return (
    <ul className={s.activity}>
      {data.map((a) => <li key={a.id}><strong>{a.actor_name ?? 'Alguien'}</strong> {ACTION[a.action] ?? a.action}{a.diff?.task?.from ? `: "${a.diff.task.from}"` : a.diff?.task?.to ? `: "${a.diff.task.to}"` : ''} <span className="muted">· {relativeTime(a.created_at)}</span></li>)}
    </ul>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = useCan()('projects', 'edit');
  const { data: project, isPending, isError } = useProject(id);
  const updateText = useUpdateProject(id); // textos largos (cada InlineText controla su propio guardado)
  const updateData = useUpdateProject(id); // hoja "Datos": su botón refleja esta instancia
  const del = useDeleteProject();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);

  if (isPending) return <div className={p.center}><Spinner size={28} /></div>;
  if (isError) return <div className={p.center}><h2>No encontramos este proyecto</h2></div>;

  const saveText = (field) => (text, opts) => updateText.mutate({ [field]: text }, opts);
  const done = project.tasks.filter((t) => t.done).length;

  function saveData(body, onError) {
    if (updateData.isPending) return;
    updateData.mutate(body, { onError, onSuccess: () => setEditing(false) });
  }

  async function remove() {
    if (del.isPending) return;
    const ok = await confirm({ title: `¿Borrar "${project.name}"?`, message: 'Se borran sus tareas, novedades, fotos y PDFs. No se puede deshacer.', confirmLabel: 'Borrar proyecto', danger: true });
    if (ok) del.mutate(id, { onSuccess: () => navigate('/proyectos', { replace: true }) });
  }

  return (
    <>
      <PageHeader back="/proyectos" title={project.name}
        subtitle={[project.start_date && `Desde ${formatShort(project.start_date)}`, project.end_date && `cierre ${formatShort(project.end_date)}`].filter(Boolean).join(' · ') || undefined}
        actions={canEdit && <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)}>Datos</Button>} />
      <div className={p.page}>
        <div className={s.summary}>
          <StatusBadge kind="project" status={project.status} />
          <div className={s.summaryProgress}><Progress value={done} max={project.tasks.length} label="Avance" /></div>
          <span className="muted">{done}/{project.tasks.length} tareas</span>
        </div>
        <div className={s.columns}>
          <div className={s.col}>
            <InlineText draftKey={`p-${id}-goal`} label="Qué queremos hacer" value={project.goal_text} onSave={saveText('goal_text')} canEdit={canEdit} placeholder="Contá el objetivo del proyecto." />
            <InlineText draftKey={`p-${id}-doing`} label="Qué se está haciendo" value={project.doing_text} onSave={saveText('doing_text')} canEdit={canEdit} placeholder="¿En qué está ahora?" />
            <InlineText draftKey={`p-${id}-how`} label="Cómo se va a hacer" value={project.how_text} onSave={saveText('how_text')} canEdit={canEdit} placeholder="Pasos, responsables, herramientas." />
            <section className={s.block} aria-label="Fotos">
              <div className={s.blockHead}><h2>Fotos</h2></div>
              <ImageUploader ownerType="project_photo" ownerId={id} files={project.photos} invalidate={[projectKeys.one(id)]} canEdit={canEdit} canDelete={user?.can_delete} max={50} />
            </section>
            <section className={s.block} aria-label="PDFs">
              <div className={s.blockHead}><h2>PDFs</h2></div>
              <PdfList ownerType="project_pdf" ownerId={id} files={project.pdfs} invalidate={[projectKeys.one(id)]} canEdit={canEdit} canDelete={user?.can_delete} />
            </section>
          </div>
          <div className={s.col}>
            <TaskList project={project} canEdit={canEdit} />
            <UpdatesFeed project={project} canEdit={canEdit} />
            <Collapsible title="Historial de cambios"><Activity id={id} /></Collapsible>
            {canEdit && user?.can_delete && (
              <Button variant="danger" size="sm" icon={Trash2} loading={del.isPending} onClick={remove}>
                Borrar proyecto
              </Button>
            )}
          </div>
        </div>
      </div>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Datos del proyecto"
        footer={<><Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button><Button type="submit" form="project-edit" loading={updateData.isPending}>Guardar</Button></>}>
        <ProjectForm formId="project-edit" initial={project} onSubmit={saveData} />
      </Sheet>
    </>
  );
}
