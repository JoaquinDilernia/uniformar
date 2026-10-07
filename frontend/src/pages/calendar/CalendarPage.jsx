import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useCan } from '../../state/auth.jsx';
import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Fab } from '../../components/shell/Fab.jsx';
import { addMonths, formatMonth, monthGrid, monthOf, todayART, weekdayOf } from '../../lib/dates.js';
import { useCalendarRange, useRules } from './api.js';
import { MonthGrid } from './MonthGrid.jsx';
import { WeekList } from './WeekList.jsx';
import { DaySheet } from './DaySheet.jsx';
import p from '../pages.module.css';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function CalendarPage() {
  const { date } = useParams();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const canEdit = useCan()('calendar', 'edit');
  const [month, setMonth] = useState(() => monthOf(date ?? todayART()));
  useEffect(() => { if (date) setMonth(monthOf(date)); }, [date]);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const from = weeks[0][0];
  const to = weeks.at(-1)[6];
  const { data: items = [] } = useCalendarRange(from, to);
  const { data: rules = [], isSuccess: rulesReady } = useRules();
  const byDate = useMemo(() => items.reduce((acc, i) => ({ ...acc, [i.date]: [...(acc[i.date] ?? []), i] }), {}), [items]);
  const rulesFor = (d) => rules.filter((r) => r.active && r.weekday === weekdayOf(d));
  const open = (d) => navigate(`/calendario/${d}`);

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle={cap(formatMonth(month))}
        actions={(
          <>
            <IconButton icon={ChevronLeft} label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))} />
            <Button variant="secondary" size="sm" onClick={() => setMonth(monthOf(todayART()))}>Hoy</Button>
            <IconButton icon={ChevronRight} label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))} />
          </>
        )}
      />
      <div className={p.page}>
        {desktop
          ? <MonthGrid weeks={weeks} month={month} byDate={byDate} rulesFor={rulesFor} onOpen={open} />
          : <WeekList weeks={weeks} month={month} byDate={byDate} rulesFor={rulesFor} onOpen={open} />}
      </div>
      {canEdit && <Fab icon={Plus} label="Agregar pieza" onClick={() => open(todayART())} />}
      {date && <DaySheet key={date} date={date} items={byDate[date] ?? []} rules={rulesFor(date)} rulesReady={rulesReady} onClose={() => navigate('/calendario')} />}
    </>
  );
}
