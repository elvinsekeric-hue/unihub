import type {
  ActivityItem,
  Assignment,
  Course,
  EntityId,
  Folder,
  LearningFile,
  Semester,
  SubmissionEvent,
  SyncSnapshot,
} from './models';

export interface UniHubRepository {
  getActiveSemester(): Promise<Semester>;
  getCourses(): Promise<Course[]>;
  getFolders(courseId?: EntityId): Promise<Folder[]>;
  getFiles(courseId?: EntityId): Promise<LearningFile[]>;
  getAssignments(courseId?: EntityId): Promise<Assignment[]>;
  updateAssignmentNote(
    assignmentId: string,
    note: string,
  ): Promise<void>;
  getSubmissionEvents(
    assignmentId: EntityId,
  ): Promise<SubmissionEvent[]>;
  getActivity(): Promise<ActivityItem[]>;
  saveSyncSnapshot(snapshot: SyncSnapshot): Promise<void>;
}
