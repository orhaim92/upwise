'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { recurringRules } from '@/lib/db/schema';
import { getUserHouseholdId } from '@/lib/auth/household';
import { recurringRuleSchema } from '@/lib/validations/recurring';
import { linkTransactionsToRules } from '@/lib/recurring/link';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function listRules() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const householdId = await getUserHouseholdId(session.user.id);

  return db
    .select()
    .from(recurringRules)
    .where(eq(recurringRules.householdId, householdId))
    .orderBy(
      recurringRules.detectionStatus,
      recurringRules.type,
      recurringRules.name,
    );
}

export async function createRule(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = recurringRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    };
  }

  const householdId = await getUserHouseholdId(session.user.id);

  await db.insert(recurringRules).values({
    householdId,
    name: parsed.data.name,
    type: parsed.data.type,
    expectedAmount: parsed.data.expectedAmount.toFixed(2),
    amountTolerancePct: parsed.data.amountTolerancePct.toString(),
    frequency: parsed.data.frequency,
    customIntervalDays: parsed.data.customIntervalDays ?? null,
    matchPattern: parsed.data.matchPattern ?? null,
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
    remainingOccurrences: parsed.data.remainingOccurrences ?? null,
    isActive: parsed.data.isActive,
    detectionSource: 'user',
    detectionStatus: 'confirmed',
    categoryId: parsed.data.categoryId ?? null,
  });

  await linkTransactionsToRules(householdId).catch(() => {});
  revalidatePath('/recurring');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateRule(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = recurringRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    };
  }

  const householdId = await getUserHouseholdId(session.user.id);

  const [existing] = await db
    .select({ householdId: recurringRules.householdId })
    .from(recurringRules)
    .where(eq(recurringRules.id, id))
    .limit(1);
  if (!existing || existing.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  await db
    .update(recurringRules)
    .set({
      name: parsed.data.name,
      type: parsed.data.type,
      expectedAmount: parsed.data.expectedAmount.toFixed(2),
      amountTolerancePct: parsed.data.amountTolerancePct.toString(),
      frequency: parsed.data.frequency,
      customIntervalDays: parsed.data.customIntervalDays ?? null,
      matchPattern: parsed.data.matchPattern ?? null,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      remainingOccurrences: parsed.data.remainingOccurrences ?? null,
      isActive: parsed.data.isActive,
      categoryId: parsed.data.categoryId ?? null,
    })
    .where(eq(recurringRules.id, id));

  await linkTransactionsToRules(householdId).catch(() => {});
  revalidatePath('/recurring');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function deleteRule(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [existing] = await db
    .select({ householdId: recurringRules.householdId })
    .from(recurringRules)
    .where(eq(recurringRules.id, id))
    .limit(1);
  if (!existing || existing.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  await db.delete(recurringRules).where(eq(recurringRules.id, id));
  revalidatePath('/recurring');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function approveRule(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const householdId = await getUserHouseholdId(session.user.id);
  const [existing] = await db
    .select({ householdId: recurringRules.householdId })
    .from(recurringRules)
    .where(eq(recurringRules.id, id))
    .limit(1);
  if (!existing || existing.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  await db
    .update(recurringRules)
    .set({ detectionStatus: 'confirmed' })
    .where(eq(recurringRules.id, id));

  await linkTransactionsToRules(householdId).catch(() => {});
  revalidatePath('/recurring');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function rejectRule(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const householdId = await getUserHouseholdId(session.user.id);
  await db
    .update(recurringRules)
    .set({ detectionStatus: 'rejected', isActive: false })
    .where(
      and(
        eq(recurringRules.id, id),
        eq(recurringRules.householdId, householdId),
      ),
    );

  revalidatePath('/recurring');
  return { ok: true };
}
