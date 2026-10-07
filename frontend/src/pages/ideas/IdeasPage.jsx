import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, Lightbulb } from 'lucide-react';
import { useCan } from '../../state/auth.jsx';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Chip, ChipGroup } from '../../components/ui/Chip.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Sheet } from '../../components/ui/Sheet.jsx';
import { Fab } from '../../components/shell/Fab.jsx';
import { FORMAT_FILTERS, TYPE_FILTERS, STATUS_FILTERS, filterIdeas, groupIdeas, countByStatus } from '../../lib/groupIdeas.js';
import { useIdeas, useCreateIdea } from './api.js';
import { IdeaRow } from './IdeaRow.jsx';
import { IdeaSheet } from './IdeaSheet.jsx';
import { IdeaForm } from './IdeaForm.jsx';
import s from './ideas.module.css';
import p from '../pages.module.css';

const DEFAULT_FILTERS = { format: 'all', category: 'all', status: 'all' };

function NewIdeaSheet({ onClose }) {
  const create = useCreateIdea();
  return (
    <Sheet open onClose={onClose} title="Nueva idea" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="idea-new" loading={create.isPending}>Guardar idea</Button></>}>
      <IdeaForm formId="idea-new" />
    </Sheet>
  );
}

export function IdeasPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canEdit = useCan()('ideas', 'edit');
  const { data: ideas, isPending } = useIdeas();
  const [filters, setFilters] = usePersistentState('ideas-filters', DEFAULT_FILTERS);
  const [openGroups, setOpenGroups] = usePersistentState('ideas-open', {});
  const [q, setQ] = useState('');

  const all = ideas ?? [];
  const groups = useMemo(() => groupIdeas(filterIdeas(all, { ...filters, q })), [all, filters, q]);
  const counts = useMemo(() => countByStatus(all), [all]);
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const filtered = filters.format !== 'all' || filters.category !== 'all' || filters.status !== 'all' || q;
  const close = () => navigate('/ideas');

  return (
    <>
      <PageHeader
        title="Ideas"
        subtitle={`${counts.por_decidir} por decidir · ${counts.por_hacer + counts.si_o_si} por hacer`}
        actions={canEdit && <Button className="desktop-only" icon={Plus} onClick={() => navigate('/ideas/nueva')}>Nueva idea</Button>}
      />
      <div className={p.page}>
        <div className={s.filters}>
          <label className={s.search}>
            <Search size={18} aria-hidden />
            <input type="search" placeholder="Buscar en ideas, clientes y notas" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ideas" />
          </label>
          <ChipGroup label="Formato">
            {FORMAT_FILTERS.map((f) => <Chip key={f.value} selected={filters.format === f.value} onClick={() => setFilter('format', f.value)}>{f.label}</Chip>)}
          </ChipGroup>
          <ChipGroup label="Tipo">
            {TYPE_FILTERS.map((f) => <Chip key={f.value} selected={filters.category === f.value} onClick={() => setFilter('category', f.value)}>{f.label}</Chip>)}
          </ChipGroup>
          <ChipGroup label="Estado">
            {STATUS_FILTERS.map((f) => (
              <Chip key={f.value} selected={filters.status === f.value} onClick={() => setFilter('status', f.value)} count={f.value === 'all' ? undefined : counts[f.value]}>{f.label}</Chip>
            ))}
          </ChipGroup>
          {filtered && <button type="button" className={s.clear} onClick={() => { setFilters(DEFAULT_FILTERS); setQ(''); }}>Limpiar filtros</button>}
        </div>

        {isPending ? (
          <div className={p.center}><Spinner size={28} label="Cargando ideas" /></div>
        ) : groups.length === 0 ? (
          <EmptyState icon={Lightbulb} title={filtered ? 'No hay ideas con estos filtros' : 'Todavía no hay ideas'}
            action={canEdit && !filtered && <Button icon={Plus} onClick={() => navigate('/ideas/nueva')}>Cargar la primera</Button>}>
            {filtered ? 'Probá sacando algún filtro.' : 'Cargá una idea y Santi decide si la hace.'}
          </EmptyState>
        ) : (
          <div className={s.groups}>
            {groups.map((g) => (
              <Collapsible key={g.key} title={g.title} count={g.ideas.length} summary={g.summary}
                open={Boolean(q) || Boolean(openGroups[g.key])} onToggle={(o) => setOpenGroups((prev) => ({ ...prev, [g.key]: o }))}>
                {g.ideas.map((i) => <IdeaRow key={i.id} idea={i} onOpen={() => navigate(`/ideas/${i.id}`)} />)}
              </Collapsible>
            ))}
          </div>
        )}
      </div>
      {canEdit && <Fab icon={Plus} label="Nueva idea" onClick={() => navigate('/ideas/nueva')} />}
      {id === 'nueva' && canEdit && <NewIdeaSheet onClose={close} />}
      {id && id !== 'nueva' && <IdeaSheet key={id} id={id} onClose={close} />}
    </>
  );
}
