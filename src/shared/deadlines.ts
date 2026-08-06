import type { Assignment } from '../domain/models';

export type DeadlineTone = 'ok' | 'warn' | 'overdue';

export interface DeadlineHint {
  text: string;
  tone: DeadlineTone;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function isOpenAssignment(
  assignment: Pick<Assignment, 'status'>,
): boolean {
  return (
    assignment.status !== 'submitted' &&
    assignment.status !== 'graded'
  );
}

export function getDeadlineTone(
  dueAt: string,
): DeadlineTone {
  const diffMs =
    new Date(dueAt).getTime() - Date.now();

  if (diffMs < 0) {
    return 'overdue';
  }

  if (diffMs <= 3 * DAY_MS) {
    return 'warn';
  }

  return 'ok';
}

/**
 * Eskalierender Countdown-Text: Tage+Stunden solange mehr als ein
 * Tag verbleibt, sonst Stunden+Minuten für die letzte, dringendste
 * Phase vor der Frist.
 */
export function formatCountdown(dueAt: string): string {
  const diffMs =
    new Date(dueAt).getTime() - Date.now();

  if (diffMs < 0) {
    return 'Frist abgelaufen';
  }

  const days = Math.floor(diffMs / DAY_MS);

  if (days > 0) {
    const hours = Math.floor(
      (diffMs % DAY_MS) / HOUR_MS,
    );

    return (
      `Noch ${days} ${days === 1 ? 'Tag' : 'Tage'} ` +
      `${hours} Std.`
    );
  }

  const hours = Math.floor(diffMs / HOUR_MS);
  const minutes = Math.floor(
    (diffMs % HOUR_MS) / 60_000,
  );

  return `Noch ${hours} Std. ${minutes} Min.`;
}

export function getDeadlineHint(
  assignment: Pick<
    Assignment,
    'status' | 'dueAt'
  >,
): DeadlineHint | undefined {
  if (
    !isOpenAssignment(assignment) ||
    !assignment.dueAt
  ) {
    return undefined;
  }

  const tone = getDeadlineTone(assignment.dueAt);
  const icon = tone === 'ok' ? '📅' : '⏰';

  return {
    text: `${icon} ${formatCountdown(assignment.dueAt)}`,
    tone,
  };
}

/**
 * Standard-Sortierung nach Dringlichkeit: früheste Frist zuerst,
 * Einträge ohne Frist ans Ende.
 */
export function sortByUrgency<
  T extends { dueAt?: string },
>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    if (!left.dueAt) {
      return 1;
    }

    if (!right.dueAt) {
      return -1;
    }

    return left.dueAt.localeCompare(right.dueAt);
  });
}

/**
 * Noch offene Abgaben, deren Frist innerhalb der nächsten `days`
 * Tage liegt (bereits überfällige, aber weiterhin offene Abgaben
 * zählen ebenfalls dazu).
 */
export function isDueWithinDays(
  assignment: Assignment,
  days: number,
): boolean {
  if (
    !assignment.dueAt ||
    !isOpenAssignment(assignment)
  ) {
    return false;
  }

  const diffMs =
    new Date(assignment.dueAt).getTime() -
    Date.now();

  return diffMs <= days * DAY_MS;
}
