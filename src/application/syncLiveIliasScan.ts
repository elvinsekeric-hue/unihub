import {
  buildSubmissionEvents,
  compareIliasAssignments,
} from './compareIliasAssignments';

import {
  loadAssignments,
  replaceSubmissionFilesForAssignment,
  saveAssignments,
} from '../infrastructure/sqlite/assignmentStore';
import {
  saveSubmissionEvents,
} from '../infrastructure/sqlite/submissionEventStore';
import {
  rebuildSearchIndex,
} from '../infrastructure/sqlite/searchStore';
import { invoke } from '@tauri-apps/api/core';
import { compareIliasFiles } from './compareIliasFiles';
import {
  resolveScanSource,
  type ResolvedScanSource,
} from './courseRegistry';
import { parseIliasPage } from '../infrastructure/ilias/parser';
import { getPageRefId } from '../infrastructure/ilias/selectors/shared';
import {
  loadFolderByRefId,
  markMissingFoldersRemoved,
  saveFolders,
} from '../infrastructure/sqlite/folderStore';
import {
  loadFiles,
  saveFiles,
  saveSyncSnapshot,
} from '../infrastructure/sqlite/fileStore';

interface IliasScan {
  scanId: number;
  source: string;
  version: number;
  scannedAt: string;
  pageUrl: string;
  crawlStartUrl?: string | null;
  pageTitle: string;
  html: string;
}

export interface LiveSyncResult {
  courseId: string;
  scanSourceId: string;
  discovered: number;
  discoveredFolders: number;
  newFiles: number;
  changedFiles: number;
  unchangedFiles: number;
  removedFiles: number;
  removedFolders: number;
  discoveredAssignments: number;
newAssignments: number;
changedAssignments: number;
unchangedAssignments: number;
removedAssignments: number;
}

function isFolderPage(pageUrl: string): boolean {
  const normalizedUrl = pageUrl.toLocaleLowerCase('de-DE');

  return (
    normalizedUrl.includes('ilobjfoldergui') ||
    normalizedUrl.includes('/go/fold/')
  );
}

function isCoursePage(pageUrl: string): boolean {
  const normalized =
    pageUrl.toLocaleLowerCase('de-DE');

  return normalized.includes(
    'ilobjcoursegui',
  );
}

function isAssignmentPage(
  pageUrl: string,
): boolean {
  const normalized =
    pageUrl.toLocaleLowerCase('de-DE');

  return (
    normalized.includes('ilexercise') ||
    normalized.includes('ilobjexercise') ||
    normalized.includes('assignment') ||
    normalized.includes('ass_id=') ||
    normalized.includes('exercise')
  );
}

async function resolveSyncSource(
  scan: IliasScan,
): Promise<ResolvedScanSource> {
  /*
   * Zuerst versuchen wir die aktuell geöffnete Seite
   * direkt zu erkennen.
   */
  try {
    return resolveScanSource(scan);
  } catch (currentPageError) {
    /*
     * Bei einem automatischen Crawl verwenden wir als
     * nächsten Rückfall die ursprüngliche Kursseite.
     *
     * Dadurch gehören auch Übungs-, Abgabe- und andere
     * Spezialseiten weiterhin zum richtigen Kurs.
     */
    if (scan.crawlStartUrl) {
      try {
        return resolveScanSource({
          pageUrl: scan.crawlStartUrl,
          pageTitle: scan.pageTitle,
          html: '',
        });
      } catch {
        // Anschließend gespeicherten Ordner prüfen.
      }
    }

    /*
     * Normale Unterordner können über die bereits
     * gespeicherte ref_id erkannt werden.
     */
    const pageRefId =
      getPageRefId(scan.pageUrl);

    if (pageRefId) {
      const storedFolder =
        await loadFolderByRefId(pageRefId);

      if (
        storedFolder?.scanSourceId &&
        storedFolder.courseId
      ) {
        return {
          courseId:
            storedFolder.courseId,
          scanSourceId:
            storedFolder.scanSourceId,
        };
      }
    }

    throw currentPageError;
  }
}

