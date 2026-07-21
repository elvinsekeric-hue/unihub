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
  source: string;
  version: number;
  scannedAt: string;
  pageUrl: string;
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
}

function isFolderPage(pageUrl: string): boolean {
  const normalizedUrl = pageUrl.toLocaleLowerCase('de-DE');

  return (
    normalizedUrl.includes('ilobjfoldergui') ||
    normalizedUrl.includes('/go/fold/')
  );
}

async function resolveSyncSource(
  scan: IliasScan,
): Promise<ResolvedScanSource> {
  /*
   * Bekannte Hauptseiten und bekannte Quellen wie das
   * LDS-Tutorium werden zuerst über die Registry erkannt.
   */
  try {
    return resolveScanSource(scan);
  } catch (registryError) {
    /*
     * Ein Unterordner hat normalerweise eine neue ref_id,
     * die nicht in der Registry steht. In diesem Fall
     * übernehmen wir Kurs und Scan-Quelle aus dem bereits
     * gespeicherten Ordner.
     */
    const pageRefId = getPageRefId(scan.pageUrl);

    if (pageRefId) {
      const storedFolder = await loadFolderByRefId(pageRefId);

      if (
        storedFolder?.scanSourceId &&
        storedFolder.courseId
      ) {
        return {
          courseId: storedFolder.courseId,
          scanSourceId: storedFolder.scanSourceId,
        };
      }
    }

    throw registryError;
  }
}

export async function importLatestIliasScan():
Promise<LiveSyncResult | null> {
  const startedAt = new Date().toISOString();

  const scan = await invoke<IliasScan | null>(
    'take_latest_ilias_scan',
  );

  if (!scan) {
    return null;
  }

  if (scan.source !== 'unihub-ilias-extension') {
    throw new Error(
      'Der empfangene Scan stammt nicht von UniHub.',
    );
  }

  const {
    courseId,
    scanSourceId,
  } = await resolveSyncSource(scan);

  try {
    const pageRefId = getPageRefId(scan.pageUrl);

    const currentFolder =
      pageRefId && isFolderPage(scan.pageUrl)
        ? await loadFolderByRefId(pageRefId)
        : undefined;

    const currentFolderId =
      pageRefId && isFolderPage(scan.pageUrl)
        ? `folder:${pageRefId}`
        : undefined;

    const currentFolderPath =
      currentFolder?.path ?? [];

    const parsed = parseIliasPage(
      scan.html,
      courseId,
      scan.pageUrl,
    );

    const scannedFiles = parsed.files.map((file) => ({
      ...file,
      courseId,
      scanSourceId,
      folderId: currentFolderId,
    }));

    const scannedFolders = parsed.folders.map((folder) => ({
      ...folder,
      courseId,
      scanSourceId,
      parentFolderId: currentFolderId,
      path: [
        ...currentFolderPath,
        folder.title,
      ],
    }));

    /*
     * Es werden nur Dateien der aktuell geöffneten Seite
     * verglichen. Dadurch beeinflussen sich Unterordner
     * innerhalb derselben Scan-Quelle nicht gegenseitig.
     */
    const existingFiles = await loadFiles(
      courseId,
      true,
      scanSourceId,
      currentFolderId ?? null,
    );

    const comparison = compareIliasFiles(
      scannedFiles,
      existingFiles,
    );

    await saveFiles(comparison.filesToSave);
    await saveFolders(scannedFolders);

    const removedFolders =
      await markMissingFoldersRemoved(
        courseId,
        scanSourceId,
        currentFolderId,
        scannedFolders.map(
          (folder) => folder.iliasRefId,
        ),
      );

    await saveSyncSnapshot({
      courseId,
      scanSourceId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'success',
      discovered: scannedFiles.length,
      changed:
        comparison.newFiles.length +
        comparison.changedFiles.length,
      removed: comparison.removedFiles.length,
    });

    return {
      courseId,
      scanSourceId,
      discovered: scannedFiles.length,
      discoveredFolders: scannedFolders.length,
      newFiles: comparison.newFiles.length,
      changedFiles: comparison.changedFiles.length,
      unchangedFiles: comparison.unchangedFiles.length,
      removedFiles: comparison.removedFiles.length,
      removedFolders,
    };
  } catch (error) {
    await saveSyncSnapshot({
      courseId,
      scanSourceId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'failed',
      discovered: 0,
      changed: 0,
      removed: 0,
      errorMessage:
        error instanceof Error
          ? error.message
          : String(error),
    });

    throw error;
  }
}