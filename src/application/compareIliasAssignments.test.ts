import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  Assignment,
} from '../domain/models';

import {
  compareIliasAssignments,
} from './compareIliasAssignments';

function assignment(
  overrides:
    Partial<Assignment> = {},
): Assignment {
  return {
    id: 'assignment:1',
    courseId: 'course:lds',
    scanSourceId: 'source:lds-main',
    folderId: undefined,
    iliasRefId: '100',
    iliasAssignmentId: '1',
    title: 'Hausübung 1',
    url: 'https://example.test/1',
    status: 'not-started',
    isNew: false,
    isRemoved: false,
    ...overrides,
  };
}

describe('compareIliasAssignments', () => {
  it('erkennt neue Abgaben', () => {
    const result =
      compareIliasAssignments(
        [assignment()],
        [],
      );

    expect(
      result.newAssignments,
    ).toHaveLength(1);

    expect(
      result.newAssignments[0].isNew,
    ).toBe(true);
  });

  it('erkennt geänderte Fristen', () => {
    const result =
      compareIliasAssignments(
        [
          assignment({
            dueAt:
              '2026-08-10T12:00:00.000Z',
          }),
        ],
        [
          assignment({
            dueAt:
              '2026-08-08T12:00:00.000Z',
          }),
        ],
      );

    expect(
      result.changedAssignments,
    ).toHaveLength(1);
  });

  it('erkennt entfernte Abgaben', () => {
    const result =
      compareIliasAssignments(
        [],
        [assignment()],
      );

    expect(
      result.removedAssignments,
    ).toHaveLength(1);

    expect(
      result.removedAssignments[0]
        .isRemoved,
    ).toBe(true);
  });

  it('erkennt geänderte Abgabe-Hinweise', () => {
    const result =
      compareIliasAssignments(
        [
          assignment({
            submissionHint:
              'Als PDF abgeben',
          }),
        ],
        [
          assignment({
            submissionHint:
              'Als ZIP abgeben',
          }),
        ],
      );

    expect(
      result.changedAssignments,
    ).toHaveLength(1);
  });

  it('erzeugt ein submitted-Event bei einer neuen Abgabe', () => {
    const result =
      compareIliasAssignments(
        [
          assignment({
            submittedAt:
              '2026-08-01T10:00:00.000Z',
            status: 'submitted',
          }),
        ],
        [assignment()],
      );

    expect(
      result.submissionEvents,
    ).toEqual([
      {
        assignmentId: 'assignment:1',
        courseId: 'course:lds',
        kind: 'submitted',
        occurredAt:
          '2026-08-01T10:00:00.000Z',
      },
    ]);
  });

  it('erzeugt kein submitted-Event, wenn sich submittedAt nicht ändert', () => {
    const result =
      compareIliasAssignments(
        [
          assignment({
            submittedAt:
              '2026-08-01T10:00:00.000Z',
            dueAt:
              '2026-08-10T12:00:00.000Z',
          }),
        ],
        [
          assignment({
            submittedAt:
              '2026-08-01T10:00:00.000Z',
          }),
        ],
      );

    expect(
      result.submissionEvents,
    ).toHaveLength(0);
  });

  it('erzeugt ein graded-Event bei neuen Punkten', () => {
    const result =
      compareIliasAssignments(
        [
          assignment({
            achievedPoints: 8,
            totalPoints: 10,
            status: 'graded',
          }),
        ],
        [assignment()],
        '2026-08-05T09:00:00.000Z',
      );

    expect(
      result.submissionEvents,
    ).toEqual([
      {
        assignmentId: 'assignment:1',
        courseId: 'course:lds',
        kind: 'graded',
        occurredAt:
          '2026-08-05T09:00:00.000Z',
        achievedPoints: 8,
        totalPoints: 10,
      },
    ]);
  });

  it('erzeugt kein graded-Event, wenn sich die Punkte nicht ändern', () => {
    const result =
      compareIliasAssignments(
        [
          assignment({
            achievedPoints: 8,
            totalPoints: 10,
            dueAt:
              '2026-08-10T12:00:00.000Z',
          }),
        ],
        [
          assignment({
            achievedPoints: 8,
            totalPoints: 10,
          }),
        ],
      );

    expect(
      result.submissionEvents,
    ).toHaveLength(0);
  });

  it('behält die Nutzernotiz bei geänderten Abgaben', () => {
    const result =
      compareIliasAssignments(
        [
          assignment({
            dueAt:
              '2026-08-10T12:00:00.000Z',
          }),
        ],
        [
          assignment({
            dueAt:
              '2026-08-08T12:00:00.000Z',
            userNote:
              'Noch Tutorium abwarten',
          }),
        ],
      );

    expect(
      result.changedAssignments[0]
        .userNote,
    ).toBe('Noch Tutorium abwarten');
  });
});