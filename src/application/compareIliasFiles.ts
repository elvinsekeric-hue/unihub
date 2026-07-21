import type { LearningFile } from '../domain/models';

export interface FileComparisonResult {
  filesToSave: LearningFile[];
  newFiles: LearningFile[];
  changedFiles: LearningFile[];
  unchangedFiles: LearningFile[];
  removedFiles: LearningFile[];
}

function hasFileChanged(
  incoming: LearningFile,
  existing: LearningFile,
): boolean {
  return (
    incoming.courseId !== existing.courseId ||
    incoming.folderId !== existing.folderId ||
    incoming.title !== existing.title ||
    incoming.url !== existing.url ||
    incoming.mimeType !== existing.mimeType ||
    incoming.fileSizeBytes !== existing.fileSizeBytes ||
    incoming.pageCount !== existing.pageCount ||
    incoming.description !== existing.description ||
    incoming.availableAt !== existing.availableAt ||
    incoming.uploadedAt !== existing.uploadedAt ||
    incoming.lastModifiedAt !== existing.lastModifiedAt ||
    incoming.etag !== existing.etag
  );
}

export function compareIliasFiles(
  incomingFiles: LearningFile[],
  existingFiles: LearningFile[],
): FileComparisonResult {
  const existingByRefId = new Map(
    existingFiles.map((file) => [file.iliasRefId, file]),
  );

  const incomingRefIds = new Set(
    incomingFiles.map((file) => file.iliasRefId),
  );

  const newFiles: LearningFile[] = [];
  const changedFiles: LearningFile[] = [];
  const unchangedFiles: LearningFile[] = [];

  for (const incomingFile of incomingFiles) {
    const existingFile = existingByRefId.get(
      incomingFile.iliasRefId,
    );

    if (!existingFile) {
      newFiles.push({
        ...incomingFile,
        isNew: true,
        isRemoved: false,
      });
      continue;
    }

    if (
      existingFile.isRemoved ||
      hasFileChanged(incomingFile, existingFile)
    ) {
      changedFiles.push({
        ...incomingFile,
        isNew: true,
        isDownloaded: existingFile.isDownloaded,
        isRemoved: false,
      });
      continue;
    }

    unchangedFiles.push({
      ...incomingFile,
      isNew: false,
      isDownloaded: existingFile.isDownloaded,
      isRemoved: false,
    });
  }

  const removedFiles = existingFiles
    .filter(
      (file) =>
        !file.isRemoved &&
        !incomingRefIds.has(file.iliasRefId),
    )
    .map((file) => ({
      ...file,
      isNew: false,
      isRemoved: true,
    }));

  return {
    filesToSave: [
      ...newFiles,
      ...changedFiles,
      ...unchangedFiles,
      ...removedFiles,
    ],
    newFiles,
    changedFiles,
    unchangedFiles,
    removedFiles,
  };
}