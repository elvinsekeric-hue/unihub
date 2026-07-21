import { invoke } from '@tauri-apps/api/core';
import { compareIliasFiles } from './compareIliasFiles';
import { parseIliasPage } from '../infrastructure/ilias/parser';
import {
  loadFiles,
  saveFiles,
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

  const courseId = resolveCourseId(scan);

  const parsed = parseIliasPage(
    scan.html,
    courseId,
    scan.pageUrl,
  );

  const existingFiles = await loadFiles(courseId);

  const comparison = compareIliasFiles(
    parsed.files,
    existingFiles,
  );

  await saveFiles(comparison.filesToSave);

  return {
    discovered: comparison.filesToSave.length,
    newFiles: comparison.newFiles.length,
    changedFiles: comparison.changedFiles.length,
    unchangedFiles: comparison.unchangedFiles.length,
  };
}