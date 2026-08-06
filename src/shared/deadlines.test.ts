import { describe, expect, it } from 'vitest';

import {
  formatCountdown,
  getDeadlineHint,
  getDeadlineTone,
  isDueWithinDays,
  sortByUrgency,
} from './deadlines';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function inMs(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe('getDeadlineTone', () => {
  it('erkennt überfällige Fristen', () => {
    expect(getDeadlineTone(inMs(-HOUR_MS))).toBe('overdue');
  });

  it('erkennt dringende Fristen (<=3 Tage)', () => {
    expect(getDeadlineTone(inMs(2 * DAY_MS))).toBe('warn');
  });

  it('erkennt entspannte Fristen (>3 Tage)', () => {
    expect(getDeadlineTone(inMs(10 * DAY_MS))).toBe('ok');
  });
});

describe('formatCountdown', () => {
  it('zeigt Tage und Stunden bei mehr als einem Tag', () => {
    expect(formatCountdown(inMs(2 * DAY_MS + HOUR_MS))).toMatch(
      /^Noch 2 Tage \d+ Std\.$/,
    );
  });

  it('zeigt Stunden und Minuten in der letzten Phase', () => {
    expect(formatCountdown(inMs(3 * HOUR_MS))).toMatch(
      /^Noch \d+ Std\. \d+ Min\.$/,
    );
  });

  it('meldet abgelaufene Fristen', () => {
    expect(formatCountdown(inMs(-HOUR_MS))).toBe(
      'Frist abgelaufen',
    );
  });
});

describe('getDeadlineHint', () => {
  it('liefert nichts für abgegebene Abgaben', () => {
    expect(
      getDeadlineHint({
        status: 'submitted',
        dueAt: inMs(DAY_MS),
      }),
    ).toBeUndefined();
  });

  it('liefert nichts ohne Frist', () => {
    expect(
      getDeadlineHint({ status: 'not-started' }),
    ).toBeUndefined();
  });

  it('liefert einen Hinweis für offene Abgaben mit Frist', () => {
    const hint = getDeadlineHint({
      status: 'in-progress',
      dueAt: inMs(DAY_MS),
    });

    expect(hint?.tone).toBe('warn');
    expect(hint?.text).toContain('Noch');
  });
});

describe('sortByUrgency', () => {
  it('sortiert nach frühester Frist, ohne Frist ans Ende', () => {
    const items = [
      { id: 'c', dueAt: undefined },
      { id: 'b', dueAt: inMs(2 * DAY_MS) },
      { id: 'a', dueAt: inMs(DAY_MS) },
    ];

    expect(sortByUrgency(items).map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('isDueWithinDays', () => {
  it('zählt überfällige offene Abgaben mit', () => {
    expect(
      isDueWithinDays(
        {
          id: 'a',
          courseId: 'c',
          iliasRefId: '1',
          title: 't',
          url: 'u',
          status: 'not-started',
          isNew: false,
          dueAt: inMs(-HOUR_MS),
        },
        7,
      ),
    ).toBe(true);
  });

  it('schließt bereits abgegebene Abgaben aus', () => {
    expect(
      isDueWithinDays(
        {
          id: 'a',
          courseId: 'c',
          iliasRefId: '1',
          title: 't',
          url: 'u',
          status: 'submitted',
          isNew: false,
          dueAt: inMs(DAY_MS),
        },
        7,
      ),
    ).toBe(false);
  });

  it('schließt zu weit entfernte Fristen aus', () => {
    expect(
      isDueWithinDays(
        {
          id: 'a',
          courseId: 'c',
          iliasRefId: '1',
          title: 't',
          url: 'u',
          status: 'not-started',
          isNew: false,
          dueAt: inMs(20 * DAY_MS),
        },
        7,
      ),
    ).toBe(false);
  });
});
