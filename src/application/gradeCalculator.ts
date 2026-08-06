import type { Assignment } from '../domain/models';

export interface PointsSummary {
  achieved: number;
  gradedTotal: number;
  remainingMaxPoints: number;
  remainingCount: number;
  grandTotal: number;
}

export function summarizePoints(
  assignments: Assignment[],
): PointsSummary {
  let achieved = 0;
  let gradedTotal = 0;
  let remainingMaxPoints = 0;
  let remainingCount = 0;

  for (const assignment of assignments) {
    if (assignment.totalPoints === undefined) {
      continue;
    }

    if (assignment.achievedPoints !== undefined) {
      achieved += assignment.achievedPoints;
      gradedTotal += assignment.totalPoints;
    } else {
      remainingMaxPoints += assignment.totalPoints;
      remainingCount += 1;
    }
  }

  return {
    achieved,
    gradedTotal,
    remainingMaxPoints,
    remainingCount,
    grandTotal: gradedTotal + remainingMaxPoints,
  };
}

export interface GradeTargetResult {
  targetPercent: number;
  requiredAdditionalPoints: number;
  remainingMaxPoints: number;
  remainingCount: number;
  /** null = es gibt keine weiteren Abgaben, um das Ziel zu erreichen */
  requiredAveragePercent: number | null;
  isAlreadyAchieved: boolean;
  isAchievable: boolean;
}

/**
 * Berechnet, wie viele Punkte im Schnitt in den verbleibenden
 * (noch nicht bewerteten) Abgaben nötig sind, um eine gewünschte
 * Gesamt-Prozentzahl über alle bewertbaren Abgaben zu erreichen.
 */
export function calculatePointsNeeded(
  assignments: Assignment[],
  targetPercent: number,
): GradeTargetResult | undefined {
  const summary = summarizePoints(assignments);

  if (summary.grandTotal <= 0) {
    return undefined;
  }

  const targetPoints =
    (targetPercent / 100) * summary.grandTotal;

  const requiredAdditionalPoints = Math.max(
    0,
    targetPoints - summary.achieved,
  );

  const isAlreadyAchieved =
    requiredAdditionalPoints <= 0;

  const requiredAveragePercent =
    summary.remainingMaxPoints > 0
      ? (requiredAdditionalPoints /
          summary.remainingMaxPoints) *
        100
      : null;

  const isAchievable =
    isAlreadyAchieved ||
    (requiredAveragePercent !== null &&
      requiredAveragePercent <= 100);

  return {
    targetPercent,
    requiredAdditionalPoints,
    remainingMaxPoints: summary.remainingMaxPoints,
    remainingCount: summary.remainingCount,
    requiredAveragePercent,
    isAlreadyAchieved,
    isAchievable,
  };
}
