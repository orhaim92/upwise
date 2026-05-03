'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { advisorInsights } from '@/lib/db/schema';
import { getUserHouseholdId } from '@/lib/auth/household';

export async function dismissInsight(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const householdId = await getUserHouseholdId(session.user.id);

  await db
    .update(advisorInsights)
    .set({ status: 'dismissed' })
    .where(
      and(
        eq(advisorInsights.id, id),
        eq(advisorInsights.householdId, householdId),
      ),
    );

  revalidatePath('/dashboard');
  return { ok: true };
}
