import type {
  Assignment,
  Folder,
  LearningFile,
  SubmissionFile,
} from '../../domain/models';
import { parseAssignments } from './selectors/assignment';
import { parseFiles } from './selectors/file';
import { parseFolders } from './selectors/folder';
import { parseHtml } from './selectors/shared';
import {
  parseSubmissionFiles,
} from './selectors/submission';

export interface ParsedIliasPage {
  folders: Folder[];
  files: LearningFile[];
  assignments: Assignment[];
  submissionFiles: SubmissionFile[];
}

export function parseIliasPage(
  html: string,
  courseId: string,
  pageUrl: string,
): ParsedIliasPage {
  if (!html.trim()) {
    return {
      folders: [],
      files: [],
      assignments: [],
      submissionFiles: [],
    };
  }

  const document = parseHtml(html);

  return {
  folders: parseFolders(
    document,
    courseId,
    pageUrl,
  ),
  files: parseFiles(
    document,
    courseId,
    pageUrl,
  ),
  assignments: parseAssignments(
    document,
    courseId,
    pageUrl,
  ),
  submissionFiles:
    parseSubmissionFiles(
      document,
      courseId,
      pageUrl,
    ),
};
}