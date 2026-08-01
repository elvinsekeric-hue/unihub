import type {
  Assignment,
  SubmissionFile,
} from '../../domain/models';

import { getDatabase } from './database';

const LEGACY_SOURCE_ID =
  'source:legacy';

interface AssignmentRow {
  id: string;
  course_id: string;
  scan_source_id: string;
  folder_id: string | null;
  ilias_ref_id: string;
  ilias_assignment_id: string | null;
  title: string;
  url: string;
  description: string | null;
  starts_at: string | null;
  due_at: string | null;
  submitted_at: string | null;
  status: Assignment['status'];
  is_new: number;
  is_removed: number;
}

interface SubmissionFileRow {
  id: string;
  assignment_id: string;
  course_id: string;
  kind: SubmissionFile['kind'];
  title: string;
  url: string;
  mime_type: string | null;
  file_size_bytes: number | null;
}

function mapSubmissionFile(
  row: SubmissionFileRow,
): SubmissionFile {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    courseId: row.course_id,
    kind: row.kind,
    title: row.title,
    url: row.url,
    mimeType:
      row.mime_type ?? undefined,
    fileSizeBytes:
      row.file_size_bytes ?? undefined,
  };
}

function mapRow(
  row: AssignmentRow,
  files: SubmissionFile[],
): Assignment {
  return {
    id: row.id,
    courseId: row.course_id,
    scanSourceId:
      row.scan_source_id,
    folderId:
      row.folder_id ?? undefined,
    iliasRefId:
      row.ilias_ref_id,
    iliasAssignmentId:
      row.ilias_assignment_id ??
      undefined,
    title: row.title,
    url: row.url,
    description:
      row.description ?? undefined,
    startsAt:
      row.starts_at ?? undefined,
    dueAt:
      row.due_at ?? undefined,
    submittedAt:
      row.submitted_at ?? undefined,
    status: row.status,
    isNew: row.is_new === 1,
    isRemoved:
      row.is_removed === 1,
    submissionFiles:
      files.filter(
        (file) =>
          file.kind === 'submitted',
      ),
    feedbackFiles:
      files.filter(
        (file) =>
          file.kind === 'feedback',
      ),
  };
}

export async function saveAssignments(
  assignments: Assignment[],
): Promise<void> {
  const database = await getDatabase();

  for (const assignment of assignments) {
    await database.execute(
      `
        INSERT INTO assignments (
          id,
          course_id,
          scan_source_id,
          folder_id,
          ilias_ref_id,
          ilias_assignment_id,
          title,
          url,
          description,
          starts_at,
          due_at,
          submitted_at,
          status,
          is_new,
          is_removed
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15
        )
        ON CONFLICT(id) DO UPDATE SET
          course_id =
            excluded.course_id,
          scan_source_id =
            excluded.scan_source_id,
          folder_id =
            excluded.folder_id,
          ilias_ref_id =
            excluded.ilias_ref_id,
          ilias_assignment_id =
            excluded.ilias_assignment_id,
          title = excluded.title,
          url = excluded.url,
          description =
            excluded.description,
          starts_at =
            excluded.starts_at,
          due_at = excluded.due_at,
          submitted_at =
            COALESCE(
              excluded.submitted_at,
              assignments.submitted_at
            ),
          status = CASE
            WHEN assignments.status = 'graded'
              THEN assignments.status
            ELSE excluded.status
          END,
          is_new = excluded.is_new,
          is_removed =
            excluded.is_removed
      `,
      [
        assignment.id,
        assignment.courseId,
        assignment.scanSourceId ??
          LEGACY_SOURCE_ID,
        assignment.folderId ?? null,
        assignment.iliasRefId,
        assignment.iliasAssignmentId ??
          null,
        assignment.title,
        assignment.url,
        assignment.description ?? null,
        assignment.startsAt ?? null,
        assignment.dueAt ?? null,
        assignment.submittedAt ?? null,
        assignment.status,
        assignment.isNew ? 1 : 0,
        assignment.isRemoved ? 1 : 0,
      ],
    );
  }
}

export async function saveSubmissionFiles(
  files: SubmissionFile[],
): Promise<void> {
  const database = await getDatabase();

  for (const file of files) {
    await database.execute(
      `
        INSERT INTO submission_files (
          id,
          assignment_id,
          course_id,
          kind,
          title,
          url,
          mime_type,
          file_size_bytes
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8
        )
        ON CONFLICT(id) DO UPDATE SET
          assignment_id =
            excluded.assignment_id,
          course_id =
            excluded.course_id,
          kind = excluded.kind,
          title = excluded.title,
          url = excluded.url,
          mime_type =
            excluded.mime_type,
          file_size_bytes =
            excluded.file_size_bytes
      `,
      [
        file.id,
        file.assignmentId,
        file.courseId,
        file.kind,
        file.title,
        file.url,
        file.mimeType ?? null,
        file.fileSizeBytes ?? null,
      ],
    );
  }
}

async function loadSubmissionFiles(
  courseId?: string,
): Promise<SubmissionFile[]> {
  const database = await getDatabase();

  const rows = courseId
    ? await database.select<
        SubmissionFileRow[]
      >(
        `
          SELECT *
          FROM submission_files
          WHERE course_id = $1
          ORDER BY title COLLATE NOCASE
        `,
        [courseId],
      )
    : await database.select<
        SubmissionFileRow[]
      >(
        `
          SELECT *
          FROM submission_files
          ORDER BY title COLLATE NOCASE
        `,
      );

  return rows.map(
    mapSubmissionFile,
  );
}

export async function loadAssignments(
  courseId?: string,
  includeRemoved = false,
  scanSourceId?: string,
  folderId?: string | null,
): Promise<Assignment[]> {
  const database = await getDatabase();

  const conditions: string[] = [];
  const parameters: unknown[] = [];

  if (courseId) {
    conditions.push(
      `course_id = $${parameters.length + 1}`,
    );

    parameters.push(courseId);
  }

  if (scanSourceId) {
    conditions.push(
      `scan_source_id = $${parameters.length + 1}`,
    );

    parameters.push(scanSourceId);
  }

  if (folderId === null) {
    conditions.push(
      'folder_id IS NULL',
    );
  } else if (
    folderId !== undefined
  ) {
    conditions.push(
      `folder_id = $${parameters.length + 1}`,
    );

    parameters.push(folderId);
  }

  if (!includeRemoved) {
    conditions.push(
      'is_removed = 0',
    );
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

  const [
    rows,
    submissionFiles,
  ] = await Promise.all([
    database.select<AssignmentRow[]>(
      `
        SELECT *
        FROM assignments
        ${whereClause}
        ORDER BY
          CASE
            WHEN due_at IS NULL THEN 1
            ELSE 0
          END,
          due_at ASC,
          title COLLATE NOCASE ASC
      `,
      parameters,
    ),
    loadSubmissionFiles(courseId),
  ]);

  return rows.map((row) =>
    mapRow(
      row,
      submissionFiles.filter(
        (file) =>
          file.assignmentId === row.id,
      ),
    ),
  );
}