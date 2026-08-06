import { describe, expect, it } from 'vitest';

import type { Assignment } from '../domain/models';
import { detectRecurringWeekday } from './recurringPattern';

function assignment(dueAt: string): Assignment {
  return {
    id: `assignment:${dueAt}`,
    courseId: 'course:lds',
    iliasRefId: '1',
    title: 'Blatt',
    url: 'https://example.test',
    status: 'not-started',
    isNew: false,
    dueAt,
  };
}

// Alle Daten sind bewusst als eindeutige Wochentage gewählt:
// Dienstage: 2026-08-04, 11, 18, 25 / Mittwoch: 2026-08-05

describe('detectRecurringWeekday', () => {
  it('erkennt ein dienstägliches Muster', () => {
    const result = detectRecurringWeekday([
      assignment('2026-08-04T12:00:00'),
      assignment('2026-08-11T12:00:00'),
      assignment('2026-08-18T12:00:00'),
      assignment('2026-08-25T12:00:00'),
    ]);

    expect(result?.weekdayLabel).toBe('dienstags');
    expect(result?.share).toBe(1);
  });

  it('liefert nichts bei zu wenigen Datenpunkten', () => {
    const result = detectRecurringWeekday([
      assignment('2026-08-04T12:00:00'),
      assignment('2026-08-11T12:00:00'),
    ]);

    expect(result).toBeUndefined();
  });

  it('liefert nichts ohne dominanten Wochentag', () => {
    const result = detectRecurringWeekday([
      assignment('2026-08-04T12:00:00'), // Di
      assignment('2026-08-05T12:00:00'), // Mi
      assignment('2026-08-06T12:00:00'), // Do
      assignment('2026-08-07T12:00:00'), // Fr
    ]);

    expect(result).toBeUndefined();
  });

  it('toleriert einzelne Ausreißer über der 60%-Schwelle', () => {
    const result = detectRecurringWeekday([
      assignment('2026-08-04T12:00:00'), // Di
      assignment('2026-08-11T12:00:00'), // Di
      assignment('2026-08-18T12:00:00'), // Di
      assignment('2026-08-05T12:00:00'), // Mi (Ausreißer)
    ]);

    expect(result?.weekdayLabel).toBe('dienstags');
    expect(result?.share).toBe(0.75);
  });

  it('ignoriert Abgaben ohne Frist', () => {
    const result = detectRecurringWeekday([
      assignment('2026-08-04T12:00:00'),
      { ...assignment('x'), dueAt: undefined },
      { ...assignment('y'), dueAt: undefined },
    ]);

    expect(result).toBeUndefined();
  });
});
