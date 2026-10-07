// Argentina es UTC−3 fijo (sin horario de verano), así que no hace falta tzdata
const OFFSET_MS = 3 * 60 * 60 * 1000;

export const todayART = (now = new Date()) => new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 10);

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function weekRange(date) {
  const wd = weekdayOf(date);
  const start = addDays(date, wd === 0 ? -6 : 1 - wd);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, end: days[6], days };
}

export const artDayStartISO = (date) => `${date}T00:00:00-03:00`;
