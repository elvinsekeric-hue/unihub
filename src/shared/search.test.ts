import { describe, expect, it } from 'vitest';

import { searchInMemory } from './search';

const entries = [
  {
    type: 'file' as const,
    id: 'file:1',
    courseId: 'course:lds',
    title: 'Tutoriumsblatt13',
    url: 'https://example.test/1',
  },
  {
    type: 'assignment' as const,
    id: 'assignment:1',
    courseId: 'course:lds',
    title: 'Abgabe Blatt 13',
    url: 'https://example.test/2',
    description: 'Bitte als PDF abgeben',
  },
];

describe('searchInMemory', () => {
  it('liefert nichts für eine leere Eingabe', () => {
    expect(searchInMemory(entries, '  ')).toHaveLength(0);
  });

  it('findet Treffer im Titel, unabhängig von Groß-/Kleinschreibung', () => {
    const result = searchInMemory(entries, 'tutorium');

    expect(result.map((entry) => entry.id)).toEqual([
      'file:1',
    ]);
  });

  it('findet Treffer in der Beschreibung', () => {
    const result = searchInMemory(entries, 'PDF');

    expect(result.map((entry) => entry.id)).toEqual([
      'assignment:1',
    ]);
  });

  it('begrenzt die Trefferzahl', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      type: 'file' as const,
      id: `file:${index}`,
      courseId: 'course:lds',
      title: 'Blatt',
      url: 'https://example.test',
    }));

    expect(searchInMemory(many, 'Blatt')).toHaveLength(20);
  });
});
