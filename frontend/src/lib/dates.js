// Argentina: UTC−3 fijo. Las fechas de negocio viajan como 'YYYY-MM-DD'.
const OFFSET_MS = 3 * 60 * 60 * 1000;

export const todayART = (now = new Date()) => new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 10);

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const weekStart = (date) => addDays(date, weekdayOf(date) === 0 ? -6 : 1 - weekdayOf(date));

export function weekRange(date) {
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6], days };
}

export const monthOf = (date) => date.slice(0, 7);

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthGrid(ym) {
  const first = `${ym}-01`;
  const last = addDays(`${addMonths(ym, 1)}-01`, -1);
  const weeks = [];
  for (let start = weekStart(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

const fmt = (date, opts) => new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T00:00:00Z`));
export const formatShort = (date) => fmt(date, { day: 'numeric', month: 'short' }).replace('.', '');
export const formatLong = (date) => fmt(date, { weekday: 'long', day: 'numeric', month: 'long' });
export const formatMonth = (ym) => fmt(`${ym}-01`, { month: 'long', year: 'numeric' });

export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEK_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function relativeTime(iso, now = new Date()) {
  const s = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `hace ${Math.floor(s / 86400)} d`;
  return formatShort(todayART(new Date(iso)));
}
