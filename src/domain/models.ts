export type EntityId = string;
export type IsoDateTime = string;

export type LearningObjectType =
  | 'file'
  | 'folder'
  | 'assignment'
  | 'announcement'
  | 'forum'
  | 'link';

export interface Semester {
  id: EntityId;
  name: string;
  startsAt?: IsoDateTime;
  endsAt?: IsoDateTime;
  isActive: boolean;
}

export interface Course {
  id: EntityId;
  iliasRefId: string;
  title: string;
  shortName: string;
  semesterId: EntityId;
  color: string;
  iliasUrl: string;
  lastSyncedAt?: IsoDateTime;
}

export interface Folder {
  id: EntityId;
  courseId: EntityId;
  parentFolderId?: EntityId;
  iliasRefId: string;
  title: string;
  url: string;
  path: string[];
}

export interface LearningFile {
  id: EntityId;
  courseId: EntityId;
  folderId?: EntityId;
  iliasRefId: string;
  title: string;
  url: string;
  mimeType?: string;
  fileSizeBytes?: number;
  pageCount?: number;
  description?: string;
  availableAt?: IsoDateTime;
  uploadedAt?: IsoDateTime;
  lastModifiedAt?: IsoDateTime;
  etag?: string;
  isNew: boolean;
  isDownloaded: boolean;
}

export interface Assignment {
  id: EntityId;
  courseId: EntityId;
  iliasRefId: string;
  iliasAssignmentId?: string;
  title: string;
  url: string;
  description?: string;
  startsAt?: IsoDateTime;
  dueAt?: IsoDateTime;
  submittedAt?: IsoDateTime;
  status: 'not-started' | 'in-progress' | 'submitted' | 'graded';
  isNew: boolean;
}

export interface Announcement {
  id: EntityId;
  courseId: EntityId;
  title: string;
  url: string;
  body?: string;
  publishedAt?: IsoDateTime;
  isNew: boolean;
}

export type ActivityItem =
  | ({ type: 'file' } & LearningFile)
  | ({ type: 'assignment' } & Assignment)
  | ({ type: 'announcement' } & Announcement);

export interface SyncSnapshot {
  courseId: EntityId;
  startedAt: IsoDateTime;
  completedAt: IsoDateTime;
  status: 'success' | 'partial' | 'failed';
  discovered: number;
  changed: number;
  removed: number;
  errorMessage?: string;
}