export async function importLatestIliasScan():
Promise<LiveSyncResult | null> {
  const startedAt = new Date().toISOString();

  const scan = await invoke<IliasScan | null>(
    'take_next_ilias_scan',
  );

  if (!scan) {
    return null;
  }

const currentScan = scan;

  async function completeScan(
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  await invoke('complete_ilias_scan', {
    scanId: currentScan.scanId,
    success,
    errorMessage: errorMessage ?? null,
  });
}

  try {
    if (
      scan.source !==
      'unihub-ilias-extension'
    ) {
      throw new Error(
        'Der empfangene Scan stammt nicht von UniHub.',
      );
    }

    const {
      courseId,
      scanSourceId,
    } = await resolveSyncSource(scan);

    const pageRefId =
      getPageRefId(scan.pageUrl);

    const currentFolder =
      pageRefId &&
      isFolderPage(scan.pageUrl)
        ? await loadFolderByRefId(pageRefId)
        : undefined;

    const currentFolderId =
      pageRefId &&
      isFolderPage(scan.pageUrl)
        ? `folder:${pageRefId}`
        : undefined;

    const currentFolderPath =
      currentFolder?.path ?? [];

    const parsed = parseIliasPage(
      scan.html,
      courseId,
      scan.pageUrl,
    );

    const scannedFiles = parsed.files.map(
      (file) => ({
        ...file,
        courseId,
        scanSourceId,
        folderId: currentFolderId,
      }),
    );

    const scannedFolders =
      parsed.folders.map((folder) => ({
        ...folder,
        courseId,
        scanSourceId,
        parentFolderId: currentFolderId,
        path: [
          ...currentFolderPath,
          folder.title,
        ],
      }));

      const scannedAssignments =
  parsed.assignments.map(
    (assignment) => ({
      ...assignment,
      courseId,
      scanSourceId,
      folderId: currentFolderId,
    }),
  );

  const scannedSubmissionFiles =
  parsed.submissionFiles.map(
    (file) => ({
      ...file,
      courseId,
    }),
  );

    const pageSupportsFiles =
  isFolderPage(scan.pageUrl) ||
  isCoursePage(scan.pageUrl);

const existingFiles = pageSupportsFiles
  ? await loadFiles(
      courseId,
      true,
      scanSourceId,
      currentFolderId ?? null,
    )
  : [];

const comparison = pageSupportsFiles
  ? compareIliasFiles(
      scannedFiles,
      existingFiles,
    )
  : {
      filesToSave: [],
      newFiles: [],
      changedFiles: [],
      unchangedFiles: [],
      removedFiles: [],
    };

const pageSupportsAssignments =
  isAssignmentPage(scan.pageUrl) ||
  parsed.assignments.length > 0;

const pageAssignmentId =
  new URL(
    scan.pageUrl,
  ).searchParams.get('ass_id');

const isAssignmentDetailPage =
  Boolean(pageAssignmentId);

/*
 * Auf einer Detailseite kennen wir den Ordner der Abgabe
 * nicht zwangsläufig (currentFolderId ist hier meist leer),
 * daher wird beim Laden nicht nach Ordner gefiltert – die
 * passende bestehende Abgabe wird unten per ID gesucht.
 */
const existingAssignments =
  pageSupportsAssignments
    ? await loadAssignments(
        courseId,
        true,
        scanSourceId,
        isAssignmentDetailPage
          ? undefined
          : (currentFolderId ?? null),
      )
    : [];



    await saveFiles(comparison.filesToSave);
    await saveFolders(scannedFolders)

const assignmentComparison =
  pageSupportsAssignments &&
  !isAssignmentDetailPage
    ? compareIliasAssignments(
        scannedAssignments,
        existingAssignments,
        startedAt,
      )
    : {
        assignmentsToSave:
          scannedAssignments,
        newAssignments: [],
        changedAssignments:
          scannedAssignments,
        unchangedAssignments: [],
        removedAssignments: [],
        submissionEvents:
          scannedAssignments.flatMap(
            (assignment) =>
              buildSubmissionEvents(
                assignment,
                existingAssignments.find(
                  (existing) =>
                    existing.id ===
                    assignment.id,
                ),
                startedAt,
              ),
          ),
      };

await saveAssignments(
  assignmentComparison.assignmentsToSave,
);

if (pageAssignmentId) {
  await replaceSubmissionFilesForAssignment(
    `assignment:${pageAssignmentId}`,
    scannedSubmissionFiles,
  );
}

await saveSubmissionEvents(
  assignmentComparison.submissionEvents,
);

    const removedFolders = pageSupportsFiles
  ? await markMissingFoldersRemoved(
      courseId,
      scanSourceId,
      currentFolderId,
      scannedFolders.map(
        (folder) => folder.iliasRefId,
      ),
    )
  : 0;

    await saveSyncSnapshot({
  courseId,
  scanSourceId,
  startedAt,
  completedAt:
    new Date().toISOString(),
  status: 'success',
  discovered:
    scannedFiles.length +
    scannedAssignments.length,
  changed:
    comparison.newFiles.length +
    comparison.changedFiles.length +
    assignmentComparison
      .newAssignments.length +
    assignmentComparison
      .changedAssignments.length,
  removed:
    comparison.removedFiles.length +
    assignmentComparison
      .removedAssignments.length,
});

   const result: LiveSyncResult = {
  courseId,
  scanSourceId,
  discovered: scannedFiles.length,
  discoveredFolders:
    scannedFolders.length,
  discoveredAssignments:
    scannedAssignments.length,

  newFiles:
    comparison.newFiles.length,
  changedFiles:
    comparison.changedFiles.length,
  unchangedFiles:
    comparison.unchangedFiles.length,
  removedFiles:
    comparison.removedFiles.length,

  newAssignments:
    assignmentComparison
      .newAssignments.length,
  changedAssignments:
    assignmentComparison
      .changedAssignments.length,
  unchangedAssignments:
    assignmentComparison
      .unchangedAssignments.length,
  removedAssignments:
    assignmentComparison
      .removedAssignments.length,

  removedFolders,
};

    await rebuildSearchIndex();


    await completeScan(true);

    return result;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await completeScan(false, message)
      .catch((completionError) => {
        console.error(
          'Scan-Abschluss konnte nicht bestätigt werden:',
          completionError,
        );
      });

    throw error;
  }
}