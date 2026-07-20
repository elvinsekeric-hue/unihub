import type { LearningFile } from '../../domain/models';
import { getDatabase } from './database';

interface LearningFileRow {
  id: string;
  course_id: string;
  folder_id: string | null;
  ilias_ref_id: string;
  title: string;
  url: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  description: string | null;
  available_at: string | null;
  uploaded_at: string | null;
  last_modified_at: string | null;
  etag: string | null;
  is_new: number;
  is_downloaded: number;
}

function mapRow(row: LearningFileRow): LearningFile {
  return {
    id: row.id,
    courseId: row.course_id,
    folderId: row.folder_id ?? undefined,
    iliasRefId: row.ilias_ref_id,
    title: row.title,
    url: row.url,
    mimeType: row.mime_type ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    pageCount: row.page_count ?? undefined,
    description: row.description ?? undefined,
    availableAt: row.available_at ?? undefined,
    uploadedAt: row.uploaded_at ?? undefined,
    lastModifiedAt: row.last_modified_at ?? undefined,
    etag: row.etag ?? undefined,
    isNew: row.is_new === 1,
    isDownloaded: row.is_downloaded === 1,
  };
}

export async function saveFiles(
  files: LearningFile[],
): Promise<void> {
  const database = await getDatabase();

  for (const file of files) {
    await database.execute(
      `
        INSERT INTO learning_files (
          id,
          course_id,
          folder_id,
          ilias_ref_id,
          title,
          url,
          mime_type,
          file_size_bytes,
          page_count,
          description,
          available_at,
          uploaded_at,
          last_modified_at,
          etag,
          is_new,
          is_downloaded
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16
        )
        ON CONFLICT(ilias_ref_id) DO UPDATE SET
          id = excluded.id,
          course_id = excluded.course_id,
          folder_id = excluded.folder_id,
          title = excluded.title,
          url = excluded.url,
          mime_type = excluded.mime_type,
          file_size_bytes = excluded.file_size_bytes,
          page_count = excluded.page_count,
          description = excluded.description,
          available_at = excluded.available_at,
          uploaded_at = excluded.uploaded_at,
          last_modified_at = excluded.last_modified_at,
          etag = excluded.etag,
          is_new = excluded.is_new,
          is_downloaded = excluded.is_downloaded
      `,
      [
        file.id,
        file.courseId,
        file.folderId ?? null,
        file.iliasRefId,
        file.title,
        file.url,
        file.mimeType ?? null,
        file.fileSizeBytes ?? null,
        file.pageCount ?? null,
        file.description ?? null,
        file.availableAt ?? null,
        file.uploadedAt ?? null,
        file.lastModifiedAt ?? null,
        file.etag ?? null,
        file.isNew ? 1 : 0,
        file.isDownloaded ? 1 : 0,
      ],
    );
  }
}

export async function loadFiles(
  courseId?: string,
): Promise<LearningFile[]> {
  const database = await getDatabase();

  const rows = courseId
    ? await database.select<LearningFileRow[]>(
        `
          SELECT *
          FROM learning_files
          WHERE course_id = $1
          ORDER BY available_at DESC, title DESC
        `,
        [courseId],
      )
    : await database.select<LearningFileRow[]>(`
        SELECT *
        FROM learning_files
        ORDER BY available_at DESC, title DESC
      `);

  return rows.map(mapRow);
}

export async function countFiles(): Promise<number> {
  const database = await getDatabase();

  const rows = await database.select<Array<{ count: number }>>(
    'SELECT COUNT(*) AS count FROM learning_files',
  );

  return Number(rows[0]?.count ?? 0);
}