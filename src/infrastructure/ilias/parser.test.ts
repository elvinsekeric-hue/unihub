// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIliasPage } from './parser';

const fixturePath = resolve(
  process.cwd(),
  'src',
  'infrastructure',
  'ilias',
  '__fixtures__',
  'tutoriumsblätter.html',
);

const html = readFileSync(fixturePath, 'utf8');

const pageUrl =
  'https://ilias3.uni-stuttgart.de/ilias.php' +
  '?baseClass=ilrepositorygui' +
  '&cmdClass=ilObjFolderGUI' +
  '&ref_id=4364743';

describe('parseIliasPage', () => {
  it('erkennt alle 13 Tutoriumsblätter', () => {
    const result = parseIliasPage(html, 'course:lds', pageUrl);

    expect(result.files).toHaveLength(13);
    expect(result.folders).toHaveLength(0);
    expect(result.assignments).toHaveLength(0);
  });

  it('liest Tutoriumsblatt01 korrekt aus', () => {
    const result = parseIliasPage(html, 'course:lds', pageUrl);

    const file = result.files.find(
      (entry) => entry.iliasRefId === '4409908',
    );

    expect(file).toBeDefined();
    expect(file).toMatchObject({
      id: 'file:4409908',
      courseId: 'course:lds',
      folderId: 'folder:4364743',
      title: 'Tutoriumsblatt01',
      mimeType: 'application/pdf',
      pageCount: 2,
      isNew: false,
      isDownloaded: false,
    });

    expect(file?.fileSizeBytes).toBeGreaterThan(600_000);
    expect(file?.availableAt).toContain('2026-04-13');
  });

  it('übernimmt die Korrektur-Beschreibung von Blatt 04', () => {
    const result = parseIliasPage(html, 'course:lds', pageUrl);

    const file = result.files.find(
      (entry) => entry.title === 'Tutoriumsblatt04',
    );

    expect(file?.description).toContain(
      'Aufgabe 2 wurde überarbeitet/korrigiert.',
    );
  });

  it('erzeugt für jede Datei eine eindeutige ref_id', () => {
    const result = parseIliasPage(html, 'course:lds', pageUrl);

    const refIds = result.files.map((file) => file.iliasRefId);

    expect(new Set(refIds).size).toBe(13);
  });
});