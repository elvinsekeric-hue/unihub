import type { LearningFile } from '../../../domain/models';
import {
  findItemContainer,
  getItemProperties,
  getPageRefId,
  getQueryParameter,
  normalizeText,
  parseFileSize,
  parseGermanDate,
  toAbsoluteUrl,
} from './shared';

function getMimeType(fileType?: string): string | undefined {
  const normalized = fileType?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    zip: 'application/zip',
    doc: 'application/msword',
    docx:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  return normalized ? mimeTypes[normalized] : undefined;
}

function cleanTitle(value: string): string {
  return normalizeText(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[`´'"]+$/g, '')
    .trim();
}

function getFileTitle(anchor: HTMLAnchorElement): string {
  const heading = anchor.closest<HTMLHeadingElement>(
    'h3.il_ContainerItemTitle',
  );

  if (!heading) {
    return cleanTitle(anchor.textContent ?? '');
  }

  /*
   * Bei ILIAS Stuttgart ist der Download-Link häufig leer und der Titel
   * steht als direkter Textknoten daneben.
   */
  const directText = Array.from(heading.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join(' ');

  const titleFromTextNode = cleanTitle(directText);

  if (titleFromTextNode) {
    return titleFromTextNode;
  }

  const titleFromAnchor = cleanTitle(anchor.textContent ?? '');

  if (titleFromAnchor) {
    return titleFromAnchor;
  }

  const clone = heading.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll(
      '[aria-label="Vorschau"], button, .glyph, script, style',
    )
    .forEach((element) => element.remove());

  return cleanTitle(clone.textContent ?? '');
}

function getDescription(container: Element): string | undefined {
  const descriptionSelectors = [
    '.il_Description',
    '.ilContainerListItemDescription',
    '.il_ContainerItemDescription',
    '.ilListItemDescription',
  ];

  for (const selector of descriptionSelectors) {
    const text = normalizeText(
      container.querySelector(selector)?.textContent,
    );

    if (text) {
      return text;
    }
  }

  /*
   * Fallback für ILIAS-Seiten, bei denen die Beschreibung keinen
   * eindeutigen CSS-Klassennamen besitzt.
   */
  const containerText = normalizeText(container.textContent);

  const correctionMatch = containerText.match(
    /Aufgabe\s+\d+\s+wurde\s+überarbeitet\/korrigiert\.?/i,
  );

  if (correctionMatch) {
    return correctionMatch[0];
  }

  return undefined;
}

function getPropertyByPattern(
  properties: string[],
  pattern: RegExp,
): string | undefined {
  return properties.find((property) => pattern.test(property));
}

export function parseFiles(
  document: Document,
  courseId: string,
  pageUrl: string,
): LearningFile[] {
  const files: LearningFile[] = [];
  const seenRefIds = new Set<string>();

  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    'a.il_ContainerItemTitle[href*="ilObjFileGUI"], ' +
      'a.il_ContainerItemTitle[href*="cmd=sendfile"]',
  );

  const pageRefId = getPageRefId(pageUrl);

  const pageIsFolder =
    pageUrl.toLowerCase().includes('ilobjfoldergui') ||
    pageUrl.includes('/go/fold/');

  for (const anchor of anchors) {
    const title = getFileTitle(anchor);

    const url = toAbsoluteUrl(
      anchor.getAttribute('href') ?? '',
      pageUrl,
    );

    const refId = getQueryParameter(url, 'ref_id');

    if (
      !title ||
      !url ||
      !refId ||
      seenRefIds.has(refId)
    ) {
      continue;
    }

    seenRefIds.add(refId);

    const container = findItemContainer(anchor);
    const properties = getItemProperties(container);

    const fileType = getPropertyByPattern(
      properties,
      /^(pdf|zip|docx?|pptx?|xlsx?)$/i,
    );

    const sizeText = getPropertyByPattern(
      properties,
      /\d[\d.,]*\s*(B|KB|MB|GB)\b/i,
    );

    const pageText = getPropertyByPattern(
      properties,
      /Anzahl Seiten:/i,
    );

    const availabilityText = getPropertyByPattern(
      properties,
      /Verfügbarkeit:/i,
    );

    const uploadedText = getPropertyByPattern(
      properties,
      /\d{1,2}\.\s*[A-Za-zÄÖÜäöü]{3}\s*\d{4},\s*\d{1,2}:\d{2}/,
    );

    const pageCountMatch = pageText?.match(
      /Anzahl Seiten:\s*(\d+)/i,
    );

    files.push({
      id: `file:${refId}`,
      courseId,
      folderId: pageIsFolder && pageRefId
        ? `folder:${pageRefId}`
        : undefined,
      iliasRefId: refId,
      title,
      url,
      mimeType: getMimeType(fileType),
      fileSizeBytes: sizeText
        ? parseFileSize(sizeText)
        : undefined,
      pageCount: pageCountMatch
        ? Number(pageCountMatch[1])
        : undefined,
      description: getDescription(container),
      availableAt: availabilityText
        ? parseGermanDate(availabilityText)
        : undefined,
      uploadedAt: uploadedText
        ? parseGermanDate(uploadedText)
        : undefined,
      isNew: false,
      isDownloaded: false,
      isRemoved: false
    });
  }

  return files;
}