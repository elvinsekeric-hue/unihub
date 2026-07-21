import type {
  Assignment,
} from '../domain/models';

export interface AssignmentComparison {
  assignmentsToSave: Assignment[];
  newAssignments: Assignment[];
  changedAssignments: Assignment[];
  unchangedAssignments: Assignment[];
  removedAssignments: Assignment[];
}

function hasChanged(
  incoming: Assignment,
  existing: Assignment,
): boolean {
  return (
    incoming.title !== existing.title ||
    incoming.url !== existing.url ||
    incoming.description !==
      existing.description ||
    incoming.startsAt !==
      existing.startsAt ||
    incoming.dueAt !== existing.dueAt ||
    incoming.submittedAt !==
      existing.submittedAt ||
    incoming.status !== existing.status ||
    existing.isRemoved === true
  );
}

export function compareIliasAssignments(
  incomingAssignments: Assignment[],
  existingAssignments: Assignment[],
): AssignmentComparison {
  const existingById = new Map(
    existingAssignments.map(
      (assignment) => [
        assignment.id,
        assignment,
      ],
    ),
  );

  const incomingIds = new Set(
    incomingAssignments.map(
      (assignment) => assignment.id,
    ),
  );

  const assignmentsToSave: Assignment[] = [];
  const newAssignments: Assignment[] = [];
  const changedAssignments: Assignment[] = [];
  const unchangedAssignments: Assignment[] = [];

  for (const incoming of incomingAssignments) {
    const existing =
      existingById.get(incoming.id);

    if (!existing) {
      const newAssignment = {
        ...incoming,
        isNew: true,
        isRemoved: false,
      };

      newAssignments.push(newAssignment);
      assignmentsToSave.push(newAssignment);
      continue;
    }

    if (hasChanged(incoming, existing)) {
      const changedAssignment = {
        ...incoming,
        isNew: existing.isNew,
        isRemoved: false,
      };

      changedAssignments.push(
        changedAssignment,
      );

      assignmentsToSave.push(
        changedAssignment,
      );

      continue;
    }

    const unchangedAssignment = {
      ...existing,
      isRemoved: false,
    };

    unchangedAssignments.push(
      unchangedAssignment,
    );

    assignmentsToSave.push(
      unchangedAssignment,
    );
  }

  const removedAssignments =
    existingAssignments
      .filter(
        (assignment) =>
          !incomingIds.has(assignment.id) &&
          !assignment.isRemoved,
      )
      .map((assignment) => ({
        ...assignment,
        isNew: false,
        isRemoved: true,
      }));

  assignmentsToSave.push(
    ...removedAssignments,
  );

  return {
    assignmentsToSave,
    newAssignments,
    changedAssignments,
    unchangedAssignments,
    removedAssignments,
  };
}