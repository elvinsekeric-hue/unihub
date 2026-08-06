import type { LearningFile } from '../domain/models';

/**
 * Findet Dateien mit identischem Titel, die in unterschiedlichen
 * Ordnern desselben Kurses verlinkt sind (z. B. dieselbe Folie in
 * zwei Übungsordnern). Liefert die IDs aller Dateien, die Teil
 * einer solchen Dopplung sind.
 */
export function findDuplicateFileIds(
  files: LearningFile[],
): Set<string> {
  const groups = new Map<string, LearningFile[]>();

  for (const file of files) {
    const key = `${file.courseId}::${file.title
      .trim()
      .toLocaleLowerCase('de-DE')}`;

    const entries = groups.get(key) ?? [];
    entries.push(file);
    groups.set(key, entries);
  }

  const duplicateIds = new Set<string>();

  for (const entries of groups.values()) {
    const distinctFolders = new Set(
      entries.map((file) => file.folderId ?? ''),
    );

    if (entries.length > 1 && distinctFolders.size > 1) {
      for (const file of entries) {
        duplicateIds.add(file.id);
      }
    }
  }

  return duplicateIds;
}
