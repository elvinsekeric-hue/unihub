import type { ActivityItem, Assignment, Course, Semester } from '../domain/models';
import type { UniHubRepository } from '../domain/repositories';

export interface DashboardData {
  semester: Semester;
  courses: Course[];
  activity: ActivityItem[];
  assignments: Assignment[];
}

export async function loadDashboard(repository: UniHubRepository): Promise<DashboardData> {
  const [semester, courses, activity, assignments] = await Promise.all([
    repository.getActiveSemester(),
    repository.getCourses(),
    repository.getActivity(),
    repository.getAssignments(),
  ]);

  return { semester, courses, activity, assignments };
}

function getActivityDescription(item: ActivityItem): string {
  switch (item.type) {
    case 'file':
    case 'assignment':
      return item.description ?? '';

    case 'announcement':
      return item.body ?? '';
  }
}

export function filterActivity(
  activity: ActivityItem[],
  courseId: string,
  query: string,
): ActivityItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('de-DE');

  return activity.filter((item) => {
    const matchesCourse = courseId === 'all' || item.courseId === courseId;
    const searchable =
`${item.title} ${getActivityDescription(item)}`.toLocaleLowerCase("de-DE");
    const matchesQuery = normalizedQuery.length === 0 || searchable.includes(normalizedQuery);
    return matchesCourse && matchesQuery;
  });
}

function urgencyScore(item: ActivityItem): number {
  if (
    item.type === 'assignment' &&
    item.dueAt &&
    item.status !== 'submitted' &&
    item.status !== 'graded'
  ) {
    return new Date(item.dueAt).getTime();
  }

  return Number.POSITIVE_INFINITY;
}

/**
 * Standard-Reihenfolge des Feeds: offene Abgaben mit der
 * nächstgelegenen Frist zuerst, dann Neues vor Bekanntem.
 */
export function sortActivityByUrgency(
  activity: ActivityItem[],
): ActivityItem[] {
  return [...activity].sort((left, right) => {
    const leftScore = urgencyScore(left);
    const rightScore = urgencyScore(right);

    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    if (left.isNew !== right.isNew) {
      return left.isNew ? -1 : 1;
    }

    return 0;
  });
}
