'use server';

import { and, eq } from 'drizzle-orm';
import { addMonths, format } from 'date-fns';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import {
  cycleSkips,
  households,
  recurringRules,
} from '@/lib/db/schema';
import { getUserHouseholdId } from '@/lib/auth/household';
import { getActiveBillingCycle } from '@/lib/cycles/billing-cycle';

// cycleOffset: 0 = current cycle (default, keeps existing dashboard buttons
// working unchanged), 1 = next cycle, etc. Bounded so a malformed value can't
// stamp a skip on an absurdly distant cycle.
const skipSchema = z.object({
  ruleId: z.string().uuid(),
  note: z.string().max(200).optional(),
  cycleOffset: z.number().int().min(0).max(12).optional(),
});

const unskipSchema = z.object({
  ruleId: z.string().uuid(),
  cycleOffset: z.number().int().min(0).max(12).optional(),
});

// Resolve the start date (yyyy-MM-dd) of the cycle `offset` cycles ahead of the
// current one. Cycles are monthly and day-anchored, so advancing N months from
// today lands inside the cycle N steps forward. Future cycles intentionally use
// the naive day-anchored cycle (no salary auto-detect — that income hasn't
// arrived yet).
async function getCycleStartStr(
  householdId: string,
  offset: number,
): Promise<string> {
  const [hh] = await db
    .select({ billingCycleStartDay: households.billingCycleStartDay })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  const anchor = offset === 0 ? new Date() : addMonths(new Date(), offset);
  const cycle = getActiveBillingCycle(hh.billingCycleStartDay, anchor);
  return format(cycle.startDate, 'yyyy-MM-dd');
}

export async function skipRuleForCycle(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [rule] = await db
    .select({ householdId: recurringRules.householdId })
    .from(recurringRules)
    .where(eq(recurringRules.id, parsed.data.ruleId))
    .limit(1);
  if (!rule || rule.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  const cycleStartStr = await getCycleStartStr(
    householdId,
    parsed.data.cycleOffset ?? 0,
  );

  await db
    .insert(cycleSkips)
    .values({
      householdId,
      recurringRuleId: parsed.data.ruleId,
      cycleStartDate: cycleStartStr,
      note: parsed.data.note ?? null,
    })
    .onConflictDoNothing();

  revalidatePath('/dashboard');
  revalidatePath('/recurring');
  return { ok: true };
}

export async function unskipRuleForCycle(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = unskipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);
  const cycleStartStr = await getCycleStartStr(
    householdId,
    parsed.data.cycleOffset ?? 0,
  );

  await db
    .delete(cycleSkips)
    .where(
      and(
        eq(cycleSkips.householdId, householdId),
        eq(cycleSkips.recurringRuleId, parsed.data.ruleId),
        eq(cycleSkips.cycleStartDate, cycleStartStr),
      ),
    );

  revalidatePath('/dashboard');
  revalidatePath('/recurring');
  return { ok: true };
}

// Rule ids the user has already marked skipped for the NEXT cycle (offset 1).
// Used by the recurring page to render the per-rule toggle in the right state.
export async function getNextCycleSkippedRuleIds(): Promise<string[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const householdId = await getUserHouseholdId(session.user.id);
  const cycleStartStr = await getCycleStartStr(householdId, 1);

  const rows = await db
    .select({ recurringRuleId: cycleSkips.recurringRuleId })
    .from(cycleSkips)
    .where(
      and(
        eq(cycleSkips.householdId, householdId),
        eq(cycleSkips.cycleStartDate, cycleStartStr),
      ),
    );

  return rows.map((r) => r.recurringRuleId);
}
