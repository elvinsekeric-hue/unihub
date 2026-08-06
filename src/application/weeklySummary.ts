import type { ActivityItem, Assignment } from '../domain/models';
import { getAssignmentsDueThisWeek } from './weeklyOverview';

export interface WeeklySummaryCounts {
  newFiles: number;
  gradedAssignments: number;
  upcomingDeadlines: number;
}

export function buildWeeklySummaryCounts(
  activity: ActivityItem[],
  assignments: Assignment[],
): WeeklySummaryCounts {
  const newFiles = activity.filter(
    (item) => item.type === 'file' && item.isNew,
  ).length;

  const gradedAssignments = assignments.filter(
    (assignment) =>
      assignment.status === 'graded' &&
      assignment.isNew,
  ).length;

  const upcomingDeadlines =
    getAssignmentsDueThisWeek(assignments).length;

  return {
    newFiles,
    gradedAssignments,
    upcomingDeadlines,
  };
}

function pluralize(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatWeeklySummary(
  counts: WeeklySummaryCounts,
): string {
  return (
    `Diese Woche: ` +
    `${pluralize(
      counts.newFiles,
      'neue Datei',
      'neue Dateien',
    )}, ` +
    `${pluralize(
      counts.gradedAssignments,
      'bewertete Abgabe',
      'bewertete Abgaben',
    )}, ` +
    `${pluralize(
      counts.upcomingDeadlines,
      'anstehende Deadline',
      'anstehende Deadlines',
    )}`
  );
}
