import { describe, it, expect } from 'vitest';
import { todayART, weekRange, monthGrid, addMonths, formatShort, formatLong, formatMonth, relativeTime } from './dates.js';

describe('fechas', () => {
  it('hoy en Argentina', () => {
    expect(todayART(new Date('2026-10-12T02:30:00Z'))).toBe('2026-10-11');
  });
  it('semana lunes a domingo', () => {
    expect(weekRange('2026-10-11')).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
  });
  it('grilla de octubre 2026: arranca lunes 28/9 y termina domingo 1/11', () => {
    const weeks = monthGrid('2026-10');
    expect(weeks[0][0]).toBe('2026-09-28');
    expect(weeks.at(-1)[6]).toBe('2026-11-01');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it('addMonths cruza el año', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('formatos en español', () => {
    expect(formatShort('2026-10-09')).toBe('9 oct');
    expect(formatLong('2026-10-09')).toMatch(/viernes.*9.*octubre/);
    expect(formatMonth('2026-10')).toMatch(/octubre.*2026/);
  });
  it('tiempo relativo', () => {
    const now = new Date('2026-10-07T15:00:00Z');
    expect(relativeTime('2026-10-07T14:59:30Z', now)).toBe('recién');
    expect(relativeTime('2026-10-07T14:40:00Z', now)).toBe('hace 20 min');
    expect(relativeTime('2026-10-07T12:00:00Z', now)).toBe('hace 3 h');
    expect(relativeTime('2026-10-05T15:00:00Z', now)).toBe('hace 2 d');
  });
});
