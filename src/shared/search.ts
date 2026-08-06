import type {
  SearchResult,
  SearchResultType,
} from '../domain/models';

export interface SearchableEntry {
  type: SearchResultType;
  id: string;
  courseId: string;
  title: string;
  url: string;
  description?: string;
}

/**
 * Einfache In-Memory-Volltextsuche für die Mock-/Fixture-Repositories
 * (Browser-Vorschau ohne SQLite/FTS5). Die echte App nutzt stattdessen
 * SQLite FTS5, siehe infrastructure/sqlite/searchStore.ts.
 */
export function searchInMemory(
  entries: SearchableEntry[],
  query: string,
  limit = 20,
): SearchResult[] {
  const normalized = query
    .trim()
    .toLocaleLowerCase('de-DE');

  if (!normalized) {
    return [];
  }

  return entries
    .filter((entry) =>
      `${entry.title} ${entry.description ?? ''}`
        .toLocaleLowerCase('de-DE')
        .includes(normalized),
    )
    .slice(0, limit)
    .map((entry) => ({
      type: entry.type,
      id: entry.id,
      courseId: entry.courseId,
      title: entry.title,
      url: entry.url,
    }));
}
