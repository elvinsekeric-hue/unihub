import { invoke } from '@tauri-apps/api/core';
import { compareIliasFiles } from './compareIliasFiles';
import { resolveScanSource } from './courseRegistry';
import { parseIliasPage } from '../infrastructure/ilias/parser';
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
  newFiles: number;
  changedFiles: number;
  unchangedFiles: number;
  removedFiles: number;
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
  } = resolveScanSource(scan);

  try {
    const parsed = parseIliasPage(
      scan.html,
      courseId,
      scan.pageUrl,
    );

    const scannedFiles = parsed.files.map((file) => ({
      ...file,
      courseId,
      scanSourceId,
    }));

    const existingFiles = await loadFiles(
      courseId,
      true,
      scanSourceId,
    );

    const comparison = compareIliasFiles(
      scannedFiles,
      existingFiles,
    );

    await saveFiles(comparison.filesToSave);

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
      newFiles: comparison.newFiles.length,
      changedFiles: comparison.changedFiles.length,
      unchangedFiles: comparison.unchangedFiles.length,
      removedFiles: comparison.removedFiles.length,
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