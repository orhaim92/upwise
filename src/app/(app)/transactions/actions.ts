'use server';

import { and, eq, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import {
  accounts,
  categories,
  recurringRules,
  transactions,
} from '@/lib/db/schema';
import { getUserHouseholdId } from '@/lib/auth/household';

const setCategorySchema = z.object({
  transactionId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
});

const toggleSpecialSchema = z.object({
  transactionId: z.string().uuid(),
  field: z.enum(['isInternalTransfer', 'isAggregatedCharge']),
  value: z.boolean(),
});

const linkSchema = z.object({
  transactionId: z.string().uuid(),
  ruleId: z.string().uuid().nullable(),
});

const markAsCardStatementSchema = z.object({
  transactionId: z.string().uuid(),
  cardAccountId: z.string().uuid(),
  // Phase 4.8: which physical card (last 4 digits) this aggregate represents.
  // Optional for backwards-compat; required to get clean per-card children.
  cardLastFour: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .nullable(),
});

export async function setTransactionCategory(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = setCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [tx] = await db
    .select({ householdId: transactions.householdId })
    .from(transactions)
    .where(eq(transactions.id, parsed.data.transactionId))
    .limit(1);
  if (!tx || tx.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  if (parsed.data.categoryId) {
    const [cat] = await db
      .select({ householdId: categories.householdId })
      .from(categories)
      .where(eq(categories.id, parsed.data.categoryId))
      .limit(1);
    if (!cat) return { ok: false, error: 'קטגוריה לא נמצאה' };
    if (cat.householdId && cat.householdId !== householdId) {
      return { ok: false, error: 'קטגוריה לא נמצאה' };
    }
  }

  await db
    .update(transactions)
    .set({
      categoryId: parsed.data.categoryId,
      isUserModified: true,
    })
    .where(eq(transactions.id, parsed.data.transactionId));

  revalidatePath('/transactions');
  return { ok: true };
}

export async function toggleSpecialFlag(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = toggleSpecialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [tx] = await db
    .select({ householdId: transactions.householdId })
    .from(transactions)
    .where(eq(transactions.id, parsed.data.transactionId))
    .limit(1);
  if (!tx || tx.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  await db
    .update(transactions)
    .set({
      [parsed.data.field]: parsed.data.value,
      isUserModified: true,
      ...(parsed.data.field === 'isInternalTransfer' && !parsed.data.value
        ? { transferPartnerId: null }
        : {}),
    })
    .where(eq(transactions.id, parsed.data.transactionId));

  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function linkTransactionToRule(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [tx] = await db
    .select({ householdId: transactions.householdId })
    .from(transactions)
    .where(eq(transactions.id, parsed.data.transactionId))
    .limit(1);
  if (!tx || tx.householdId !== householdId) {
    return { ok: false, error: 'תנועה לא נמצאה' };
  }

  if (parsed.data.ruleId) {
    const [rule] = await db
      .select({ householdId: recurringRules.householdId })
      .from(recurringRules)
      .where(eq(recurringRules.id, parsed.data.ruleId))
      .limit(1);
    if (!rule || rule.householdId !== householdId) {
      return { ok: false, error: 'כלל לא נמצא' };
    }
  }

  await db
    .update(transactions)
    .set({
      recurringRuleId: parsed.data.ruleId,
      isUserModified: true,
    })
    .where(eq(transactions.id, parsed.data.transactionId));

  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function listRulesForLinking() {
  const session = await auth();
  if (!session?.user?.id) return [];
  const householdId = await getUserHouseholdId(session.user.id);

  return db
    .select({
      id: recurringRules.id,
      name: recurringRules.name,
      type: recurringRules.type,
      expectedAmount: recurringRules.expectedAmount,
    })
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.householdId, householdId),
        eq(recurringRules.detectionStatus, 'confirmed'),
        eq(recurringRules.isActive, true),
      ),
    )
    .orderBy(recurringRules.type, recurringRules.name);
}

export async function markAsCardStatement(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = markAsCardStatementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [tx] = await db
    .select({ householdId: transactions.householdId })
    .from(transactions)
    .where(eq(transactions.id, parsed.data.transactionId))
    .limit(1);
  if (!tx || tx.householdId !== householdId) {
    return { ok: false, error: 'תנועה לא נמצאה' };
  }

  const [card] = await db
    .select({
      householdId: accounts.householdId,
      type: accounts.type,
    })
    .from(accounts)
    .where(eq(accounts.id, parsed.data.cardAccountId))
    .limit(1);
  if (!card || card.householdId !== householdId || card.type !== 'credit_card') {
    return { ok: false, error: 'כרטיס לא תקין' };
  }

  await db
    .update(transactions)
    .set({
      isAggregatedCharge: true,
      isUserModified: true,
      ...(parsed.data.cardLastFour
        ? { cardLastFour: parsed.data.cardLastFour }
        : {}),
    })
    .where(eq(transactions.id, parsed.data.transactionId));

  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function unmarkAsCardStatement(
  transactionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [tx] = await db
    .select({ householdId: transactions.householdId })
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);
  if (!tx || tx.householdId !== householdId) {
    return { ok: false, error: 'תנועה לא נמצאה' };
  }

  await db
    .update(transactions)
    .set({ isAggregatedCharge: false, isUserModified: true })
    .where(eq(transactions.id, transactionId));

  revalidatePath('/transactions');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function listCategoriesForHousehold(): Promise<
  { id: string; key: string; icon: string | null; color: string | null }[]
> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const householdId = await getUserHouseholdId(session.user.id);

  return db
    .select({
      id: categories.id,
      key: categories.key,
      icon: categories.icon,
      color: categories.color,
    })
    .from(categories)
    .where(
      or(
        isNull(categories.householdId),
        eq(categories.householdId, householdId),
      ),
    )
    .orderBy(categories.key);
}
