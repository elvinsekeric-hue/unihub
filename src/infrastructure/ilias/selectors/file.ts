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
    const title = normalizeText(anchor.textContent);
    const url = toAbsoluteUrl(anchor.getAttribute('href') ?? '', pageUrl);
    const refId = getQueryParameter(url, 'ref_id');

    if (!title || !url || !refId || seenRefIds.has(refId)) {
      continue;
    }

    seenRefIds.add(refId);

    const container = findItemContainer(anchor);
    const properties = getItemProperties(container);

    const fileType = properties.find((property) =>
      /^(pdf|zip|docx?|pptx?|xlsx?)$/i.test(property),
    );

    const sizeText = properties.find((property) =>
      /\d[\d.,]*\s*(B|KB|MB|GB)\b/i.test(property),
    );

    const pageText = properties.find((property) =>
      /Anzahl Seiten:/i.test(property),
    );

    const availabilityText = properties.find((property) =>
      /Verfügbarkeit:/i.test(property),
    );

    const uploadedText = properties.find((property) =>
      /\d{1,2}\.\s*[A-Za-zÄÖÜäöü]{3}\s*\d{4},\s*\d{1,2}:\d{2}/.test(
        property,
      ),
    );

    const description = normalizeText(
      container.querySelector('.il_Description')?.textContent,
    );

    const pageCountMatch = pageText?.match(/Anzahl Seiten:\s*(\d+)/i);

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
      description: description || undefined,
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