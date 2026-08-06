import type {
  Assignment,
  Course,
  SubmissionEvent,
} from '../domain/models';
import { getDeadlineHint } from '../shared/deadlines';
import { relativeDate } from '../shared/dates';
import { formatPointsValue } from '../shared/points';

function formatSubmissionEvent(
  event: SubmissionEvent,
): string {
  const date = new Date(
    event.occurredAt,
  ).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (event.kind === 'graded') {
    return (
      `${date} · Bewertet: ` +
      `${formatPointsValue(
        event.achievedPoints ?? 0,
      )} / ${formatPointsValue(
        event.totalPoints ?? 0,
      )} Punkte`
    );
  }

  return `${date} · Abgabe eingereicht`;
}

const statusLabels: Record<
  Assignment['status'],
  string
> = {
  'not-started': 'Nicht begonnen',
  'in-progress': 'In Bearbeitung',
  submitted: 'Abgegeben',
  graded: 'Bewertet',
};

export interface AssignmentCardProps {
  assignment: Assignment;
  course: Course | undefined;
  noteDraft: string | undefined;
  onNoteChange: (value: string) => void;
  onSaveNote: () => void;
  isHistoryExpanded: boolean;
  historyEvents: SubmissionEvent[] | undefined;
  onToggleHistory: () => void;
  onOpen: (url: string) => void;
  compact?: boolean;
}

export function AssignmentCard({
  assignment,
  course,
  noteDraft,
  onNoteChange,
  onSaveNote,
  isHistoryExpanded,
  historyEvents,
  onToggleHistory,
  onOpen,
  compact = false,
}: AssignmentCardProps) {
  const deadlineHint = getDeadlineHint(assignment);

  return (
    <article
      className={
        'assignment-row' +
        (compact ? ' assignment-row-compact' : '')
      }
    >
      <span
        className="course-badge"
        style={{
          background: course?.color ?? '#315a82',
        }}
      >
        {course?.shortName ?? '?'}
      </span>

      <span className="assignment-body">
        <button
          className="assignment-main-link"
          onClick={() => onOpen(assignment.url)}
        >
          <span className="assignment-title">
            <strong>{assignment.title}</strong>

            {assignment.isNew && <em>NEU</em>}
          </span>
        </button>

        {assignment.description && (
          <small>{assignment.description}</small>
        )}

        <span className="assignment-meta">
          <span>
            Status:{' '}
            {statusLabels[assignment.status]}
          </span>

          {assignment.totalPoints !== undefined && (
            <span className="points-badge">
              Punkte:{' '}
              {assignment.achievedPoints !== undefined
                ? formatPointsValue(
                    assignment.achievedPoints,
                  )
                : '0'}{' '}
              / {formatPointsValue(assignment.totalPoints)}
            </span>
          )}

          {assignment.submittedAt && (
            <span>
              Letzte Abgabe:{' '}
              {new Date(
                assignment.submittedAt,
              ).toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}

          {assignment.dueAt && (
            <span className="urgent">
              Fällig {relativeDate(assignment.dueAt)}
            </span>
          )}
        </span>

        <div className="assignment-hint">
          <strong>Abgabe-Hinweis</strong>

          {deadlineHint && (
            <span
              className={`deadline-hint ${deadlineHint.tone}`}
            >
              {deadlineHint.text}
            </span>
          )}

          {assignment.submissionHint && (
            <blockquote className="ilias-hint">
              {assignment.submissionHint}
            </blockquote>
          )}

          <textarea
            className="note-input"
            placeholder="Eigene Notiz …"
            value={
              noteDraft ?? assignment.userNote ?? ''
            }
            onChange={(event) =>
              onNoteChange(event.target.value)
            }
          />

          <button
            className="note-save"
            onClick={onSaveNote}
          >
            Notiz speichern
          </button>
        </div>

        {(assignment.submissionFiles?.length ?? 0) >
          0 && (
          <div className="submission-section">
            <strong>Meine Abgabe</strong>

            {assignment.submissionFiles?.map((file) => (
              <button
                key={file.id}
                className="submission-file"
                onClick={() => onOpen(file.url)}
              >
                📄 {file.title}
                <span>↗</span>
              </button>
            ))}
          </div>
        )}

        {(assignment.feedbackFiles?.length ?? 0) >
          0 && (
          <div className="submission-section">
            <strong>Bewertung</strong>

            {assignment.feedbackFiles?.map((file) => (
              <button
                key={file.id}
                className="submission-file"
                onClick={() => onOpen(file.url)}
              >
                📝 {file.title}
                <span>Download ↗</span>
              </button>
            ))}
          </div>
        )}

        <div className="submission-section">
          <button
            className="secondary-button"
            onClick={onToggleHistory}
          >
            {isHistoryExpanded
              ? 'Verlauf ausblenden'
              : 'Verlauf anzeigen'}
          </button>

          {isHistoryExpanded && (
            <ul className="submission-history">
              {(historyEvents ?? []).map(
                (event, index) => (
                  <li key={`${assignment.id}-${index}`}>
                    {formatSubmissionEvent(event)}
                  </li>
                ),
              )}

              {historyEvents?.length === 0 && (
                <li>
                  Noch kein Verlauf aufgezeichnet.
                </li>
              )}
            </ul>
          )}
        </div>
      </span>

      <button
        className="assignment-open"
        onClick={() => onOpen(assignment.url)}
        aria-label="Abgabe in ILIAS öffnen"
      >
        ↗
      </button>
    </article>
  );
}
