import { describe, expect, it } from 'vitest';
import type { LearningFile } from '../domain/models';
import { compareIliasFiles } from './compareIliasFiles';

function createFile(
  overrides: Partial<LearningFile> = {},
): LearningFile {
  return {
    id: 'file:1',
    courseId: 'course:lds',
    folderId: 'folder:4364743',
    iliasRefId: '1',
    title: 'Tutoriumsblatt01',
    url: 'https://ilias3.uni-stuttgart.de/file/1',
    mimeType: 'application/pdf',
    fileSizeBytes: 1000,
    pageCount: 2,
    isNew: false,
    isDownloaded: false,
    isRemoved: false,
    ...overrides,
  };
}

describe('compareIliasFiles', () => {
  it('erkennt eine neue Datei', () => {
    const incoming = createFile();

    const result = compareIliasFiles([incoming], []);

    expect(result.newFiles).toHaveLength(1);
    expect(result.changedFiles).toHaveLength(0);
    expect(result.unchangedFiles).toHaveLength(0);
    expect(result.filesToSave[0].isNew).toBe(true);
  });

  it('erkennt eine geänderte Datei', () => {
    const existing = createFile({
      description: 'Alte Beschreibung',
      isDownloaded: true,
    });

    const incoming = createFile({
      description: 'Aufgabe wurde korrigiert.',
    });

    const result = compareIliasFiles(
      [incoming],
      [existing],
    );

    expect(result.newFiles).toHaveLength(0);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.changedFiles[0].isNew).toBe(true);
    expect(result.changedFiles[0].isDownloaded).toBe(true);
  });

  it('erkennt eine unveränderte Datei', () => {
    const existing = createFile({
      isNew: true,
      isDownloaded: true,
    });

    const incoming = createFile();

    const result = compareIliasFiles(
      [incoming],
      [existing],
    );

    expect(result.unchangedFiles).toHaveLength(1);
    expect(result.unchangedFiles[0].isNew).toBe(false);
    expect(result.unchangedFiles[0].isDownloaded).toBe(true);
  });

  it('unterscheidet neue, geänderte und unveränderte Dateien', () => {
    const existingFiles = [
      createFile({
        id: 'file:1',
        iliasRefId: '1',
      }),
      createFile({
        id: 'file:2',
        iliasRefId: '2',
        title: 'Tutoriumsblatt02',
      }),
    ];
    
    const incomingFiles = [
      createFile({
        id: 'file:1',
        iliasRefId: '1',
      }),
      createFile({
        id: 'file:2',
        iliasRefId: '2',
        title: 'Tutoriumsblatt02 korrigiert',
      }),
      createFile({
        id: 'file:3',
        iliasRefId: '3',
        title: 'Tutoriumsblatt03',
      }),
    ];

    const result = compareIliasFiles(
      incomingFiles,
      existingFiles,
    );

    expect(result.newFiles).toHaveLength(1);
    expect(result.changedFiles).toHaveLength(1);
    expect(result.unchangedFiles).toHaveLength(1);
    expect(result.filesToSave).toHaveLength(3);
  });

  it('erkennt eine entfernte Datei', () => {
  const existing = createFile({
    iliasRefId: '1',
  });

  const result = compareIliasFiles([], [existing]);

  expect(result.removedFiles).toHaveLength(1);
  expect(result.removedFiles[0].isRemoved).toBe(true);
  expect(result.filesToSave).toHaveLength(1);
});

});