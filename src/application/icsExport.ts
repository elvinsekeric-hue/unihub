import type { Assignment, Course } from '../domain/models';

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toIcsDate(value: string): string {
  return (
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, '')
      .split('.')[0] + 'Z'
  );
}

/**
 * RFC 5545 verlangt CRLF-Zeilenenden und ein Falten von Zeilen ab
 * 75 Oktetten. Für unsere kurzen Felder reicht ein einfaches
 * Umbrechen nach 74 Zeichen mit einem führenden Leerzeichen auf
 * der Folgezeile.
 */
function foldLine(line: string): string {
  if (line.length <= 74) {
    return line;
  }

  const chunks: string[] = [];
  let rest = line;

  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }

  chunks.push(rest);

  return chunks.join('\r\n');
}

/**
 * Erzeugt eine gültige .ics-Kalenderdatei mit einem Termin pro
 * Abgabe-Frist. Nur Abgaben mit dueAt werden berücksichtigt.
 */
export function buildIcsCalendar(
  assignments: Assignment[],
  courses: Course[],
): string {
  const now = toIcsDate(new Date().toISOString());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UniHub//Assignment Deadlines//DE',
    'CALSCALE:GREGORIAN',
  ];

  for (const assignment of assignments) {
    if (!assignment.dueAt) {
      continue;
    }

    const course = courses.find(
      (entry) => entry.id === assignment.courseId,
    );

    const summary = course
      ? `${course.shortName}: ${assignment.title}`
      : assignment.title;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${assignment.id}@unihub.local`,
      `DTSTAMP:${now}`,
      `DTSTART:${toIcsDate(assignment.dueAt)}`,
      `DTEND:${toIcsDate(assignment.dueAt)}`,
      foldLine(
        `SUMMARY:${escapeIcsText(summary)}`,
      ),
    );

    if (assignment.description) {
      lines.push(
        foldLine(
          `DESCRIPTION:${escapeIcsText(
            assignment.description,
          )}`,
        ),
      );
    }

    lines.push(`URL:${assignment.url}`, 'END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}

export function downloadIcsCalendar(
  assignments: Assignment[],
  courses: Course[],
  filename = 'unihub-abgaben.ics',
): void {
  const content = buildIcsCalendar(
    assignments,
    courses,
  );

  const blob = new Blob([content], {
    type: 'text/calendar;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}
