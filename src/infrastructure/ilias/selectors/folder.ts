import type { Folder } from '../../../domain/models';
import {
  getQueryParameter,
  normalizeText,
  toAbsoluteUrl,
} from './shared';

export function parseFolders(
  document: Document,
  courseId: string,
  pageUrl: string,
): Folder[] {
  const folders: Folder[] = [];
  const seenRefIds = new Set<string>();

  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    'a.il_ContainerItemTitle[href*="/go/fold/"], ' +
      'a.il_ContainerItemTitle[href*="ilObjFolderGUI"]',
  );

  for (const anchor of anchors) {
    const title = normalizeText(anchor.textContent);
    const url = toAbsoluteUrl(anchor.getAttribute('href') ?? '', pageUrl);

    if (!title || !url) {
      continue;
    }

    const pathMatch = new URL(url).pathname.match(/\/go\/fold\/(\d+)/);
    const refId =
      pathMatch?.[1] ?? getQueryParameter(url, 'ref_id');

    if (!refId || seenRefIds.has(refId)) {
      continue;
    }

    seenRefIds.add(refId);

    folders.push({
      id: `folder:${refId}`,
      courseId,
      iliasRefId: refId,
      title,
      url,
      path: [title],
    });
  }

  return folders;
}