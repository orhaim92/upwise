import { and, eq, sql } from 'drizzle-orm';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { cycleSkips, recurringRules } from '@/lib/db/schema';
import { enumerateOccurrences, hasOccurrenceInWindow } from './frequency';
import type { BillingCycle } from './billing-cycle';

export type CyclePreviewItem = {
  id: string;
  name: string;
  type: 'income' | 'expense';
  // Total projected amount for this rule within the cycle (occurrences ×
  // expectedAmount). Always positive; the `type` field carries the sign.
  amount: number;
  // True when the user has marked this rule skipped for this cycle. Skipped
  // items are still returned (so the UI can show them greyed with an "unskip"
  // affordance) but excluded from the totals.
  skipped: boolean;
};

export type CyclePreview = {
  cycle: BillingCycle;
  items: CyclePreviewItem[];
  totalExpense: number;
  totalIncome: number;
};

// Project the recurring income/expense rules that will fire in a given cycle.
//
// Unlike computeDailyAllowance (which is current-cycle-centric: realized-to-date
// vs remaining, and drops skipped/materialized rows entirely), this is a pure
// forward-looking projection for an arbitrary — typically future — cycle. For a
// future cycle nothing is materialized via bank data yet, so the only
// "materialization" that matters is an explicit user skip. Skipped rows are
// kept in the list (flagged) so the preview UI can offer an un-skip, but they
// don't count toward the totals.
export async function projectCycleRecurring(
  householdId: string,
  cycle: BillingCycle,
): Promise<CyclePreview> {
  const startStr = format(cycle.startDate, 'yyyy-MM-dd');
  const endStr = format(cycle.endDate, 'yyyy-MM-dd');

  const [rules, skips] = await Promise.all([
    db
      .select()
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.householdId, householdId),
          eq(recurringRules.isActive, true),
          eq(recurringRules.detectionStatus, 'confirmed'),
        ),
      ),
    // Skips matched by range (not exact key): cycle starts follow the actual
    // salary landing, so a skip stamped under a projected start date must
    // still apply once the real start shifts.
    db
      .select({ recurringRuleId: cycleSkips.recurringRuleId })
      .from(cycleSkips)
      .where(
        and(
          eq(cycleSkips.householdId, householdId),
          sql`${cycleSkips.cycleStartDate} >= ${startStr}`,
          sql`${cycleSkips.cycleStartDate} <= ${endStr}`,
        ),
      ),
  ]);

  const skippedIds = new Set(skips.map((s) => s.recurringRuleId));

  const items: CyclePreviewItem[] = [];
  let totalExpense = 0;
  let totalIncome = 0;

  for (const r of rules) {
    const occurrenceRule = {
      frequency: r.frequency,
      customIntervalDays: r.customIntervalDays,
      startDate: r.startDate,
      endDate: r.endDate,
      remainingOccurrences: r.remainingOccurrences,
    };

    if (
      !hasOccurrenceInWindow(occurrenceRule, cycle.startDate, cycle.endDate)
    ) {
      continue;
    }

    const occs = enumerateOccurrences(
      occurrenceRule,
      cycle.startDate,
      cycle.endDate,
    );
    const amount = occs.length * Number(r.expectedAmount);
    const skipped = skippedIds.has(r.id);

    items.push({
      id: r.id,
      name: r.name,
      type: r.type,
      amount,
      skipped,
    });

    if (!skipped) {
      if (r.type === 'income') totalIncome += amount;
      else totalExpense += amount;
    }
  }

  // Expenses first (the common case users want to manage), then by descending
  // amount so the biggest commitments surface at the top.
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
    return b.amount - a.amount;
  });

  return { cycle, items, totalExpense, totalIncome };
}
