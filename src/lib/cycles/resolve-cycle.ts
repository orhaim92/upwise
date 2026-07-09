import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurringRules, transactions } from '@/lib/db/schema';
import {
  buildCycle,
  expectedNextAnchor,
  getActiveBillingCycle,
  MIN_CYCLE_GAP_DAYS,
  type BillingCycle,
} from './billing-cycle';

// How far back we look for salary landings when anchoring the cycle. Long
// enough to survive a couple of missed/late salaries; past that we assume
// the income data is stale and fall back to the configured day.
const ANCHOR_LOOKBACK_DAYS = 92;

// A second salary landing this many days (or more) after the current anchor
// starts a new cycle even within the same calendar month — covers a salary
// paid early (e.g. Dec 31 for January). Below this, a same-month landing is
// a second earner / bonus inside the SAME cycle.
const SAME_MONTH_NEW_CYCLE_GAP_DAYS = 25;

type HouseholdCycleConfig = {
  id: string;
  billingCycleStartDay: number;
  autoDetectCycleStart: boolean;
};

// Returns the active billing cycle for a household.
//
// Salary-anchored (the default): the cycle runs salary-to-salary. It starts
// on the day the first salary of the period actually landed, and ends the
// day before the NEXT period's first salary lands. If that next salary is
// late, the current cycle simply stays open until it arrives — the cycle
// never rolls over on the calendar alone. The configured
// `billingCycleStartDay` is only used to PROJECT when the next salary is
// expected (for days-remaining math), and as a hard fallback when no linked
// salary exists at all.
//
// When `autoDetectCycleStart` is off, the household opted into fixed dates:
// this is a thin async wrapper around the sync `getActiveBillingCycle` — no
// DB calls.
export async function resolveActiveBillingCycle(
  household: HouseholdCycleConfig,
  today: Date = new Date(),
): Promise<BillingCycle> {
  if (!household.autoDetectCycleStart) {
    return getActiveBillingCycle(household.billingCycleStartDay, today);
  }

  const incomeDates = await linkedIncomeDates(
    household.id,
    addDays(today, -ANCHOR_LOOKBACK_DAYS),
    today,
  );

  const anchor = latestCycleAnchor(incomeDates);
  if (!anchor) {
    // No salary data in the window (new household, or income rule not yet
    // confirmed) — fall back to the configured day.
    return getActiveBillingCycle(household.billingCycleStartDay, today);
  }

  // The cycle ends the day before the next salary. That salary hasn't
  // landed yet (otherwise IT would be the anchor), so project it from the
  // configured day — and if the projection date has already passed with no
  // salary, keep the cycle open through today instead of rolling over.
  const projectedEnd = addDays(
    expectedNextAnchor(anchor, household.billingCycleStartDay),
    -1,
  );
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  const endDate = projectedEnd < todayMidnight ? todayMidnight : projectedEnd;

  return buildCycle(anchor, endDate, today);
}

// Walk the salary landings oldest-to-newest and keep the last cycle anchor.
// A landing starts a new cycle when it's far enough after the current
// anchor: crossing into a later calendar month with at least
// MIN_CYCLE_GAP_DAYS of distance (a normal month-to-month salary, even if
// it slid a few days), or SAME_MONTH_NEW_CYCLE_GAP_DAYS within the same
// month (a next-month salary paid early). Anything closer joins the current
// cycle (second earner, bonus).
function latestCycleAnchor(sortedDates: Date[]): Date | null {
  let anchor: Date | null = null;
  for (const d of sortedDates) {
    if (!anchor) {
      anchor = d;
      continue;
    }
    const gap = differenceInCalendarDays(d, anchor);
    const laterMonth =
      d.getFullYear() > anchor.getFullYear() ||
      d.getMonth() > anchor.getMonth();
    if (
      (laterMonth && gap >= MIN_CYCLE_GAP_DAYS) ||
      gap >= SAME_MONTH_NEW_CYCLE_GAP_DAYS
    ) {
      anchor = d;
    }
  }
  return anchor;
}

// Distinct landing dates of txs FK-linked to an active confirmed income
// rule, oldest first. Anything else (a refund, a one-off transfer in)
// shouldn't reshape the cycle. The set is small and indexed on
// (household, date).
async function linkedIncomeDates(
  householdId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<Date[]> {
  const startStr = format(windowStart, 'yyyy-MM-dd');
  const endStr = format(windowEnd, 'yyyy-MM-dd');

  const rows = await db
    .selectDistinct({ date: transactions.date })
    .from(transactions)
    .innerJoin(
      recurringRules,
      eq(recurringRules.id, transactions.recurringRuleId),
    )
    .where(
      and(
        eq(transactions.householdId, householdId),
        gt(transactions.amount, '0'),
        eq(recurringRules.type, 'income'),
        eq(recurringRules.isActive, true),
        eq(recurringRules.detectionStatus, 'confirmed'),
        sql`${transactions.date} >= ${startStr}`,
        sql`${transactions.date} <= ${endStr}`,
      ),
    )
    .orderBy(transactions.date);

  // tx.date is stored as a date column (no time/TZ). Treat it as
  // local-midnight so it lines up with the rest of the cycle math, which
  // also runs in local time.
  return rows.map((r) => {
    const [y, m, d] = r.date.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  });
}
