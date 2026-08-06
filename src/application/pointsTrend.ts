import type { Assignment } from '../domain/models';

/**
 * Kumulierte Prozent-Erfüllung über die Reihenfolge der bewerteten
 * Abgaben eines Kurses (nach Fälligkeitsdatum, ohne Frist ans
 * Ende). Dient als einfache Trendlinie ohne zusätzliche
 * Datenbank-Abfragen der Abgabehistorie.
 */
export function buildPointsTrend(
  assignments: Assignment[],
): number[] {
  const graded = assignments
    .filter(
      (assignment) =>
        assignment.achievedPoints !== undefined &&
        assignment.totalPoints !== undefined,
    )
    .sort((left, right) => {
      if (!left.dueAt) return 1;
      if (!right.dueAt) return -1;
      return left.dueAt.localeCompare(right.dueAt);
    });

  let achievedSum = 0;
  let totalSum = 0;

  return graded.map((assignment) => {
    achievedSum += assignment.achievedPoints ?? 0;
    totalSum += assignment.totalPoints ?? 0;

    return totalSum > 0
      ? (achievedSum / totalSum) * 100
      : 0;
  });
}
