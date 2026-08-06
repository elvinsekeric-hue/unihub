import type { Assignment } from '../domain/models';

const WEEKDAY_NAMES = [
  'sonntags',
  'montags',
  'dienstags',
  'mittwochs',
  'donnerstags',
  'freitags',
  'samstags',
];

const MIN_SAMPLE_SIZE = 3;
const MIN_SHARE = 0.6;

export interface RecurringPattern {
  weekdayLabel: string;
  share: number;
  sampleSize: number;
}

/**
 * Erkennt, ob eine Kursreihe (z. B. wöchentliche Übungsblätter)
 * überwiegend an einem bestimmten Wochentag fällig ist. Braucht
 * mindestens 3 Abgaben mit Frist und mindestens 60 % Übereinstimmung
 * auf einen Wochentag, sonst gilt kein verlässliches Muster.
 */
export function detectRecurringWeekday(
  assignments: Assignment[],
): RecurringPattern | undefined {
  const dueDates = assignments
    .map((assignment) => assignment.dueAt)
    .filter((value): value is string => Boolean(value));

  if (dueDates.length < MIN_SAMPLE_SIZE) {
    return undefined;
  }

  const counts = new Array(7).fill(0) as number[];

  for (const dueAt of dueDates) {
    counts[new Date(dueAt).getDay()] += 1;
  }

  const maxCount = Math.max(...counts);
  const weekday = counts.indexOf(maxCount);
  const share = maxCount / dueDates.length;

  if (share < MIN_SHARE) {
    return undefined;
  }

  return {
    weekdayLabel: WEEKDAY_NAMES[weekday],
    share,
    sampleSize: dueDates.length,
  };
}
