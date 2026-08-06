import { describe, expect, it } from 'vitest';

import type { ActivityItem, Assignment } from '../domain/models';
import {
  buildWeeklySummaryCounts,
  formatWeeklySummary,
} from './weeklySummary';

const DAY_MS = 86_400_000;

function inMs(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function file(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    type: 'file',
    id: 'file:1',
    courseId: 'course:lds',
    iliasRefId: '1',
    title: 'Datei',
    url: 'https://example.test',
    isNew: false,
    isDownloaded: false,
    isRemoved: false,
    ...overrides,
  } as ActivityItem;
}

function assignment(
  overrides: Partial<Assignment>,
): Assignment {
  return {
    id: 'assignment:1',
    courseId: 'course:lds',
    iliasRefId: '1',
    title: 'Blatt',
    url: 'https://example.test',
    status: 'not-started',
    isNew: false,
    ...overrides,
  };
}

describe('buildWeeklySummaryCounts', () => {
  it('zählt neue Dateien, neu bewertete Abgaben und anstehende Fristen', () => {
    const counts = buildWeeklySummaryCounts(
      [
        file({ id: 'a', isNew: true }),
        file({ id: 'b', isNew: false }),
      ],
      [
        assignment({
          id: 'c',
          status: 'graded',
          isNew: true,
        }),
        assignment({
          id: 'd',
          status: 'graded',
          isNew: false,
        }),
        assignment({
          id: 'e',
          dueAt: inMs(2 * DAY_MS),
        }),
      ],
    );

    expect(counts).toEqual({
      newFiles: 1,
      gradedAssignments: 1,
      upcomingDeadlines: 1,
    });
  });
});

describe('formatWeeklySummary', () => {
  it('formatiert Singular korrekt', () => {
    expect(
      formatWeeklySummary({
        newFiles: 1,
        gradedAssignments: 1,
        upcomingDeadlines: 1,
      }),
    ).toBe(
      'Diese Woche: 1 neue Datei, 1 bewertete Abgabe, ' +
        '1 anstehende Deadline',
    );
  });

  it('formatiert Plural und Null korrekt', () => {
    expect(
      formatWeeklySummary({
        newFiles: 0,
        gradedAssignments: 3,
        upcomingDeadlines: 2,
      }),
    ).toBe(
      'Diese Woche: 0 neue Dateien, 3 bewertete Abgaben, ' +
        '2 anstehende Deadlines',
    );
  });
});
