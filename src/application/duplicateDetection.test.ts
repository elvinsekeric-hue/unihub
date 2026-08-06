import { describe, expect, it } from 'vitest';

import type { LearningFile } from '../domain/models';
import { findDuplicateFileIds } from './duplicateDetection';

function file(
  overrides: Partial<LearningFile>,
): LearningFile {
  return {
    id: `file:${Math.random()}`,
    courseId: 'course:lds',
    iliasRefId: '1',
    title: 'Folie',
    url: 'https://example.test',
    isNew: false,
    isDownloaded: false,
    isRemoved: false,
    ...overrides,
  };
}

describe('findDuplicateFileIds', () => {
  it('erkennt denselben Titel in unterschiedlichen Ordnern', () => {
    const a = file({ id: 'a', folderId: 'folder:1' });
    const b = file({ id: 'b', folderId: 'folder:2' });

    const result = findDuplicateFileIds([a, b]);

    expect(result).toEqual(new Set(['a', 'b']));
  });

  it('ignoriert denselben Titel im selben Ordner', () => {
    const a = file({ id: 'a', folderId: 'folder:1' });
    const b = file({ id: 'b', folderId: 'folder:1' });

    expect(findDuplicateFileIds([a, b]).size).toBe(0);
  });

  it('ignoriert gleiche Titel über Kursgrenzen hinweg', () => {
    const a = file({
      id: 'a',
      courseId: 'course:lds',
      folderId: 'folder:1',
    });
    const b = file({
      id: 'b',
      courseId: 'course:dsa',
      folderId: 'folder:2',
    });

    expect(findDuplicateFileIds([a, b]).size).toBe(0);
  });

  it('ist unempfindlich gegenüber Groß-/Kleinschreibung', () => {
    const a = file({
      id: 'a',
      title: 'Folie01',
      folderId: 'folder:1',
    });
    const b = file({
      id: 'b',
      title: 'folie01',
      folderId: 'folder:2',
    });

    expect(findDuplicateFileIds([a, b]).size).toBe(2);
  });
});
