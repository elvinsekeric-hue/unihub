import type { Assignment } from '../domain/models';
import { isDueWithinDays, sortByUrgency } from '../shared/deadlines';

const WEEK_DAYS = 7;

/**
 * Kursübergreifend alle offenen Abgaben, deren Frist innerhalb der
 * nächsten sieben Tage liegt (inkl. bereits überfälliger, aber noch
 * offener Abgaben), sortiert nach Dringlichkeit.
 */
export function getAssignmentsDueThisWeek(
  assignments: Assignment[],
): Assignment[] {
  return sortByUrgency(
    assignments.filter((assignment) =>
      isDueWithinDays(assignment, WEEK_DAYS),
    ),
  );
}
