export interface CourseScanData {
  pageUrl: string;
  pageTitle: string;
  html: string;
}

export interface RegisteredScanSource {
  courseId: string;
  scanSourceId: string;
  courseTitle: string;
  sourceTitle: string;
  shortName: string;
  iliasRefIds: string[];
  titleKeywords: string[];
}

export interface ResolvedScanSource {
  courseId: string;
  scanSourceId: string;
}

export const courseRegistry: RegisteredScanSource[] = [
  {
    courseId: 'course:lds',
    scanSourceId: 'source:lds-main',
    courseTitle: 'Logik und Diskrete Strukturen',
    sourceTitle: 'LDS Hauptkurs',
    shortName: 'LDS',
    iliasRefIds: ['4364722'],
    titleKeywords: [
      'logik und diskrete strukturen',
    ],
  },
  {
    courseId: 'course:lds',
    scanSourceId: 'source:lds-tutorial',
    courseTitle: 'Logik und Diskrete Strukturen',
    sourceTitle: 'LDS Tutorium',
    shortName: 'LDS Tutorium',
    iliasRefIds: ['4364743'],
    titleKeywords: [
      'tutoriumsblätter',
    ],
  },
  {
    courseId: 'course:dsa',
    scanSourceId: 'source:dsa-lecture',
    courseTitle: 'Datenstrukturen und Algorithmen',
    sourceTitle: 'DSA Vorlesung',
    shortName: 'DSA Vorlesung',
    iliasRefIds: ['4392414'],
    titleKeywords: [
      'datenstrukturen und algorithmen vorlesung',
    ],
  },
  {
    courseId: 'course:dsa',
    scanSourceId: 'source:dsa-exercise',
    courseTitle: 'Datenstrukturen und Algorithmen',
    sourceTitle: 'DSA Übung',
    shortName: 'DSA Übung',
    iliasRefIds: ['4390617'],
    titleKeywords: [
      'datenstrukturen und algorithmen übung',
      'datenstrukturen und algorithmen uebung',
    ],
  },
  {
    courseId: 'course:mathe',
    scanSourceId: 'source:mathe-main',
    courseTitle: 'Mathematik',
    sourceTitle: 'Mathematik Hauptkurs',
    shortName: 'MATHE',
    iliasRefIds: ['4405757'],
    titleKeywords: [
      'mathematik',
      'mathe',
    ],
  },
];

function containsRefId(
  scan: CourseScanData,
  refId: string,
): boolean {
  const escapedRefId = refId.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );

  const refPattern = new RegExp(
    `(?:ref_id=|/go/(?:crs|fold)/)${escapedRefId}(?:\\D|$)`,
    'i',
  );

  return (
    refPattern.test(scan.pageUrl) ||
    refPattern.test(scan.html)
  );
}

function containsTitleKeyword(
  scan: CourseScanData,
  keyword: string,
): boolean {
  return scan.pageTitle
    .toLocaleLowerCase('de-DE')
    .includes(keyword.toLocaleLowerCase('de-DE'));
}

export function resolveScanSource(
  scan: CourseScanData,
): ResolvedScanSource {
  /*
   * Die aktuelle Seiten-URL hat Vorrang.
   * Das verhindert, dass Links zu anderen Kursbereichen
   * im HTML eine mehrdeutige Zuordnung verursachen.
   */
  const matchesByPageUrl = courseRegistry.filter((source) =>
    source.iliasRefIds.some((refId) => {
      const escapedRefId = refId.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );

      return new RegExp(
        `(?:ref_id=|/go/(?:crs|fold)/)${escapedRefId}(?:\\D|$)`,
        'i',
      ).test(scan.pageUrl);
    }),
  );

  if (matchesByPageUrl.length === 1) {
    return {
      courseId: matchesByPageUrl[0].courseId,
      scanSourceId: matchesByPageUrl[0].scanSourceId,
    };
  }

  const matchesByTitle = courseRegistry.filter((source) =>
    source.titleKeywords.some((keyword) =>
      containsTitleKeyword(scan, keyword),
    ),
  );

  if (matchesByTitle.length === 1) {
    return {
      courseId: matchesByTitle[0].courseId,
      scanSourceId: matchesByTitle[0].scanSourceId,
    };
  }

  const matchesByHtml = courseRegistry.filter((source) =>
    source.iliasRefIds.some((refId) =>
      containsRefId(
        {
          ...scan,
          pageUrl: '',
        },
        refId,
      ),
    ),
  );

  if (matchesByHtml.length === 1) {
    return {
      courseId: matchesByHtml[0].courseId,
      scanSourceId: matchesByHtml[0].scanSourceId,
    };
  }

  if (matchesByPageUrl.length > 1) {
    throw new Error(
      'Die aktuelle ILIAS-Seite passt zu mehreren ' +
        'Scan-Quellen.',
    );
  }

  throw new Error(
    `Die Seite "${scan.pageTitle}" konnte noch keiner ` +
      'bekannten Scan-Quelle zugeordnet werden.',
  );
}

/*
 * Übergangsfunktion, falls an einer anderen Stelle
 * noch resolveCourseId verwendet wird.
 */
export function resolveCourseId(
  scan: CourseScanData,
): string {
  return resolveScanSource(scan).courseId;
}