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

const semester: Semester = {
  id: 'semester:ss26',
  name: 'Sommersemester 2026',
  isActive: true,
};

const courses: Course[] = [
  {
    id: 'course:lds',
    iliasRefId: '4364722',
    title: 'Logik und Diskrete Strukturen',
    shortName: 'LDS',
    semesterId: semester.id,
    color: '#315a82',
    iliasUrl: 'https://ilias3.uni-stuttgart.de/ilias.php?baseClass=ilrepositorygui&cmdNode=xi:md&cmdClass=ilobjcoursegui&ref_id=4364722&item_ref_id=0',
  },
  {
  id: 'course:dsa',
  iliasRefId: '4392414',
  title: 'Datenstrukturen und Algorithmen',
  shortName: 'DSA',
  semesterId: semester.id,
  color: '#6a4c93',
  iliasUrl:
    'https://ilias3.uni-stuttgart.de/' +
    'ilias.php?baseClass=ilrepositorygui' +
    '&cmdNode=xi:md' +
    '&cmdClass=ilobjcoursegui' +
    '&ref_id=4392414' +
    '&item_ref_id=0',
},
  {
  id: 'course:mathe',
  iliasRefId: '4405757',
  title: 'Mathematik',
  shortName: 'MATHE',
  semesterId: semester.id,
  color: '#2f7d59',
  iliasUrl:
    'https://ilias3.uni-stuttgart.de/' +
    'ilias.php?baseClass=ilrepositorygui' +
    '&cmdNode=xi:md' +
    '&cmdClass=ilobjcoursegui' +
    '&ref_id=4405757' +
    '&item_ref_id=0',
},
];

const folders: Folder[] = [
  {
    id: 'folder:4364743',
    courseId: 'course:lds',
    iliasRefId: '4364743',
    title: 'Tutoriumsblätter',
    url: 'https://ilias3.uni-stuttgart.de/go/fold/4364743',
    path: ['LDS', 'Tutorium', 'Tutoriumsblätter'],
  },
];

const files: LearningFile[] = [
  {
    id: 'file:4409920',
    courseId: 'course:lds',
    folderId: 'folder:4364743',
    iliasRefId: '4409920',
    title: 'Tutoriumsblatt13',
    url: 'https://ilias3.uni-stuttgart.de/ilias.php?baseClass=ilrepositorygui&cmdClass=ilObjFileGUI&cmd=sendfile&ref_id=4409920',
    mimeType: 'application/pdf',
    fileSizeBytes: 618_000,
    pageCount: 2,
    availableAt: '2026-07-13T17:00:00+02:00',
    isNew: true,
    isDownloaded: false,
    isRemoved: false,
  },
  {
    id: 'file:4510376',
    courseId: 'course:lds',
    folderId: 'folder:4364743',
    iliasRefId: '4510376',
    title: 'Tutoriumsblatt04 wurde korrigiert',
    url: 'https://ilias3.uni-stuttgart.de/ilias.php?baseClass=ilrepositorygui&cmdClass=ilObjFileGUI&cmd=sendfile&ref_id=4510376',
    mimeType: 'application/pdf',
    description: 'Aufgabe 2 wurde überarbeitet/korrigiert.',
    isNew: false,
    isDownloaded: false,
    isRemoved: false,
  },
];

const assignments: Assignment[] = [
  {
    id: 'assignment:138187',
    courseId: 'course:lds',
    iliasRefId: '4435163',
    iliasAssignmentId: '138187',
    title: 'Abgabe Blatt 13',
    url: 'https://ilias3.uni-stuttgart.de/ilias.php?baseClass=ilexercisehandlergui&cmdClass=ilAssignmentPresentationGUI&ref_id=4435163&ass_id=138187',
    dueAt: '2026-07-23T16:00:00+02:00',
    status: 'not-started',
    isNew: false,
  },
];

const activity: ActivityItem[] = [
  { type: 'file', ...files[0] },
  { type: 'assignment', ...assignments[0] },
  { type: 'file', ...files[1] },
  {
    type: 'announcement',
    id: 'announcement:1',
    courseId: 'course:dsa',
    title: 'Neue Übungsgruppe angekündigt',
    url: 'https://ilias3.uni-stuttgart.de/',
    isNew: true,
  },
];

export class MockUniHubRepository implements UniHubRepository {
  private readonly notes = new Map<string, string>();

  async getActiveSemester(): Promise<Semester> {
    return structuredClone(semester);
  }

  async getCourses(): Promise<Course[]> {
    return structuredClone(courses);
  }

  async getFolders(courseId?: EntityId): Promise<Folder[]> {
    return structuredClone(courseId ? folders.filter((folder) => folder.courseId === courseId) : folders);
  }

  async getFiles(courseId?: EntityId): Promise<LearningFile[]> {
    return structuredClone(courseId ? files.filter((file) => file.courseId === courseId) : files);
  }

  async getAssignments(courseId?: EntityId): Promise<Assignment[]> {
    const list = courseId ? assignments.filter((item) => item.courseId === courseId) : assignments;
    return structuredClone(list).map((item) => ({
      ...item,
      userNote: this.notes.get(item.id),
    }));
  }

  async updateAssignmentNote(
    assignmentId: string,
    note: string,
  ): Promise<void> {
    this.notes.set(assignmentId, note);
  }

  async getActivity(): Promise<ActivityItem[]> {
    return structuredClone(activity);
  }

  async saveSyncSnapshot(_snapshot: SyncSnapshot): Promise<void> {
    // Mock implementation. SQLite replaces this in Phase 3.
  }
}

export const mockRepository = new MockUniHubRepository();
