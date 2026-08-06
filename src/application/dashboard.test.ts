import { describe, expect, it } from 'vitest';

import type { ActivityItem } from '../domain/models';
import { sortActivityByUrgency } from './dashboard';

const DAY_MS = 86_400_000;

function inMs(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function file(
  overrides: Partial<ActivityItem>,
): ActivityItem {
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
  overrides: Partial<ActivityItem>,
): ActivityItem {
  return {
    type: 'assignment',
    id: 'assignment:1',
    courseId: 'course:lds',
    iliasRefId: '1',
    title: 'Blatt 1',
    url: 'https://example.test',
    status: 'not-started',
    isNew: false,
    ...overrides,
  } as ActivityItem;
}

describe('sortActivityByUrgency', () => {
  it('stellt die nächste offene Frist an den Anfang', () => {
    const result = sortActivityByUrgency([
      file({ id: 'file:1' }),
      assignment({
        id: 'assignment:far',
        dueAt: inMs(10 * DAY_MS),
      }),
      assignment({
        id: 'assignment:soon',
        dueAt: inMs(DAY_MS),
      }),
    ]);

    expect(result[0].id).toBe('assignment:soon');
  });

  it('ignoriert bereits erledigte Abgaben bei der Dringlichkeit', () => {
    const result = sortActivityByUrgency([
      assignment({
        id: 'assignment:graded',
        dueAt: inMs(DAY_MS),
        status: 'graded',
      }),
      file({ id: 'file:new', isNew: true }),
    ]);

    expect(result[0].id).toBe('file:new');
  });

  it('bevorzugt neue Inhalte, wenn keine Frist entscheidet', () => {
    const result = sortActivityByUrgency([
      file({ id: 'file:old', isNew: false }),
      file({ id: 'file:new', isNew: true }),
    ]);

    expect(result[0].id).toBe('file:new');
  });
});
