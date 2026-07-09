import {
  setDate,
  addMonths,
  subMonths,
  addDays,
  differenceInCalendarDays,
  isBefore,
  format,
} from 'date-fns';

export type BillingCycle = {
  startDate: Date;
  endDate: Date;
  daysTotal: number;
  daysRemaining: number;
  daysPassed: number;
};

// A salary that lands fewer than this many days after the current cycle's
// anchor is treated as part of the SAME cycle (e.g. a second earner paid a
// few days later), not as the start of a new one.
export const MIN_CYCLE_GAP_DAYS = 15;

// The first occurrence of `cycleStartDay` that is at least MIN_CYCLE_GAP_DAYS
// after `after`. Used to project when the NEXT salary is expected, given the
// current cycle's actual salary anchor.
export function expectedNextAnchor(after: Date, cycleStartDay: number): Date {
  const day = Math.min(Math.max(cycleStartDay, 1), 28);
  let candidate = new Date(after.getFullYear(), after.getMonth(), day);
  while (differenceInCalendarDays(candidate, after) < MIN_CYCLE_GAP_DAYS) {
    candidate = addMonths(candidate, 1);
  }
  candidate.setHours(0, 0, 0, 0);
  return candidate;
}

// Build a BillingCycle from explicit start/end dates (start is normalized to
// local midnight, end to end-of-day) with the days* counters relative to
// `today`.
export function buildCycle(
  startDate: Date,
  endDate: Date,
  today: Date,
): BillingCycle {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysTotal =
    Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;

  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  const daysPassed = Math.max(
    1,
    Math.round((todayMidnight.getTime() - start.getTime()) / msPerDay) + 1,
  );
  const daysRemaining = Math.max(
    0,
    Math.round((end.getTime() - todayMidnight.getTime()) / msPerDay) + 1,
  );

  return { startDate: start, endDate: end, daysTotal, daysPassed, daysRemaining };
}

// Projection of the cycle that follows `current`: starts the day after the
// current cycle ends, and is expected to end the day before the following
// configured payday. Used for "next cycle" previews — by definition that
// salary hasn't arrived yet, so the configured day is the best guess.
export function projectNextCycle(
  current: BillingCycle,
  cycleStartDay: number,
  today: Date = new Date(),
): BillingCycle {
  const start = new Date(current.endDate);
  start.setHours(0, 0, 0, 0);
  const nextStart = addDays(start, 1);
  const end = addDays(expectedNextAnchor(nextStart, cycleStartDay), -1);
  return buildCycle(nextStart, end, today);
}

export function getActiveBillingCycle(
  cycleStartDay: number,
  today: Date = new Date(),
): BillingCycle {
  const day = Math.min(Math.max(cycleStartDay, 1), 28);
  const thisMonthAnchor = setDate(today, day);

  const startDate = isBefore(today, thisMonthAnchor)
    ? subMonths(thisMonthAnchor, 1)
    : thisMonthAnchor;

  const nextAnchor = addMonths(startDate, 1);
  const endDate = new Date(
    nextAnchor.getFullYear(),
    nextAnchor.getMonth(),
    nextAnchor.getDate() - 1,
  );

  return buildCycle(startDate, endDate, today);
}

export function formatCycleRange(cycle: BillingCycle): string {
  const start = format(cycle.startDate, 'd.M');
  const end = format(cycle.endDate, 'd.M');
  return `${start} — ${end}`;
}
