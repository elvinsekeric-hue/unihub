import type { Assignment } from '../domain/models';

export interface CalendarDay {
  /** yyyy-mm-dd, lokale Zeitzone */
  date: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  assignments: Assignment[];
}

function toLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(
    2,
    '0',
  );
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Gruppiert Abgaben nach ihrem lokalen Fälligkeitsdatum
 * (unabhängig von der Uhrzeit).
 */
export function groupAssignmentsByDueDate(
  assignments: Assignment[],
): Map<string, Assignment[]> {
  const result = new Map<string, Assignment[]>();

  for (const assignment of assignments) {
    if (!assignment.dueAt) {
      continue;
    }

    const key = toLocalDateKey(
      new Date(assignment.dueAt),
    );

    const entries = result.get(key) ?? [];
    entries.push(assignment);
    result.set(key, entries);
  }

  return result;
}

/**
 * Monatsraster (Montag als Wochenstart) mit genau 42 Tagen (6
 * Wochen), inklusive der Rand-Tage aus dem Vor-/Folgemonat, damit
 * die Wochenzeilen immer vollständig sind.
 */
export function buildMonthGrid(
  assignments: Assignment[],
  year: number,
  month: number,
  today: Date = new Date(),
): CalendarDay[] {
  const byDate = groupAssignmentsByDueDate(assignments);

  const firstOfMonth = new Date(year, month, 1);
  const mondayIndex = (firstOfMonth.getDay() + 6) % 7;

  const gridStart = new Date(year, month, 1);
  gridStart.setDate(gridStart.getDate() - mondayIndex);

  const todayKey = toLocalDateKey(today);

  const days: CalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    const key = toLocalDateKey(date);

    days.push({
      date: key,
      inCurrentMonth: date.getMonth() === month,
      isToday: key === todayKey,
      assignments: byDate.get(key) ?? [],
    });
  }

  return days;
}
