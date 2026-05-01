'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { savingsGoals } from '@/lib/db/schema';
import { getUserHouseholdId } from '@/lib/auth/household';
import { savingsGoalSchema } from '@/lib/validations/goals';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function listGoals() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const householdId = await getUserHouseholdId(session.user.id);

  return db
    .select()
    .from(savingsGoals)
    .where(eq(savingsGoals.householdId, householdId))
    .orderBy(savingsGoals.createdAt);
}

export async function createGoal(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = savingsGoalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    };
  }

  const householdId = await getUserHouseholdId(session.user.id);

  await db.insert(savingsGoals).values({
    householdId,
    name: parsed.data.name,
    targetAmount: parsed.data.targetAmount.toFixed(2),
    currentAmount: parsed.data.currentAmount.toFixed(2),
    targetDate: parsed.data.targetDate ?? null,
    monthlyContribution: parsed.data.monthlyContribution
      ? parsed.data.monthlyContribution.toFixed(2)
      : null,
    icon: parsed.data.icon ?? '🎯',
    color: parsed.data.color ?? '#7C3AED',
  });

  revalidatePath('/goals');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateGoal(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = savingsGoalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    };
  }

  const householdId = await getUserHouseholdId(session.user.id);
  const [existing] = await db
    .select({ householdId: savingsGoals.householdId })
    .from(savingsGoals)
    .where(eq(savingsGoals.id, id))
    .limit(1);
  if (!existing || existing.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  await db
    .update(savingsGoals)
    .set({
      name: parsed.data.name,
      targetAmount: parsed.data.targetAmount.toFixed(2),
      currentAmount: parsed.data.currentAmount.toFixed(2),
      targetDate: parsed.data.targetDate ?? null,
      monthlyContribution: parsed.data.monthlyContribution
        ? parsed.data.monthlyContribution.toFixed(2)
        : null,
      icon: parsed.data.icon ?? '🎯',
      color: parsed.data.color ?? '#7C3AED',
    })
    .where(eq(savingsGoals.id, id));

  revalidatePath('/goals');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const householdId = await getUserHouseholdId(session.user.id);
  const [existing] = await db
    .select({ householdId: savingsGoals.householdId })
    .from(savingsGoals)
    .where(eq(savingsGoals.id, id))
    .limit(1);
  if (!existing || existing.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  await db.delete(savingsGoals).where(eq(savingsGoals.id, id));
  revalidatePath('/goals');
  revalidatePath('/dashboard');
  return { ok: true };
}
