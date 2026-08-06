import { describe, expect, it } from 'vitest';

import type { Assignment } from '../domain/models';
import {
  calculatePointsNeeded,
  summarizePoints,
} from './gradeCalculator';

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

describe('summarizePoints', () => {
  it('trennt bewertete von ausstehenden Punkten', () => {
    const summary = summarizePoints([
      assignment({ achievedPoints: 8, totalPoints: 10 }),
      assignment({ totalPoints: 10 }),
    ]);

    expect(summary.achieved).toBe(8);
    expect(summary.gradedTotal).toBe(10);
    expect(summary.remainingMaxPoints).toBe(10);
    expect(summary.remainingCount).toBe(1);
    expect(summary.grandTotal).toBe(20);
  });

  it('ignoriert Abgaben ohne Punkteinformation', () => {
    const summary = summarizePoints([
      assignment({}),
    ]);

    expect(summary.grandTotal).toBe(0);
  });
});

describe('calculatePointsNeeded', () => {
  it('meldet ein bereits erreichtes Ziel', () => {
    const result = calculatePointsNeeded(
      [
        assignment({ achievedPoints: 9, totalPoints: 10 }),
        assignment({ totalPoints: 10 }),
      ],
      40,
    );

    expect(result?.isAlreadyAchieved).toBe(true);
    expect(result?.requiredAdditionalPoints).toBe(0);
  });

  it('berechnet die nötige Durchschnittsquote der Restpunkte', () => {
    const result = calculatePointsNeeded(
      [
        assignment({ achievedPoints: 5, totalPoints: 10 }),
        assignment({ totalPoints: 10 }),
      ],
      75,
    );

    // Ziel: 75% von 20 = 15 Punkte, bereits 5 -> 10 weitere nötig
    // von maximal 10 verbleibenden -> 100%
    expect(result?.requiredAdditionalPoints).toBe(10);
    expect(result?.requiredAveragePercent).toBe(100);
    expect(result?.isAchievable).toBe(true);
  });

  it('erkennt ein unerreichbares Ziel', () => {
    const result = calculatePointsNeeded(
      [
        assignment({ achievedPoints: 2, totalPoints: 10 }),
        assignment({ totalPoints: 10 }),
      ],
      95,
    );

    expect(result?.isAchievable).toBe(false);
    expect(
      result!.requiredAveragePercent!,
    ).toBeGreaterThan(100);
  });

  it('liefert nichts ohne bepunktete Abgaben', () => {
    expect(
      calculatePointsNeeded(
        [assignment({ totalPoints: undefined })],
        50,
      ),
    ).toBeUndefined();
  });

  it('meldet null als nötige Quote, wenn keine Abgaben mehr offen sind', () => {
    const result = calculatePointsNeeded(
      [assignment({ achievedPoints: 3, totalPoints: 10 })],
      80,
    );

    expect(result?.remainingMaxPoints).toBe(0);
    expect(result?.requiredAveragePercent).toBeNull();
    expect(result?.isAchievable).toBe(false);
  });
});
