import { setDate, addMonths, subMonths, isBefore, format } from 'date-fns';

export type BillingCycle = {
  startDate: Date;
  endDate: Date;
  daysTotal: number;
  daysRemaining: number;
  daysPassed: number;
};

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
    23,
    59,
    59,
    999,
  );

  startDate.setHours(0, 0, 0, 0);

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysTotal =
    Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;

  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);

  const daysPassed = Math.max(
    1,
    Math.round((todayMidnight.getTime() - startDate.getTime()) / msPerDay) + 1,
  );

  const daysRemaining = Math.max(
    0,
    Math.round((endDate.getTime() - todayMidnight.getTime()) / msPerDay) + 1,
  );

  return { startDate, endDate, daysTotal, daysPassed, daysRemaining };
}

export function formatCycleRange(cycle: BillingCycle): string {
  const start = format(cycle.startDate, 'd.M');
  const end = format(cycle.endDate, 'd.M');
  return `${start} — ${end}`;
}
