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
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  return normalized ? mimeTypes[normalized] : undefined;
}

function getFileTitle(anchor: HTMLAnchorElement): string {
  const directTitle = normalizeText(anchor.textContent);

  if (directTitle) {
    return directTitle;
  }

  const heading = anchor.closest('h3.il_ContainerItemTitle');

  if (!heading) {
    return '';
  }

  const clone = heading.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll(
      'a, button, span, .glyph, [aria-label="Vorschau"]',
    )
    .forEach((element) => element.remove());

  return normalizeText(clone.textContent);
}

function getDescription(container: Element): string | undefined {
  const explicitDescription = normalizeText(
    container.querySelector('.il_Description')?.textContent,
  );

  if (explicitDescription) {
    return explicitDescription;
  }

  const titleHeading = container.querySelector(
    'h3.il_ContainerItemTitle',
  );

  const titleContainer =
    titleHeading?.closest('.il_ContainerItemTitle') ??
    titleHeading?.parentElement;

  const possibleDescription = normalizeText(
    titleContainer?.nextElementSibling?.textContent,
  );

  return possibleDescription || undefined;
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

    if (!title || !url || !refId || seenRefIds.has(refId)) {
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
      folderId:
        pageIsFolder && pageRefId
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
    });
  }

  return files;
}