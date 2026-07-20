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

export function filterActivity(
  activity: ActivityItem[],
  courseId: string,
  query: string,
): ActivityItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('de-DE');

  return activity.filter((item) => {
    const matchesCourse = courseId === 'all' || item.courseId === courseId;
    const searchable = `${item.title} ${item.description ?? ''}`.toLocaleLowerCase('de-DE');
    const matchesQuery = normalizedQuery.length === 0 || searchable.includes(normalizedQuery);
    return matchesCourse && matchesQuery;
  });
}
