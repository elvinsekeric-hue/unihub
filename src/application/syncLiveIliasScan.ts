import { invoke } from '@tauri-apps/api/core';
import type { LearningFile } from '../domain/models';
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
}

function resolveCourseId(scan: IliasScan): string {
  /*
   * Ticket #007D unterstützt zunächst den bereits getesteten LDS-Kurs.
   * Die automatische Kurszuordnung folgt im nächsten Ticket.
   */
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

function markNewFiles(
  parsedFiles: LearningFile[],
  existingFiles: LearningFile[],
): LearningFile[] {
  const existingRefIds = new Set(
    existingFiles.map((file) => file.iliasRefId),
  );

  return parsedFiles.map((file) => ({
    ...file,
    isNew: !existingRefIds.has(file.iliasRefId),
  }));
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
    throw new Error('Der empfangene Scan stammt nicht von UniHub.');
  }

  const courseId = resolveCourseId(scan);

  const parsed = parseIliasPage(
    scan.html,
    courseId,
    scan.pageUrl,
  );

  const existingFiles = await loadFiles(courseId);

  const filesToSave = markNewFiles(
    parsed.files,
    existingFiles,
  );

  await saveFiles(filesToSave);

  return {
    discovered: filesToSave.length,
    newFiles: filesToSave.filter((file) => file.isNew).length,
  };
}