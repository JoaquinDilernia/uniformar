import { Segmented } from '../../components/ui/Segmented.jsx';
import s from './users.module.css';

export const SECTION_LABELS = { home: 'Inicio', ideas: 'Ideas', calendar: 'Calendario', projects: 'Proyectos', ads: 'Agente de pauta', web: 'Admin web' };
const LEVELS = [{ value: 'none', label: 'Sin acceso' }, { value: 'view', label: 'Ver' }, { value: 'edit', label: 'Editar' }];

export function PermissionMatrix({ value, onChange, disabled }) {
  return (
    <div className={s.matrix}>
      {Object.entries(SECTION_LABELS).map(([section, label]) => (
        <div key={section} className={s.matrixRow}>
          <span className={s.matrixLabel}>{label}</span>
          <Segmented label={label} value={value[section]} disabled={disabled} options={LEVELS} onChange={(level) => onChange({ ...value, [section]: level })} />
        </div>
      ))}
    </div>
  );
}
