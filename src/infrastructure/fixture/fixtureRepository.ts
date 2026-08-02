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
} from '../../domain/models';
import type { UniHubRepository } from '../../domain/repositories';
import tutoriumsHtml from '../ilias/__fixtures__/tutoriumsblätter.html?raw';
import { parseIliasPage } from '../ilias/parser';
import { mockRepository } from '../mock/mockRepository';

const LDS_COURSE_ID = 'course:lds';

const TUTORIUM_FOLDER_URL =
  'https://ilias3.uni-stuttgart.de/ilias.php' +
  '?baseClass=ilrepositorygui' +
  '&cmdClass=ilObjFolderGUI' +
  '&ref_id=4364743';

function parseTutoriumsFiles(): LearningFile[] {
  const parsedPage = parseIliasPage(
    tutoriumsHtml,
    LDS_COURSE_ID,
    TUTORIUM_FOLDER_URL,
  );

  const sortedFiles = [...parsedPage.files].sort((left, right) => {
    const leftDate = left.availableAt ?? left.uploadedAt ?? '';
    const rightDate = right.availableAt ?? right.uploadedAt ?? '';

    return rightDate.localeCompare(leftDate);
  });

  return sortedFiles.map((file, index) => ({
    ...file,
    // Vorerst behandeln wir das neueste Blatt als neuen Inhalt.
    isNew: index === 0,
  }));
}

export class FixtureUniHubRepository implements UniHubRepository {
  private readonly tutoriumsFiles = parseTutoriumsFiles();

  async getActiveSemester(): Promise<Semester> {
    return mockRepository.getActiveSemester();
  }

  async getCourses(): Promise<Course[]> {
    return mockRepository.getCourses();
  }

  async getFolders(courseId?: EntityId): Promise<Folder[]> {
    return mockRepository.getFolders(courseId);
  }

  async getFiles(courseId?: EntityId): Promise<LearningFile[]> {
    if (courseId === LDS_COURSE_ID) {
      return structuredClone(this.tutoriumsFiles);
    }

    if (courseId) {
      return mockRepository.getFiles(courseId);
    }

    const mockFiles = await mockRepository.getFiles();
    const filesOutsideLds = mockFiles.filter(
      (file) => file.courseId !== LDS_COURSE_ID,
    );

    return structuredClone([
      ...this.tutoriumsFiles,
      ...filesOutsideLds,
    ]);
  }

  async getAssignments(
    courseId?: EntityId,
  ): Promise<Assignment[]> {
    return mockRepository.getAssignments(courseId);
  }

  async updateAssignmentNote(
    assignmentId: string,
    note: string,
  ): Promise<void> {
    await mockRepository.updateAssignmentNote(
      assignmentId,
      note,
    );
  }

  async getSubmissionEvents(
    assignmentId: EntityId,
  ): Promise<SubmissionEvent[]> {
    return mockRepository.getSubmissionEvents(
      assignmentId,
    );
  }

  async getActivity(): Promise<ActivityItem[]> {
    const existingActivity = await mockRepository.getActivity();

    // Die alten LDS-Mockdateien werden durch echte Parserdaten ersetzt.
    const activityWithoutMockFiles = existingActivity.filter(
      (item) =>
        item.type !== 'file' ||
        item.courseId !== LDS_COURSE_ID,
    );

    const parsedFileActivity: ActivityItem[] =
      this.tutoriumsFiles.map((file) => ({
        type: 'file',
        ...file,
      }));

    return structuredClone([
      ...parsedFileActivity,
      ...activityWithoutMockFiles,
    ]);
  }

  async saveSyncSnapshot(
    snapshot: SyncSnapshot,
  ): Promise<void> {
    await mockRepository.saveSyncSnapshot(snapshot);
  }
}

export const fixtureRepository =
  new FixtureUniHubRepository();