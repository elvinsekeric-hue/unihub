import type {
  LearningFile,
  SyncSnapshot,
} from '../../domain/models';
import { getDatabase } from './database';

const LEGACY_SOURCE_ID = 'source:legacy';

interface LearningFileRow {
  id: string;
  course_id: string;
  scan_source_id: string;
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
  is_removed: number;
}

function mapRow(row: LearningFileRow): LearningFile {
  return {
    id: row.id,
    courseId: row.course_id,
    scanSourceId: row.scan_source_id,
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
    isRemoved: row.is_removed === 1,
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
          scan_source_id,
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
          is_downloaded,
          is_removed
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18
        )
        ON CONFLICT(ilias_ref_id) DO UPDATE SET
          id = excluded.id,
          course_id = excluded.course_id,
          scan_source_id = excluded.scan_source_id,
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
          is_downloaded = excluded.is_downloaded,
          is_removed = excluded.is_removed
      `,
      [
        file.id,
        file.courseId,
        file.scanSourceId ?? LEGACY_SOURCE_ID,
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
        file.isRemoved ? 1 : 0,
      ],
    );
  }
}

export async function saveSyncSnapshot(
  snapshot: SyncSnapshot,
): Promise<void> {
  const database = await getDatabase();

  await database.execute(
    `
      INSERT INTO sync_snapshots (
        course_id,
        scan_source_id,
        started_at,
        completed_at,
        status,
        discovered,
        changed,
        removed,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      snapshot.courseId,
      snapshot.scanSourceId ?? LEGACY_SOURCE_ID,
      snapshot.startedAt,
      snapshot.completedAt,
      snapshot.status,
      snapshot.discovered,
      snapshot.changed,
      snapshot.removed,
      snapshot.errorMessage ?? null,
    ],
  );
}

export async function loadFiles(
  courseId?: string,
  includeRemoved = false,
  scanSourceId?: string,
  folderId?: string | null,
): Promise<LearningFile[]> {
  const database = await getDatabase();

  const conditions: string[] = [];
  const parameters: unknown[] = [];

  if (courseId) {
    conditions.push(`course_id = $${parameters.length + 1}`);
    parameters.push(courseId);
  }

  if (scanSourceId) {
    conditions.push(
      `scan_source_id = $${parameters.length + 1}`,
    );
    parameters.push(scanSourceId);
  }

  /*
   * undefined = kein Ordnerfilter
   * null      = Dateien direkt auf einer Kurs-Hauptseite
   * string    = Dateien innerhalb dieses Ordners
   */
  if (folderId === null) {
    conditions.push('folder_id IS NULL');
  } else if (folderId !== undefined) {
    conditions.push(`folder_id = $${parameters.length + 1}`);
    parameters.push(folderId);
  }

  if (!includeRemoved) {
    conditions.push('is_removed = 0');
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

  const rows = await database.select<LearningFileRow[]>(
    `
      SELECT *
      FROM learning_files
      ${whereClause}
      ORDER BY available_at DESC, title DESC
    `,
    parameters,
  );

  return rows.map(mapRow);
}

export async function countFiles(): Promise<number> {
  const database = await getDatabase();

  const rows = await database.select<Array<{ count: number }>>(
    `
      SELECT COUNT(*) AS count
      FROM learning_files
      WHERE is_removed = 0
    `,
  );

  return Number(rows[0]?.count ?? 0);
}

export interface StoredSyncSnapshot extends SyncSnapshot {
  id: number;
}

interface SyncSnapshotRow {
  id: number;
  course_id: string;
  scan_source_id: string;
  started_at: string;
  completed_at: string;
  status: 'success' | 'partial' | 'failed';
  discovered: number;
  changed: number;
  removed: number;
  error_message: string | null;
}

export async function loadSyncSnapshots(
  courseId?: string,
  limit = 10,
  scanSourceId?: string,
): Promise<StoredSyncSnapshot[]> {
  const database = await getDatabase();

  const safeLimit = Math.max(1, Math.min(limit, 100));

  const conditions: string[] = [];
  const parameters: unknown[] = [];

  if (courseId) {
    conditions.push(`course_id = $${parameters.length + 1}`);
    parameters.push(courseId);
  }

  if (scanSourceId) {
    conditions.push(
      `scan_source_id = $${parameters.length + 1}`,
    );
    parameters.push(scanSourceId);
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

  parameters.push(safeLimit);
  const limitParameter = `$${parameters.length}`;

  const rows = await database.select<SyncSnapshotRow[]>(
    `
      SELECT *
      FROM sync_snapshots
      ${whereClause}
      ORDER BY completed_at DESC
      LIMIT ${limitParameter}
    `,
    parameters,
  );

  return rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    scanSourceId: row.scan_source_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    discovered: row.discovered,
    changed: row.changed,
    removed: row.removed,
    errorMessage: row.error_message ?? undefined,
  }));
}