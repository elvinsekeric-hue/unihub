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
});