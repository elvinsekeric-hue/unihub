import { describe, expect, it } from 'vitest';
import {
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