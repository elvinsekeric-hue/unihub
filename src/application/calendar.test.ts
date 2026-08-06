import { describe, expect, it } from 'vitest';

import type { Assignment } from '../domain/models';
import {
  buildMonthGrid,
  groupAssignmentsByDueDate,
} from './calendar';

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

describe('groupAssignmentsByDueDate', () => {
  it('gruppiert nach lokalem Kalendertag, ohne Uhrzeit', () => {
    const result = groupAssignmentsByDueDate([
      assignment({
        id: 'a',
        dueAt: '2026-08-10T08:00:00',
      }),
      assignment({
        id: 'b',
        dueAt: '2026-08-10T22:00:00',
      }),
    ]);

    expect(result.get('2026-08-10')).toHaveLength(2);
  });

  it('ignoriert Abgaben ohne Frist', () => {
    const result = groupAssignmentsByDueDate([
      assignment({ dueAt: undefined }),
    ]);

    expect(result.size).toBe(0);
  });
});

describe('buildMonthGrid', () => {
  it('liefert immer 42 Tage (6 volle Wochen)', () => {
    const grid = buildMonthGrid([], 2026, 7);

    expect(grid).toHaveLength(42);
  });

  it('beginnt die Woche am Montag', () => {
    // August 2026 beginnt an einem Samstag.
    const grid = buildMonthGrid([], 2026, 7);

    expect(grid[0].date).toBe('2026-07-27');
  });

  it('markiert Tage außerhalb des Monats', () => {
    const grid = buildMonthGrid([], 2026, 7);

    expect(grid[0].inCurrentMonth).toBe(false);

    const augustFirst = grid.find(
      (day) => day.date === '2026-08-01',
    );

    expect(augustFirst?.inCurrentMonth).toBe(true);
  });

  it('markiert den heutigen Tag', () => {
    const grid = buildMonthGrid(
      [],
      2026,
      7,
      new Date(2026, 7, 15),
    );

    const today = grid.find(
      (day) => day.date === '2026-08-15',
    );

    expect(today?.isToday).toBe(true);
  });

  it('ordnet Abgaben dem richtigen Tag zu', () => {
    const grid = buildMonthGrid(
      [
        assignment({
          id: 'a',
          dueAt: '2026-08-05T12:00:00',
        }),
      ],
      2026,
      7,
    );

    const day = grid.find(
      (entry) => entry.date === '2026-08-05',
    );

    expect(day?.assignments.map((item) => item.id)).toEqual(
      ['a'],
    );
  });
});
