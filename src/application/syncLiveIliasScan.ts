import { invoke } from '@tauri-apps/api/core';
import { compareIliasFiles } from './compareIliasFiles';
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
  discovered: number;
  newFiles: number;
  changedFiles: number;
  unchangedFiles: number;
  removedFiles: number;
}

function resolveCourseId(scan: IliasScan): string {
  if (
    scan.pageUrl.includes('4364743') ||
    scan.pageTitle
      .toLocaleLowerCase('de-DE')
      .includes('tutoriumsblätter')
  ) {
    return 'course:lds';
  }

  throw new Error(
    `Die Seite "${scan.pageTitle}" konnte noch keinem Kurs zugeordnet werden.`,
  );
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

  const courseId = resolveCourseId(scan);

  try {
    const parsed = parseIliasPage(
      scan.html,
      courseId,
      scan.pageUrl,
    );

    const existingFiles = await loadFiles(
      courseId,
      true,
    );

    const comparison = compareIliasFiles(
      parsed.files,
      existingFiles,
    );

    await saveFiles(comparison.filesToSave);

    await saveSyncSnapshot({
      courseId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'success',
      discovered: parsed.files.length,
      changed:
        comparison.newFiles.length +
        comparison.changedFiles.length,
      removed: comparison.removedFiles.length,
    });

    return {
      discovered: parsed.files.length,
      newFiles: comparison.newFiles.length,
      changedFiles: comparison.changedFiles.length,
      unchangedFiles: comparison.unchangedFiles.length,
      removedFiles: comparison.removedFiles.length,
    };
  } catch (error) {
    await saveSyncSnapshot({
      courseId,
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