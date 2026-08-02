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

function extractHintFromText(
  text: string,
): string | undefined {
  const match = text.match(
    /(?:Abgabebedingungen|Hinweis(?:se)?\s+zur\s+Abgabe|Bitte\s+beachten)\s*[:\-–]?\s*([\s\S]{10,500}?)(?=(?:\.\s+[A-ZÄÖÜ0-9])|$)/i,
  );

  if (!match) {
    return undefined;
  }

  const hint = normalizeText(match[1]);

  return hint.length >= 10 ? hint : undefined;
}

function extractSubmissionHint(
  document: Document,
  pageText: string,
): string | undefined {
  const boxes = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.ilBoxInfo, .ilInfoBox, .alert-info, ' +
        '.il_Alert, .alert-warning',
    ),
  )
    .map((element) =>
      normalizeText(element.textContent),
    )
    .filter(
      (text) => text.length >= 10,
    );

  if (boxes.length > 0) {
    return boxes.join(' ');
  }

  return extractHintFromText(pageText);
}

function toNumber(value: string): number {
  return Number(value.replace(',', '.'));
}

function extractPoints(
  text: string,
): { achieved?: number; total?: number } {
  const normalized = text.replace(/\s+/g, ' ');

  /*
   * „Erreichte Punkte: 8 von 10", „Punkte: 8/10"
   * oder „8 von 10 Punkten".
   */
  const achievedTotal =
    normalized.match(
      /(?:erreichte\s+punkte?|punkte(?:zahl)?)\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*(?:von|\/)\s*(\d+(?:[.,]\d+)?)(?:\s*punkte?)?/i,
    ) ??
    normalized.match(
      /(\d+(?:[.,]\d+)?)\s*(?:von|\/)\s*(\d+(?:[.,]\d+)?)\s*punkten?/i,
    );

  if (achievedTotal) {
    return {
      achieved: toNumber(achievedTotal[1]),
      total: toNumber(achievedTotal[2]),
    };
  }

  /*
   * Nur die maximale Punktzahl bekannt,
   * z. B. „Maximale Punkte: 10". Ohne erreichte
   * Punkte ist die Abgabe noch nicht bewertet.
   */
  const maxPoints = normalized.match(
    /(?:max(?:imale)?\s+punkte?)\s*[:.]?\s*(\d+(?:[.,]\d+)?)/i,
  );

  if (maxPoints) {
    return {
      total: toNumber(maxPoints[1]),
    };
  }

  return {};
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
    /*
     * Die ILIAS-Reiterleiste (Übersicht, Einreichung, Liste der
     * Übungseinheiten, …) trägt dieselbe ass_id wie die Abgabe
     * selbst und matcht dieselben href-Muster. Reiter-Links
     * dürfen die echte Abgabe nie mit ihrem Linktext überschreiben.
     */
    if (anchor.closest('#ilTab')) {
      continue;
    }

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

    /*
     * Zusätzliche Absicherung für Rückverweise auf die
     * Listenansicht (cmd=showOverview) außerhalb der Reiterleiste.
     */
    if (/cmd=showoverview/i.test(url)) {
      continue;
    }

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

    const points = extractPoints(context);

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
      submissionHint:
        extractHintFromText(context),
      achievedPoints: points.achieved,
      totalPoints: points.total,
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

const detailAssignmentId =
  getQueryParameter(
    pageUrl,
    'ass_id',
  );

if (
  detailAssignmentId &&
  !seenIds.has(detailAssignmentId)
) {
  const pageText = normalizeText(
    document.body.textContent,
  );

  const headingCandidates =
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'h1, h2, h3, .ilHeader, ' +
          '.il_HeaderInner, legend',
      ),
    )
      .map((element) =>
        normalizeText(element.textContent),
      )
      .filter(Boolean);

  const detailTitle =
    headingCandidates.find((heading) =>
      /^(Blatt|Aufgabe|Abgabe|Übung|Uebung)\s*\d+/i.test(
        heading,
      ),
    ) ??
    headingCandidates.find((heading) =>
      /^Blatt\s/i.test(heading),
    );

  const submittedAt = findDate(
    pageText,
    'Datum der letzten Abgabe|' +
      'Abgegeben am|' +
      'Eingereicht am',
  );

  const hasFeedback =
    /Bewertung/i.test(pageText) &&
    /Download|annotated/i.test(pageText);

  const points = extractPoints(pageText);

  const hasPoints =
    points.total !== undefined &&
    points.achieved !== undefined;

  assignments.push({
    id:
      `assignment:${detailAssignmentId}`,
    courseId,
    iliasRefId:
      getPageRefId(pageUrl) ??
      detailAssignmentId,
    iliasAssignmentId:
      detailAssignmentId,
    title:
      detailTitle ??
      `Abgabe ${detailAssignmentId}`,
    url: pageUrl,
    submittedAt,
    submissionHint:
      extractSubmissionHint(
        document,
        pageText,
      ),
    achievedPoints: points.achieved,
    totalPoints: points.total,
    status: hasFeedback || hasPoints
      ? 'graded'
      : submittedAt
        ? 'submitted'
        : 'not-started',
    isNew: false,
    isRemoved: false,
  });
}

  return assignments;
}