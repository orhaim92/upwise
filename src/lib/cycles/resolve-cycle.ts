import { addDays } from 'date-fns';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurringRules, transactions } from '@/lib/db/schema';
import {
  getActiveBillingCycle,
  type BillingCycle,
} from './billing-cycle';

// Auto-detected cycles let payday slide ±10 days off the configured anchor.
// Past that, we trust the user's configured day — a tx that lands 3 weeks
// off is almost certainly not the salary that should anchor the cycle.
const ANCHOR_WINDOW_DAYS = 10;

type HouseholdCycleConfig = {
  id: string;
  billingCycleStartDay: number;
  autoDetectCycleStart: boolean;
};

// Returns the active billing cycle for a household.
//
// When `autoDetectCycleStart` is off this is a thin async wrapper around the
// existing sync `getActiveBillingCycle` — no DB calls.
//
// When on, the cycle is anchored to the actual landing date of the earliest
// linked income tx around the configured day. A late/early salary slides
// the cycle with it so the salary always lands inside the same cycle as the
// month's expenses, instead of straddling the boundary.
export async function resolveActiveBillingCycle(
  household: HouseholdCycleConfig,
  today: Date = new Date(),
): Promise<BillingCycle> {
  if (!household.autoDetectCycleStart) {
    return getActiveBillingCycle(household.billingCycleStartDay, today);
  }

  const naive = getActiveBillingCycle(household.billingCycleStartDay, today);

  // Two probes: one around the cycle's natural start, one around the day
  // AFTER its natural end (= next cycle's start). Each picks the earliest
  // linked income tx in its ±10d window. End of THIS cycle = (next
  // cycle's start) - 1 day.
  const [thisStart, nextStart] = await Promise.all([
    earliestIncomeTxInWindow(
      household.id,
      addDays(naive.startDate, -ANCHOR_WINDOW_DAYS),
      addDays(naive.startDate, ANCHOR_WINDOW_DAYS),
    ),
    earliestIncomeTxInWindow(
      household.id,
      addDays(naive.endDate, 1 - ANCHOR_WINDOW_DAYS),
      addDays(naive.endDate, 1 + ANCHOR_WINDOW_DAYS),
    ),
  ]);

  const startDate = thisStart ?? naive.startDate;
  const endDate = nextStart
    ? endOfDay(addDays(nextStart, -1))
    : naive.endDate;

  return buildCycle(startDate, endDate, today);
}

async function earliestIncomeTxInWindow(
  householdId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<Date | null> {
  const startStr = windowStart.toISOString().slice(0, 10);
  const endStr = windowEnd.toISOString().slice(0, 10);

  // Restricted to txs FK-linked to an active confirmed income rule —
  // anything else (a refund, a one-off transfer in) shouldn't reshape the
  // cycle. The set is small and indexed on (household, date).
  const [row] = await db
    .select({
      date: sql<string>`MIN(${transactions.date})`,
    })
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
    );

  if (!row?.date) return null;
  // tx.date is stored as a date column (no time/TZ). Treat it as
  // local-midnight so it lines up with the rest of the cycle math, which
  // also runs in local time.
  const [y, m, d] = row.date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function buildCycle(startDate: Date, endDate: Date, today: Date): BillingCycle {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = endOfDay(endDate);

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
