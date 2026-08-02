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

/*
 * Echte Abgabe-/Bewertungsdateien haben in ILIAS immer eine
 * Dateiendung. Platzhaltertexte wie „Sie haben noch keine
 * Datei abgegeben." oder Fristangaben aus benachbarten Widgets
 * haben keine – so lassen sie sich zuverlässig ausschließen.
 */
function looksLikeFileName(title: string): boolean {
  return /\.(pdf|zip|docx?|pptx?|xlsx?)$/i.test(
    title.trim(),
  );
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

  /*
   * Bewusst ohne Positions-Index: dieselbe Datei wird oft von
   * mehreren Seitenansichten (Übersicht, Einreichung, Detail)
   * erneut gefunden. Eine inhaltsbasierte ID lässt den Upsert
   * (ON CONFLICT) sie zusammenführen statt zu duplizieren.
   */
  return {
    id:
      `submission-file:${assignmentId}:` +
      `${kind}:${safeTitle}`,
    assignmentId:
      `assignment:${assignmentId}`,
    courseId,
    kind,
    title: safeTitle,
    url,
    mimeType: getMimeType(safeTitle),
  };
}

/*
 * Manche ILIAS-Seiten (z. B. die Übungs-Übersicht) listen alle
 * Abgaben eines Kurses gemeinsam auf. Damit ein gefundener Link
 * nicht versehentlich einer anderen Abgabe zugeordnet wird, muss
 * seine eigene ass_id (falls vorhanden) zur aktuell geparsten
 * Abgabe passen.
 */
function belongsToAssignment(
  url: string,
  assignmentId: string,
): boolean {
  const linkAssignmentId = getQueryParameter(
    url,
    'ass_id',
  );

  return (
    !linkAssignmentId ||
    linkAssignmentId === assignmentId
  );
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

    if (
      !url ||
      !belongsToAssignment(url, assignmentId)
    ) {
      continue;
    }

    const title = cleanFilename(
      containerText,
    );

    if (!looksLikeFileName(title)) {
      continue;
    }

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

    if (!title || !looksLikeFileName(title)) {
      continue;
    }

    /*
     * Ohne echten Download-Link ist kein tatsächliches
     * Dateiabgabe-Element getroffen worden, sondern z. B.
     * ein Platzhaltertext oder ein benachbartes Widget.
     */
    if (!link) {
      continue;
    }

    const url = toAbsoluteUrl(
      link.getAttribute('href') ?? '',
      pageUrl,
    );

    if (
      !url ||
      !belongsToAssignment(url, assignmentId)
    ) {
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
    /*
     * Ohne URL im Schlüssel, da dieselbe Datei oft von
     * mehreren Seitenansichten (Übersicht, Einreichung,
     * Detail) mit unterschiedlichen URLs gefunden wird.
     */
    uniqueFiles.set(
      `${file.kind}:${file.title}`,
      file,
    );
  }

  return [...uniqueFiles.values()];
}