import type {
  SubmissionFile,
} from '../../../domain/models';

import {
  getQueryParameter,
  normalizeText,
  toAbsoluteUrl,
} from './shared';

function cleanFilename(value: string): string {
  return normalizeText(value)
    .replace(/^Abgegebene Dateien\s*/i, '')
    .replace(/^Bewertung\s*/i, '')
    .replace(/\bDownload\b/gi, '')
    .replace(
      /Datum der letzten Abgabe.*$/i,
      '',
    )
    .trim();
}

function getMimeType(
  filename: string,
): string | undefined {
  const extension = filename
    .split('.')
    .pop()
    ?.toLocaleLowerCase('de-DE');

  const types: Record<string, string> = {
    pdf: 'application/pdf',
    zip: 'application/zip',
    doc: 'application/msword',
    docx:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };

  return extension
    ? types[extension]
    : undefined;
}

function findNearestContainer(
  element: Element,
): Element {
  return (
    element.closest(
      'tr, .form-group, .row, .ilFormOption, ' +
        '.panel, .card, section, li',
    ) ?? element.parentElement ?? element
  );
}

function createFile(
  assignmentId: string,
  courseId: string,
  kind: SubmissionFile['kind'],
  title: string,
  url: string,
  index: number,
): SubmissionFile {
  const safeTitle =
    title || `${kind}-Datei-${index + 1}`;

  return {
    id:
      `submission-file:${assignmentId}:` +
      `${kind}:${index}:${safeTitle}`,
    assignmentId:
      `assignment:${assignmentId}`,
    courseId,
    kind,
    title: safeTitle,
    url,
    mimeType: getMimeType(safeTitle),
  };
}

function parseFeedbackFiles(
  document: Document,
  assignmentId: string,
  courseId: string,
  pageUrl: string,
): SubmissionFile[] {
  const files: SubmissionFile[] = [];

  const downloadLinks =
    document.querySelectorAll<HTMLAnchorElement>(
      'a[href]',
    );

  for (const anchor of downloadLinks) {
    const anchorText = normalizeText(
      anchor.textContent,
    );

    const href =
      anchor.getAttribute('href') ?? '';

    const container =
      findNearestContainer(anchor);

    const containerText = normalizeText(
      container.textContent,
    );

    const isDownload =
      /^download$/i.test(anchorText) ||
      /download/i.test(href);

    const isEvaluation =
      /Bewertung/i.test(containerText) ||
      /annotated/i.test(containerText);

    if (!isDownload || !isEvaluation) {
      continue;
    }

    const url = toAbsoluteUrl(href, pageUrl);

    if (!url) {
      continue;
    }

    const title = cleanFilename(
      containerText,
    );

    files.push(
      createFile(
        assignmentId,
        courseId,
        'feedback',
        title,
        url,
        files.length,
      ),
    );
  }

  return files;
}

function parseSubmittedFiles(
  document: Document,
  assignmentId: string,
  courseId: string,
  pageUrl: string,
): SubmissionFile[] {
  const files: SubmissionFile[] = [];

  const elements =
    document.querySelectorAll<HTMLElement>(
      'tr, .form-group, .row, .ilFormOption, ' +
        '.panel-body, .card-body, section',
    );

  for (const element of elements) {
    const text = normalizeText(
      element.textContent,
    );

    if (
      !/Abgegebene Dateien/i.test(text)
    ) {
      continue;
    }

    const link =
      element.querySelector<HTMLAnchorElement>(
        'a[href]',
      );

    const filenameMatch = text.match(
      /Abgegebene Dateien\s+(.+?)(?:Datum der letzten Abgabe|Bereits abgegebene Dateien|$)/i,
    );

    const title = cleanFilename(
      filenameMatch?.[1] ?? '',
    );

    if (!title) {
      continue;
    }

    const url = link
      ? toAbsoluteUrl(
          link.getAttribute('href') ?? '',
          pageUrl,
        )
      : pageUrl;

    if (!url) {
      continue;
    }

    files.push(
      createFile(
        assignmentId,
        courseId,
        'submitted',
        title,
        url,
        files.length,
      ),
    );
  }

  return files;
}

export function parseSubmissionFiles(
  document: Document,
  courseId: string,
  pageUrl: string,
): SubmissionFile[] {
  const assignmentId =
    getQueryParameter(pageUrl, 'ass_id');

  if (!assignmentId) {
    return [];
  }

  const submittedFiles =
    parseSubmittedFiles(
      document,
      assignmentId,
      courseId,
      pageUrl,
    );

  const feedbackFiles =
    parseFeedbackFiles(
      document,
      assignmentId,
      courseId,
      pageUrl,
    );

  const uniqueFiles = new Map<
    string,
    SubmissionFile
  >();

  for (const file of [
    ...submittedFiles,
    ...feedbackFiles,
  ]) {
    uniqueFiles.set(
      `${file.kind}:${file.title}:${file.url}`,
      file,
    );
  }

  return [...uniqueFiles.values()];
}