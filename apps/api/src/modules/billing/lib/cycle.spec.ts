import { describe, expect, it } from 'vitest';
import { currentCycle, monthKey, monthStart, nextCycleDueDate } from './cycle.js';

describe('billing cycle windows (competência per recurrence)', () => {
  it('monthly: the calendar month with the due day inside it', () => {
    expect(currentCycle('monthly', 5, '2026-08-09')).toEqual({
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      dueDate: '2026-08-05',
    });
    // February stays valid because due_day is capped at 28 (schema CHECK).
    expect(currentCycle('monthly', 28, '2026-02-10')).toEqual({
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      dueDate: '2026-02-28',
    });
  });

  it('quarterly: calendar quarters starting Jan/Apr/Jul/Oct', () => {
    expect(currentCycle('quarterly', 15, '2026-08-09')).toEqual({
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      dueDate: '2026-07-15',
    });
    expect(currentCycle('quarterly', 15, '2026-12-31').periodStart).toBe('2026-10-01');
  });

  it('semiannual and yearly windows', () => {
    expect(currentCycle('semiannual', 10, '2026-08-09')).toEqual({
      periodStart: '2026-07-01',
      periodEnd: '2026-12-31',
      dueDate: '2026-07-10',
    });
    expect(currentCycle('yearly', 5, '2026-08-09')).toEqual({
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      dueDate: '2026-01-05',
    });
  });

  it('next-cycle due date rolls across the year boundary', () => {
    expect(nextCycleDueDate('monthly', 5, '2026-08-09')).toBe('2026-09-05');
    expect(nextCycleDueDate('monthly', 5, '2026-12-09')).toBe('2027-01-05');
    expect(nextCycleDueDate('quarterly', 15, '2026-11-01')).toBe('2027-01-15');
    expect(nextCycleDueDate('yearly', 5, '2026-08-09')).toBe('2027-01-05');
  });

  it('month helpers roll negative and positive offsets', () => {
    expect(monthStart('2026-08-09', 0)).toBe('2026-08-01');
    expect(monthStart('2026-01-15', -1)).toBe('2025-12-01');
    expect(monthStart('2026-12-15', 1)).toBe('2027-01-01');
    expect(monthKey('2026-08-09', -5)).toBe('2026-03');
  });
});
