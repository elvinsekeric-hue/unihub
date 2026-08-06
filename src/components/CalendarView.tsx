import { useMemo, useState } from 'react';

import type { Assignment, Course } from '../domain/models';
import { buildMonthGrid } from '../application/calendar';

const WEEKDAY_LABELS = [
  'Mo',
  'Di',
  'Mi',
  'Do',
  'Fr',
  'Sa',
  'So',
];

const MONTH_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
});

export interface CalendarViewProps {
  assignments: Assignment[];
  courses: Course[];
  onOpen: (url: string) => void;
}

export function CalendarView({
  assignments,
  courses,
  onOpen,
}: CalendarViewProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [selectedDate, setSelectedDate] = useState<
    string | undefined
  >();

  const days = useMemo(
    () =>
      buildMonthGrid(
        assignments,
        cursor.year,
        cursor.month,
      ),
    [assignments, cursor],
  );

  const selectedDay = days.find(
    (day) => day.date === selectedDate,
  );

  function courseColor(courseId: string): string {
    return (
      courses.find((entry) => entry.id === courseId)
        ?.color ?? '#315a82'
    );
  }

  function goToPreviousMonth(): void {
    setCursor((current) => {
      const month = current.month - 1;
      return month < 0
        ? { year: current.year - 1, month: 11 }
        : { year: current.year, month };
    });
    setSelectedDate(undefined);
  }

  function goToNextMonth(): void {
    setCursor((current) => {
      const month = current.month + 1;
      return month > 11
        ? { year: current.year + 1, month: 0 }
        : { year: current.year, month };
    });
    setSelectedDate(undefined);
  }

  return (
    <div className="calendar-view">
      <div className="calendar-toolbar">
        <button
          className="secondary-button"
          onClick={goToPreviousMonth}
          aria-label="Vorheriger Monat"
        >
          ‹
        </button>

        <strong>
          {MONTH_FORMATTER.format(
            new Date(cursor.year, cursor.month, 1),
          )}
        </strong>

        <button
          className="secondary-button"
          onClick={goToNextMonth}
          aria-label="Nächster Monat"
        >
          ›
        </button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {days.map((day) => (
          <button
            key={day.date}
            className={
              'calendar-day' +
              (day.inCurrentMonth
                ? ''
                : ' calendar-day-outside') +
              (day.isToday
                ? ' calendar-day-today'
                : '') +
              (day.date === selectedDate
                ? ' calendar-day-selected'
                : '')
            }
            onClick={() =>
              setSelectedDate(
                day.date === selectedDate
                  ? undefined
                  : day.date,
              )
            }
          >
            <span className="calendar-day-number">
              {Number(day.date.slice(-2))}
            </span>

            {day.assignments.length > 0 && (
              <span className="calendar-day-dots">
                {day.assignments
                  .slice(0, 4)
                  .map((assignment) => (
                    <span
                      key={assignment.id}
                      className="calendar-dot"
                      style={{
                        background: courseColor(
                          assignment.courseId,
                        ),
                      }}
                    />
                  ))}
              </span>
            )}
          </button>
        ))}
      </div>

      {selectedDay && selectedDay.assignments.length > 0 && (
        <div className="calendar-selected-day">
          <strong>
            Fällig am {selectedDay.date.split('-').reverse().join('.')}
          </strong>

          {selectedDay.assignments.map((assignment) => (
            <button
              key={assignment.id}
              className="submission-file"
              onClick={() => onOpen(assignment.url)}
            >
              <span
                className="course-badge"
                style={{
                  background: courseColor(
                    assignment.courseId,
                  ),
                }}
              >
                {
                  courses.find(
                    (entry) =>
                      entry.id === assignment.courseId,
                  )?.shortName ?? '?'
                }
              </span>
              {assignment.title}
              <span>↗</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
