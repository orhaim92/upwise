'use server';

import { eq } from 'drizzle-orm';
import { format } from 'date-fns';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { households, manualCycleItems } from '@/lib/db/schema';
import { getUserHouseholdId } from '@/lib/auth/household';
import { getActiveBillingCycle } from '@/lib/cycles/billing-cycle';

const addItemSchema = z.object({
  type: z.enum(['income', 'expense']),
  name: z.string().min(1).max(100),
  amount: z.coerce.number().positive(),
  note: z.string().max(200).optional(),
});

export async function addManualItem(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = addItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    };
  }

  const householdId = await getUserHouseholdId(session.user.id);

  const [hh] = await db
    .select({ billingCycleStartDay: households.billingCycleStartDay })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  const cycle = getActiveBillingCycle(hh.billingCycleStartDay);
  const cycleStartStr = format(cycle.startDate, 'yyyy-MM-dd');

  await db.insert(manualCycleItems).values({
    householdId,
    cycleStartDate: cycleStartStr,
    type: parsed.data.type,
    name: parsed.data.name,
    amount: parsed.data.amount.toFixed(2),
    note: parsed.data.note ?? null,
  });

  revalidatePath('/dashboard');
  return { ok: true };
}

export async function removeManualItem(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [item] = await db
    .select({ householdId: manualCycleItems.householdId })
    .from(manualCycleItems)
    .where(eq(manualCycleItems.id, id))
    .limit(1);
  if (!item || item.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  await db.delete(manualCycleItems).where(eq(manualCycleItems.id, id));
  revalidatePath('/dashboard');
  return { ok: true };
}
