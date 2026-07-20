import type { Assignment } from '../../../domain/models';
import {
  findItemContainer,
  getQueryParameter,
  normalizeText,
  parseGermanDate,
  toAbsoluteUrl,
} from './shared';

function findDeadline(text: string): string | undefined {
  const absoluteDate = text.match(
    /(?:Abgabefrist|Deadline|Fällig(?:keit)?)\s*:?\s*(\d{1,2}\.\s*[A-Za-zÄÖÜäöü]{3}\s*\d{4}(?:,\s*\d{1,2}:\d{2})?)/i,
  );

  return absoluteDate
    ? parseGermanDate(absoluteDate[1])
    : undefined;
}

export function parseAssignments(
  document: Document,
  courseId: string,
  pageUrl: string,
): Assignment[] {
  const assignments: Assignment[] = [];
  const seenIds = new Set<string>();

  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="ilexercisehandlergui"], ' +
      'a[href*="ilAssignmentPresentationGUI"], ' +
      'a[href*="ass_id="]',
  );

  for (const anchor of anchors) {
    const title = normalizeText(anchor.textContent);
    const url = toAbsoluteUrl(anchor.getAttribute('href') ?? '', pageUrl);

    if (!title || !url) {
      continue;
    }

    const refId = getQueryParameter(url, 'ref_id');
    const assignmentId = getQueryParameter(url, 'ass_id');
    const uniqueId = assignmentId ?? refId ?? url;

    if (seenIds.has(uniqueId)) {
      continue;
    }

    seenIds.add(uniqueId);

    const container = findItemContainer(anchor);
    const context = normalizeText(container.textContent);

    assignments.push({
      id: `assignment:${uniqueId}`,
      courseId,
      iliasRefId: refId ?? uniqueId,
      iliasAssignmentId: assignmentId,
      title,
      url,
      description: context !== title ? context : undefined,
      dueAt: findDeadline(context),
      status: 'not-started',
      isNew: false,
    });
  }

  return assignments;
}