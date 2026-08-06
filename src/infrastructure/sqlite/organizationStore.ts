import type {
  FavoriteEntry,
  RecentlyOpenedEntry,
  SearchResultType,
} from '../../domain/models';
import { getDatabase } from './database';

export interface TrackableEntry {
  id: string;
  entityType: SearchResultType;
  courseId: string;
  title: string;
  url: string;
}

interface RecentlyOpenedRow {
  id: string;
  entity_type: SearchResultType;
  title: string;
  url: string;
  course_id: string;
  opened_at: string;
}

interface FavoriteRow {
  id: string;
  entity_type: SearchResultType;
  title: string;
  url: string;
  course_id: string;
  created_at: string;
}

export async function recordRecentlyOpened(
  entry: TrackableEntry,
): Promise<void> {
  const database = await getDatabase();

  await database.execute(
    `
      INSERT INTO recently_opened (
        id, entity_type, title, url, course_id, opened_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(id) DO UPDATE SET
        opened_at = excluded.opened_at
    `,
    [
      entry.id,
      entry.entityType,
      entry.title,
      entry.url,
      entry.courseId,
      new Date().toISOString(),
    ],
  );
}

export async function loadRecentlyOpened(
  limit = 8,
): Promise<RecentlyOpenedEntry[]> {
  const database = await getDatabase();

  const rows = await database.select<
    RecentlyOpenedRow[]
  >(
    `
      SELECT * FROM recently_opened
      ORDER BY opened_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    title: row.title,
    url: row.url,
    courseId: row.course_id,
    openedAt: row.opened_at,
  }));
}

export async function isFavorite(
  id: string,
): Promise<boolean> {
  const database = await getDatabase();

  const rows = await database.select<
    Array<{ id: string }>
  >('SELECT id FROM favorites WHERE id = $1', [id]);

  return rows.length > 0;
}

export async function toggleFavorite(
  entry: TrackableEntry,
): Promise<boolean> {
  const database = await getDatabase();

  const alreadyFavorite = await isFavorite(entry.id);

  if (alreadyFavorite) {
    await database.execute(
      'DELETE FROM favorites WHERE id = $1',
      [entry.id],
    );

    return false;
  }

  await database.execute(
    `
      INSERT INTO favorites (
        id, entity_type, title, url, course_id, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      entry.id,
      entry.entityType,
      entry.title,
      entry.url,
      entry.courseId,
      new Date().toISOString(),
    ],
  );

  return true;
}

export async function loadFavorites(): Promise<
  FavoriteEntry[]
> {
  const database = await getDatabase();

  const rows = await database.select<FavoriteRow[]>(
    'SELECT * FROM favorites ORDER BY created_at DESC',
  );

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    title: row.title,
    url: row.url,
    courseId: row.course_id,
    createdAt: row.created_at,
  }));
}

export async function addTag(
  entityId: string,
  tag: string,
): Promise<void> {
  const normalized = tag.trim().toLocaleLowerCase('de-DE');

  if (!normalized) {
    return;
  }

  const database = await getDatabase();

  await database.execute(
    `
      INSERT OR IGNORE INTO tags (entity_id, tag)
      VALUES ($1, $2)
    `,
    [entityId, normalized],
  );
}

export async function removeTag(
  entityId: string,
  tag: string,
): Promise<void> {
  const database = await getDatabase();

  await database.execute(
    'DELETE FROM tags WHERE entity_id = $1 AND tag = $2',
    [entityId, tag],
  );
}

export async function loadAllTags(): Promise<
  Map<string, string[]>
> {
  const database = await getDatabase();

  const rows = await database.select<
    Array<{ entity_id: string; tag: string }>
  >('SELECT entity_id, tag FROM tags ORDER BY tag');

  const result = new Map<string, string[]>();

  for (const row of rows) {
    const entries = result.get(row.entity_id) ?? [];
    entries.push(row.tag);
    result.set(row.entity_id, entries);
  }

  return result;
}
