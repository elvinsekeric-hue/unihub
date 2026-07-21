import type {
  Course,
  Folder,
  LearningFile,
} from '../domain/models';
import type { UniHubRepository } from '../domain/repositories';

export interface CourseViewData {
  course: Course;
  folders: Folder[];
  files: LearningFile[];
}

export async function loadCourseView(
  repository: UniHubRepository,
  course: Course,
): Promise<CourseViewData> {
  const [folders, files] = await Promise.all([
    repository.getFolders(course.id),
    repository.getFiles(course.id),
  ]);

  return {
    course,
    folders,
    files,
  };
}