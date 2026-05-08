'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { households } from '@/lib/db/schema';
import { getUserHouseholdId } from '@/lib/auth/household';
import { updateCycleSchema } from '@/lib/validations/cycle';

export async function updateCycle(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = updateCycleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'יום לא תקין' };

  const householdId = await getUserHouseholdId(session.user.id);

  await db
    .update(households)
    .set({
      billingCycleStartDay: parsed.data.billingCycleStartDay,
      ...(parsed.data.autoDetectCycleStart !== undefined
        ? { autoDetectCycleStart: parsed.data.autoDetectCycleStart }
        : {}),
    })
    .where(eq(households.id, householdId));

  revalidatePath('/dashboard');
  revalidatePath('/settings');
  return { ok: true };
}
