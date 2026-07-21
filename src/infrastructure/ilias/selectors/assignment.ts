import type { Assignment } from '../../../domain/models';
import {
  findItemContainer,
  getPageRefId,
  getQueryParameter,
  normalizeText,
  parseGermanDate,
  toAbsoluteUrl,
} from './shared';

function findDate(
  text: string,
  labels: string,
): string | undefined {
  const match = text.match(
    new RegExp(
      `(?:${labels})\\s*:?\\s*` +
        `(\\d{1,2}\\.\\s*` +
        `[A-Za-zÄÖÜäöü]{3}\\s*` +
        `\\d{4}` +
        `(?:,\\s*\\d{1,2}:\\d{2})?)`,
      'i',
    ),
  );

  return match
    ? parseGermanDate(match[1])
    : undefined;
}

function resolveStatus(
  context: string,
): Assignment['status'] {
  if (
    /bewertet|benotet|note\s*:|punkte\s*:/i.test(
      context,
    )
  ) {
    return 'graded';
  }

  if (
    /abgegeben|eingereicht|abgabe erfolgt|submission received/i.test(
      context,
    )
  ) {
    return 'submitted';
  }

  if (
    /in bearbeitung|bearbeitung begonnen|entwurf/i.test(
      context,
    )
  ) {
    return 'in-progress';
  }

  return 'not-started';
}

export function parseAssignments(
  document: Document,
  courseId: string,
  pageUrl: string,
): Assignment[] {
  const assignments: Assignment[] = [];
  const seenIds = new Set<string>();

  const anchors =
    document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="ilexercisehandlergui"], ' +
        'a[href*="ilAssignmentPresentationGUI"], ' +
        'a[href*="ass_id="]',
    );

  const pageRefId = getPageRefId(pageUrl);

  const pageIsFolder =
    pageUrl
      .toLocaleLowerCase('de-DE')
      .includes('ilobjfoldergui') ||
    pageUrl.includes('/go/fold/');

  for (const anchor of anchors) {
    const title = normalizeText(
      anchor.textContent,
    );
    if (
  title.toLocaleLowerCase("de-DE") === "abgabeordner"
) {
  continue;
}

    const url = toAbsoluteUrl(
      anchor.getAttribute('href') ?? '',
      pageUrl,
    );

    if (!title || !url) {
      continue;
    }

    const refId =
      getQueryParameter(url, 'ref_id');

    const assignmentId =
      getQueryParameter(url, 'ass_id');

    const uniqueId =
      assignmentId ?? refId ?? url;

if (!assignmentId) {
  continue;
}

    if (seenIds.has(uniqueId)) {
      continue;
    }

    seenIds.add(uniqueId);

    const container =
      findItemContainer(anchor);

    const context = normalizeText(
      container.textContent,
    );

    assignments.push({
      id: `assignment:${uniqueId}`,
      courseId,
      folderId:
        pageIsFolder && pageRefId
          ? `folder:${pageRefId}`
          : undefined,
      iliasRefId: refId ?? uniqueId,
      iliasAssignmentId: assignmentId,
      title,
      url,
      description:
        context !== title
          ? context
          : undefined,
      startsAt: findDate(
        context,
        'Beginn|Start|Freigabe|Verfügbar ab',
      ),
      dueAt: findDate(
        context,
        'Abgabefrist|Deadline|Fällig(?:keit)?|Ende',
      ),
      submittedAt: findDate(
        context,
        'Abgegeben am|Eingereicht am',
      ),
      status: resolveStatus(context),
      isNew: false,
      isRemoved: false,
    });
  }

  return assignments;
}