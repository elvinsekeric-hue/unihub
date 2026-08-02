import { describe, expect, it } from 'vitest';
import {
  buildFullSyncStartUrls,
  resolveScanSource,
  type CourseScanData,
} from './courseRegistry';

function createScan(
  overrides: Partial<CourseScanData> = {},
): CourseScanData {
  return {
    pageUrl: 'https://ilias3.uni-stuttgart.de/',
    pageTitle: 'ILIAS',
    html: '<html></html>',
    ...overrides,
  };
}

describe('resolveScanSource', () => {
  it('erkennt den LDS-Hauptkurs', () => {
    const result = resolveScanSource(
      createScan({
        pageUrl:
          'https://ilias3.uni-stuttgart.de/' +
          'ilias.php?ref_id=4364722',
      }),
    );

    expect(result).toEqual({
      courseId: 'course:lds',
      scanSourceId: 'source:lds-main',
    });
  });

  it('erkennt das LDS-Tutorium', () => {
    const result = resolveScanSource(
      createScan({
        pageUrl:
          'https://ilias3.uni-stuttgart.de/' +
          'ilias.php?ref_id=4364743',
      }),
    );

    expect(result).toEqual({
      courseId: 'course:lds',
      scanSourceId: 'source:lds-tutorial',
    });
  });

  it('erkennt die DSA-Vorlesung', () => {
    const result = resolveScanSource(
      createScan({
        pageUrl:
          'https://ilias3.uni-stuttgart.de/' +
          'ilias.php?ref_id=4392414',
      }),
    );

    expect(result).toEqual({
      courseId: 'course:dsa',
      scanSourceId: 'source:dsa-lecture',
    });
  });

  it('erkennt die DSA-Übung', () => {
    const result = resolveScanSource(
      createScan({
        pageUrl:
          'https://ilias3.uni-stuttgart.de/' +
          'ilias.php?ref_id=4390617',
      }),
    );

    expect(result).toEqual({
      courseId: 'course:dsa',
      scanSourceId: 'source:dsa-exercise',
    });
  });

  it('erkennt Mathematik', () => {
    const result = resolveScanSource(
      createScan({
        pageUrl:
          'https://ilias3.uni-stuttgart.de/' +
          'ilias.php?ref_id=4405757',
      }),
    );

    expect(result).toEqual({
      courseId: 'course:mathe',
      scanSourceId: 'source:mathe-main',
    });
  });

  it('bevorzugt die aktuelle URL vor Links im HTML', () => {
    const result = resolveScanSource(
      createScan({
        pageUrl:
          'https://ilias3.uni-stuttgart.de/' +
          'ilias.php?ref_id=4364722',
        html:
          '<a href="ilias.php?ref_id=4364743">' +
          'Tutoriumsblätter</a>',
      }),
    );

    expect(result).toEqual({
      courseId: 'course:lds',
      scanSourceId: 'source:lds-main',
    });
  });

  it('lehnt unbekannte Seiten ab', () => {
    expect(() =>
      resolveScanSource(
        createScan({
          pageTitle: 'Unbekannter Kurs',
        }),
      ),
    ).toThrow('keiner bekannten Scan-Quelle');
  });
});

describe('buildFullSyncStartUrls', () => {
  it('liefert eine Start-URL für jede Scan-Quelle', () => {
    const urls = buildFullSyncStartUrls();

    expect(urls).toHaveLength(5);
  });

  it('deckt alle registrierten refIds ab', () => {
    const urls = buildFullSyncStartUrls();

    for (const refId of [
      '4364722',
      '4364743',
      '4392414',
      '4390617',
      '4405757',
    ]) {
      expect(
        urls.some((url) =>
          url.includes(`ref_id=${refId}`),
        ),
      ).toBe(true);
    }
  });

  it('verwendet für Ordner die ilObjFolderGUI', () => {
    const urls = buildFullSyncStartUrls();

    const tutoriumUrl = urls.find((url) =>
      url.includes('ref_id=4364743'),
    );

    expect(tutoriumUrl).toContain(
      'cmdClass=ilObjFolderGUI',
    );
  });

  it('verwendet für Kurse die ilobjcoursegui', () => {
    const urls = buildFullSyncStartUrls();

    const courseUrls = urls.filter(
      (url) =>
        !url.includes('ref_id=4364743'),
    );

    expect(courseUrls).toHaveLength(4);

    for (const url of courseUrls) {
      expect(url).toContain(
        'cmdClass=ilobjcoursegui',
      );
    }
  });

  it('enthält keine Duplikate', () => {
    const urls = buildFullSyncStartUrls();

    expect(new Set(urls).size).toBe(
      urls.length,
    );
  });
});