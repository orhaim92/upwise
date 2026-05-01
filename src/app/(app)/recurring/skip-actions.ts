'use server';

import { and, eq } from 'drizzle-orm';
import { format } from 'date-fns';
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

const skipSchema = z.object({
  ruleId: z.string().uuid(),
  note: z.string().max(200).optional(),
});

const unskipSchema = z.object({
  ruleId: z.string().uuid(),
});

async function getActiveCycleStartStr(householdId: string): Promise<string> {
  const [hh] = await db
    .select({ billingCycleStartDay: households.billingCycleStartDay })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  const cycle = getActiveBillingCycle(hh.billingCycleStartDay);
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

  const cycleStartStr = await getActiveCycleStartStr(householdId);

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
  const cycleStartStr = await getActiveCycleStartStr(householdId);

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
