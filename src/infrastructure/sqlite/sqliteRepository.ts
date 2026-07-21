import { loadFolders } from './folderStore';
import type {
  ActivityItem,
  Assignment,
  Course,
  EntityId,
  Folder,
  LearningFile,
  Semester,
  SyncSnapshot,
} from '../../domain/models';
import type { UniHubRepository } from '../../domain/repositories';
import tutoriumsHtml from '../ilias/__fixtures__/tutoriumsblätter.html?raw';
import { parseIliasPage } from '../ilias/parser';
import { mockRepository } from '../mock/mockRepository';
import {
  countFiles,
  loadFiles,
  saveFiles,
} from './fileStore';

const LDS_COURSE_ID = 'course:lds';

const TUTORIUM_FOLDER_URL =
  'https://ilias3.uni-stuttgart.de/ilias.php' +
  '?baseClass=ilrepositorygui' +
  '&cmdClass=ilObjFolderGUI' +
  '&ref_id=4364743';

function getParsedTutoriumsFiles(): LearningFile[] {
  const parsed = parseIliasPage(
    tutoriumsHtml,
    LDS_COURSE_ID,
    TUTORIUM_FOLDER_URL,
  );

  const sorted = [...parsed.files].sort((left, right) => {
    const leftDate = left.availableAt ?? left.uploadedAt ?? '';
    const rightDate = right.availableAt ?? right.uploadedAt ?? '';

    return rightDate.localeCompare(leftDate);
  });

  return sorted.map((file, index) => ({
    ...file,
    isNew: index === 0,
  }));
}

export class SQLiteUniHubRepository
  implements UniHubRepository
{
  private initialization?: Promise<void>;

  private initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.seedDatabase();
    }

    return this.initialization;
  }

  private async seedDatabase(): Promise<void> {
    const existingFiles = await countFiles();

    if (existingFiles > 0) {
      return;
    }

    await saveFiles(getParsedTutoriumsFiles());
  }

  async getActiveSemester(): Promise<Semester> {
    return mockRepository.getActiveSemester();
  }

  async getCourses(): Promise<Course[]> {
    return mockRepository.getCourses();
  }

 async getFolders(courseId?: EntityId): Promise<Folder[]> {
  return loadFolders(courseId);
}

  async getFiles(
    courseId?: EntityId,
  ): Promise<LearningFile[]> {
    await this.initialize();
    return loadFiles(courseId);
  }

  async getAssignments(
    courseId?: EntityId,
  ): Promise<Assignment[]> {
    return mockRepository.getAssignments(courseId);
  }

  async getActivity(): Promise<ActivityItem[]> {
    await this.initialize();

    const files = await loadFiles();
    const existingActivity = await mockRepository.getActivity();

    const activityWithoutLdsMockFiles =
      existingActivity.filter(
        (item) =>
          item.type !== 'file' ||
          item.courseId !== LDS_COURSE_ID,
      );

    const fileActivity: ActivityItem[] = files.map(
      (file) => ({
        type: 'file',
        ...file,
      }),
    );

    return [
      ...fileActivity,
      ...activityWithoutLdsMockFiles,
    ];
  }

  async saveSyncSnapshot(
    snapshot: SyncSnapshot,
  ): Promise<void> {
    await mockRepository.saveSyncSnapshot(snapshot);
  }
}

export const sqliteRepository =
  new SQLiteUniHubRepository();