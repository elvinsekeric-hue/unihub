import type { Assignment, Folder, LearningFile } from '../../domain/models';

export interface ParsedIliasPage {
  folders: Folder[];
  files: LearningFile[];
  assignments: Assignment[];
}

/**
 * Contract for the real ILIAS parser.
 * The browser extension proved the selectors and URL patterns in Phase 0.
 * Parsing is implemented next, independently from React and SQLite.
 */
export function parseIliasPage(_html: string, _courseId: string, _pageUrl: string): ParsedIliasPage {
  return { folders: [], files: [], assignments: [] };
}
