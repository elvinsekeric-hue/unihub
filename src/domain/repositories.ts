import type {
  ActivityItem,
  Assignment,
  Course,
  EntityId,
  Folder,
  LearningFile,
  Semester,
  SyncSnapshot,
} from './models';

export interface UniHubRepository {
  getActiveSemester(): Promise<Semester>;
  getCourses(): Promise<Course[]>;
  getFolders(courseId?: EntityId): Promise<Folder[]>;
  getFiles(courseId?: EntityId): Promise<LearningFile[]>;
  getAssignments(courseId?: EntityId): Promise<Assignment[]>;
  getActivity(): Promise<ActivityItem[]>;
  saveSyncSnapshot(snapshot: SyncSnapshot): Promise<void>;
}
