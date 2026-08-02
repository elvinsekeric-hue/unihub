import type { SubmissionEvent } from '../../domain/models';
import { getDatabase } from './database';

export interface StoredSubmissionEvent extends SubmissionEvent {
  id: number;
}

interface SubmissionEventRow {
  id: number;
  assignment_id: string;
  course_id: string;
  kind: SubmissionEvent['kind'];
  occurred_at: string;
  achieved_points: number | null;
  total_points: number | null;
}

function mapRow(row: SubmissionEventRow): StoredSubmissionEvent {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    courseId: row.course_id,
    kind: row.kind,
    occurredAt: row.occurred_at,
    achievedPoints: row.achieved_points ?? undefined,
    totalPoints: row.total_points ?? undefined,
  };
}

export async function saveSubmissionEvents(
  events: SubmissionEvent[],
): Promise<void> {
  const database = await getDatabase();

  for (const event of events) {
    await database.execute(
      `
        INSERT INTO submission_events (
          assignment_id,
          course_id,
          kind,
          occurred_at,
          achieved_points,
          total_points
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        event.assignmentId,
        event.courseId,
        event.kind,
        event.occurredAt,
        event.achievedPoints ?? null,
        event.totalPoints ?? null,
      ],
    );
  }
}

export async function loadSubmissionEvents(
  assignmentId?: string,
): Promise<StoredSubmissionEvent[]> {
  const database = await getDatabase();

  const rows = assignmentId
    ? await database.select<SubmissionEventRow[]>(
        `
          SELECT *
          FROM submission_events
          WHERE assignment_id = $1
          ORDER BY occurred_at DESC, id DESC
        `,
        [assignmentId],
      )
    : await database.select<SubmissionEventRow[]>(
        `
          SELECT *
          FROM submission_events
          ORDER BY occurred_at DESC, id DESC
        `,
      );

  return rows.map(mapRow);
}
