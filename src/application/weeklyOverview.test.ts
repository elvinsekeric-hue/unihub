import { describe, expect, it } from 'vitest';

import type { Assignment } from '../domain/models';
import { getAssignmentsDueThisWeek } from './weeklyOverview';

const DAY_MS = 86_400_000;

function inMs(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function assignment(
  overrides: Partial<Assignment>,
): Assignment {
  return {
    id: 'assignment:1',
    courseId: 'course:lds',
    iliasRefId: '1',
    title: 'Blatt 1',
    url: 'https://example.test',
    status: 'not-started',
    isNew: false,
    ...overrides,
  };
}

describe('getAssignmentsDueThisWeek', () => {
  it('enthält Abgaben, die innerhalb von 7 Tagen fällig sind', () => {
    const result = getAssignmentsDueThisWeek([
      assignment({ id: 'a', dueAt: inMs(2 * DAY_MS) }),
    ]);

    expect(result.map((item) => item.id)).toEqual(['a']);
  });

  it('schließt Abgaben in mehr als 7 Tagen aus', () => {
    const result = getAssignmentsDueThisWeek([
      assignment({ id: 'a', dueAt: inMs(10 * DAY_MS) }),
    ]);

    expect(result).toHaveLength(0);
  });

  it('schließt bereits erledigte Abgaben aus', () => {
    const result = getAssignmentsDueThisWeek([
      assignment({
        id: 'a',
        dueAt: inMs(DAY_MS),
        status: 'graded',
      }),
    ]);

    expect(result).toHaveLength(0);
  });

  it('sortiert kursübergreifend nach Dringlichkeit', () => {
    const result = getAssignmentsDueThisWeek([
      assignment({
        id: 'later',
        courseId: 'course:dsa',
        dueAt: inMs(3 * DAY_MS),
      }),
      assignment({
        id: 'sooner',
        courseId: 'course:lds',
        dueAt: inMs(DAY_MS),
      }),
    ]);

    expect(result.map((item) => item.id)).toEqual([
      'sooner',
      'later',
    ]);
  });
});
