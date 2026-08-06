import type { SearchResult } from '../../domain/models';
import { getDatabase } from './database';

interface SearchRow {
  entity_type: SearchResult['type'];
  entity_id: string;
  course_id: string;
  title: string;
  url: string;
  snippet: string;
}

/**
 * Baut den Volltextindex komplett aus den Quelltabellen neu auf.
 * Wird nach jedem Sync aufgerufen; ein einzelnes INSERT…SELECT ist
 * für die üblichen Datenmengen eines Studiums (wenige tausend
 * Zeilen) unproblematisch schnell und deutlich einfacher als
 * inkrementelle Trigger-Pflege über drei Quelltabellen hinweg.
 */
export async function rebuildSearchIndex(): Promise<void> {
  const database = await getDatabase();

  await database.execute('DELETE FROM search_index');

  await database.execute(`
    INSERT INTO search_index (
      entity_type, entity_id, course_id, title, body, url
    )
    SELECT 'file', id, course_id, title,
      COALESCE(description, ''), url
    FROM learning_files
    WHERE is_removed = 0

    UNION ALL

    SELECT 'folder', id, course_id, title, '', url
    FROM folders
    WHERE is_removed = 0

    UNION ALL

    SELECT 'assignment', id, course_id, title,
      COALESCE(description, ''), url
    FROM assignments
    WHERE is_removed = 0
  `);
}

/**
 * Wandelt eine freie Sucheingabe in einen FTS5-MATCH-Ausdruck um:
 * jedes Wort wird als Anführungszeichen-Token mit Präfix-Platzhalter
 * behandelt, damit weder FTS5-Sonderzeichen (", *, -, …) noch leere
 * Eingaben zu einem Syntaxfehler führen.
 */
export function buildMatchExpression(
  query: string,
): string | undefined {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(
      (token) =>
        `"${token.replace(/"/g, '""')}"*`,
    );

  return tokens.length > 0
    ? tokens.join(' AND ')
    : undefined;
}

export async function searchAll(
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const matchExpression = buildMatchExpression(query);

  if (!matchExpression) {
    return [];
  }

  const database = await getDatabase();

  const rows = await database.select<SearchRow[]>(
    `
      SELECT
        entity_type,
        entity_id,
        course_id,
        title,
        url,
        snippet(
          search_index, 4, '»', '«', '…', 10
        ) AS snippet
      FROM search_index
      WHERE search_index MATCH $1
      ORDER BY rank
      LIMIT $2
    `,
    [matchExpression, limit],
  );

  return rows.map((row) => ({
    type: row.entity_type,
    id: row.entity_id,
    courseId: row.course_id,
    title: row.title,
    url: row.url,
    snippet: row.snippet || undefined,
  }));
}
