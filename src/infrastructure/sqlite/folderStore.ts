import type { Folder } from '../../domain/models';
import { getDatabase } from './database';

const LEGACY_SOURCE_ID = 'source:legacy';

interface FolderRow {
  id: string;
  course_id: string;
  scan_source_id: string;
  parent_folder_id: string | null;
  ilias_ref_id: string;
  title: string;
  url: string;
  path_json: string;
  is_removed: number;
}

function parsePath(pathJson: string): string[] {
  try {
    const value: unknown = JSON.parse(pathJson);

    if (
      Array.isArray(value) &&
      value.every((entry) => typeof entry === 'string')
    ) {
      return value;
    }
  } catch {
    // Ungültige Altdaten werden unten abgefangen.
  }

  return [];
}

function mapRow(row: FolderRow): Folder {
  return {
    id: row.id,
    courseId: row.course_id,
    scanSourceId: row.scan_source_id,
    parentFolderId: row.parent_folder_id ?? undefined,
    iliasRefId: row.ilias_ref_id,
    title: row.title,
    url: row.url,
    path: parsePath(row.path_json),
  };
}

export async function saveFolders(
  folders: Folder[],
): Promise<void> {
  const database = await getDatabase();

  for (const folder of folders) {
    await database.execute(
      `
        INSERT INTO folders (
          id,
          course_id,
          scan_source_id,
          parent_folder_id,
          ilias_ref_id,
          title,
          url,
          path_json,
          is_removed
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 0
        )
        ON CONFLICT(
          course_id,
          scan_source_id,
          ilias_ref_id
        ) DO UPDATE SET
          id = excluded.id,
          parent_folder_id = excluded.parent_folder_id,
          title = excluded.title,
          url = excluded.url,
          path_json = excluded.path_json,
          is_removed = 0
      `,
      [
        folder.id,
        folder.courseId,
        folder.scanSourceId ?? LEGACY_SOURCE_ID,
        folder.parentFolderId ?? null,
        folder.iliasRefId,
        folder.title,
        folder.url,
        JSON.stringify(folder.path),
      ],
    );
  }
}

export async function loadFolders(
  courseId?: string,
  scanSourceId?: string,
  includeRemoved = false,
): Promise<Folder[]> {
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

  if (!includeRemoved) {
    conditions.push('is_removed = 0');
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

  const rows = await database.select<FolderRow[]>(
    `
      SELECT *
      FROM folders
      ${whereClause}
      ORDER BY title COLLATE NOCASE ASC
    `,
    parameters,
  );

  return rows.map(mapRow);
}

export async function loadFolderByRefId(
  iliasRefId: string,
): Promise<Folder | undefined> {
  const database = await getDatabase();

  const rows = await database.select<FolderRow[]>(
    `
      SELECT *
      FROM folders
      WHERE ilias_ref_id = $1
        AND is_removed = 0
      LIMIT 1
    `,
    [iliasRefId],
  );

  const row = rows[0];

  return row ? mapRow(row) : undefined;
}

export async function markMissingFoldersRemoved(
  courseId: string,
  scanSourceId: string,
  parentFolderId: string | undefined,
  activeRefIds: string[],
): Promise<number> {
  const database = await getDatabase();

  const conditions = [
    'course_id = $1',
    'scan_source_id = $2',
    'is_removed = 0',
  ];

  const parameters: unknown[] = [
    courseId,
    scanSourceId,
  ];

  if (parentFolderId) {
    conditions.push(
      `parent_folder_id = $${parameters.length + 1}`,
    );
    parameters.push(parentFolderId);
  } else {
    conditions.push('parent_folder_id IS NULL');
  }

  if (activeRefIds.length > 0) {
    const placeholders = activeRefIds.map((refId) => {
      parameters.push(refId);
      return `$${parameters.length}`;
    });

    conditions.push(
      `ilias_ref_id NOT IN (${placeholders.join(', ')})`,
    );
  }

  const result = await database.execute(
    `
      UPDATE folders
      SET is_removed = 1
      WHERE ${conditions.join('\n        AND ')}
    `,
    parameters,
  );

  return result.rowsAffected;
}

export async function countFolders(): Promise<number> {
  const database = await getDatabase();

  const rows = await database.select<Array<{ count: number }>>(
    `
      SELECT COUNT(*) AS count
      FROM folders
      WHERE is_removed = 0
    `,
  );

  return Number(rows[0]?.count ?? 0);
}