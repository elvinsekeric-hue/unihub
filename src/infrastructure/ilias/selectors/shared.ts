export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function normalizeText(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function toAbsoluteUrl(href: string, pageUrl: string): string {
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return '';
  }
}

export function getQueryParameter(
  url: string,
  parameter: string,
): string | undefined {
  try {
    return new URL(url).searchParams.get(parameter) ?? undefined;
  } catch {
    return undefined;
  }
}

export function getPageRefId(pageUrl: string): string | undefined {
  return getQueryParameter(pageUrl, 'ref_id');
}

export function findItemContainer(element: Element): Element {
  return (
    element.closest(
      '.ilContainerListItemOuter, .ilCLI, .il_ContainerListItem, li, article',
    ) ?? element
  );
}

export function parseFileSize(value: string): number | undefined {
  const match = normalizeText(value).match(
    /([\d.,]+)\s*(B|KB|MB|GB)\b/i,
  );

  if (!match) {
    return undefined;
  }

  const amount = Number(match[1].replace(',', '.'));

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
  };

  return Math.round(amount * multipliers[match[2].toUpperCase()]);
}

const germanMonths: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mär: 2,
  Apr: 3,
  Mai: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Okt: 9,
  Nov: 10,
  Dez: 11,
};

export function parseGermanDate(value: string): string | undefined {
  const normalized = normalizeText(value);

  const match = normalized.match(
    /(\d{1,2})\.\s*(Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\s*(\d{4})(?:,\s*(\d{1,2}):(\d{2}))?/i,
  );

  if (!match) {
    return undefined;
  }

  const monthName =
    Object.keys(germanMonths).find(
      (month) => month.toLowerCase() === match[2].toLowerCase(),
    ) ?? '';

  const month = germanMonths[monthName];

  if (month === undefined) {
    return undefined;
  }

  const date = new Date(
    Number(match[3]),
    month,
    Number(match[1]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
  );

  return date.toISOString();
}

export function getItemProperties(container: Element): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('.il_ItemProperty'),
  )
    .map((element) => normalizeText(element.textContent))
    .filter(Boolean);
}