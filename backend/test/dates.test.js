import { describe, it, expect } from 'vitest';
import { todayART, weekRange, addDays, weekdayOf } from '../src/lib/dates.js';

describe('fechas', () => {
  it('domingo 23:30 en Argentina sigue siendo domingo', () => {
    expect(todayART(new Date('2026-10-12T02:30:00Z'))).toBe('2026-10-11');
    expect(todayART(new Date('2026-10-12T03:00:00Z'))).toBe('2026-10-12');
  });

  it('semana de lunes a domingo', () => {
    expect(weekRange('2026-10-11')).toMatchObject({ start: '2026-10-05', end: '2026-10-11' }); // domingo
    expect(weekRange('2026-10-05').start).toBe('2026-10-05'); // lunes
    expect(weekRange('2026-10-07').days).toHaveLength(7);
  });

  it('addDays cruza meses y años', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(weekdayOf('2026-10-07')).toBe(3);
  });
});
