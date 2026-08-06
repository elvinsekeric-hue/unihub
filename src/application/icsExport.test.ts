import { describe, expect, it } from 'vitest';

import type { Assignment, Course } from '../domain/models';
import { buildIcsCalendar } from './icsExport';

const course: Course = {
  id: 'course:lds',
  iliasRefId: '1',
  title: 'Logik und Diskrete Strukturen',
  shortName: 'LDS',
  semesterId: 'semester:ss26',
  color: '#315a82',
  iliasUrl: 'https://example.test',
};

function assignment(
  overrides: Partial<Assignment>,
): Assignment {
  return {
    id: 'assignment:1',
    courseId: 'course:lds',
    iliasRefId: '1',
    title: 'Blatt 1',
    url: 'https://example.test/1',
    status: 'not-started',
    isNew: false,
    ...overrides,
  };
}

describe('buildIcsCalendar', () => {
  it('erzeugt ein gültiges VCALENDAR-Gerüst', () => {
    const ics = buildIcsCalendar([], []);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('überspringt Abgaben ohne Frist', () => {
    const ics = buildIcsCalendar(
      [assignment({ dueAt: undefined })],
      [course],
    );

    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('erzeugt einen Termin mit Kurskürzel im Titel', () => {
    const ics = buildIcsCalendar(
      [
        assignment({
          dueAt: '2026-08-10T15:30:00.000Z',
        }),
      ],
      [course],
    );

    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:LDS: Blatt 1');
    expect(ics).toContain('DTSTART:20260810T153000Z');
    expect(ics).toContain(
      'UID:assignment:1@unihub.local',
    );
    expect(ics).toContain('END:VEVENT');
  });

  it('escaped Kommas und Semikolons in der Beschreibung', () => {
    const ics = buildIcsCalendar(
      [
        assignment({
          dueAt: '2026-08-10T15:30:00.000Z',
          description: 'Bitte als PDF, nicht als ZIP; danke',
        }),
      ],
      [course],
    );

    expect(ics).toContain(
      'Bitte als PDF\\, nicht als ZIP\\; danke',
    );
  });
});
