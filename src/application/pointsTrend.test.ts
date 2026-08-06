import { describe, expect, it } from 'vitest';

import type { Assignment } from '../domain/models';
import { buildPointsTrend } from './pointsTrend';

function assignment(
  overrides: Partial<Assignment>,
): Assignment {
  return {
    id: `assignment:${Math.random()}`,
    courseId: 'course:lds',
    iliasRefId: '1',
    title: 'Blatt',
    url: 'https://example.test',
    status: 'graded',
    isNew: false,
    ...overrides,
  };
}

describe('buildPointsTrend', () => {
  it('ignoriert unbewertete Abgaben', () => {
    expect(
      buildPointsTrend([assignment({ totalPoints: 10 })]),
    ).toHaveLength(0);
  });

  it('kumuliert die Prozentquote in chronologischer Reihenfolge', () => {
    const trend = buildPointsTrend([
      assignment({
        dueAt: '2026-08-10T00:00:00.000Z',
        achievedPoints: 4,
        totalPoints: 10,
      }),
      assignment({
        dueAt: '2026-08-03T00:00:00.000Z',
        achievedPoints: 8,
        totalPoints: 10,
      }),
    ]);

    // Erst 2026-08-03 (8/10 = 80%), dann kumuliert 2026-08-10
    // (12/20 = 60%)
    expect(trend).toEqual([80, 60]);
  });
});
