'use server';

import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
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
import {
  listTransactionsGrouped,
  type TransactionRowGrouped,
} from './queries';

// Used by the transactions page's "Load more" button. The page server-
// renders the first PAGE_SIZE rows; subsequent pages come through here.
// Filters are passed in full so the offset window applies to the SAME
// filtered dataset the user is currently looking at.
const loadMoreSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountIds: z.array(z.string().uuid()).optional(),
  categoryKeys: z.array(z.string()).optional(),
  type: z.enum(['all', 'income', 'expense']).optional(),
  search: z.string().optional(),
  includeTransfers: z.boolean().optional(),
  includeAggregates: z.boolean().optional(),
  sort: z.enum(['date', 'amount_asc', 'amount_desc', 'category']).optional(),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1).max(500).default(100),
});

export async function loadMoreTransactions(
  input: unknown,
): Promise<{
  ok: boolean;
  rows?: TransactionRowGrouped[];
  hasMore?: boolean;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = loadMoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  const { offset, limit, ...filters } = parsed.data;
  const rows = await listTransactionsGrouped(
    householdId,
    filters,
    limit,
    offset,
  );

  return { ok: true, rows, hasMore: rows.length === limit };
}

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

// After the user assigns a category to one transaction, look for OTHER
// uncategorized transactions in the same household with the same
// `normalizedDescription`. Used by the "apply to similar" dialog.
//
// We deliberately exclude:
//   - the source transaction itself (already updated by the caller)
//   - transactions that already have ANY category (don't silently overwrite
//     an explicit user choice)
//   - aggregates and internal transfers (not categorizable in practice)
//
// Limited to 50 matches — the UI shows a scrollable list, but applying
// hundreds at once is rarely the user's intent.
const findSimilarSchema = z.object({
  transactionId: z.string().uuid(),
});

export async function findSimilarUncategorizedTransactions(
  input: unknown,
): Promise<{
  ok: boolean;
  error?: string;
  transactions?: Array<{
    id: string;
    date: string;
    description: string;
    amount: string;
    accountDisplayName: string;
  }>;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = findSimilarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [source] = await db
    .select({
      householdId: transactions.householdId,
      description: transactions.description,
      normalizedDescription: transactions.normalizedDescription,
    })
    .from(transactions)
    .where(eq(transactions.id, parsed.data.transactionId))
    .limit(1);
  if (!source || source.householdId !== householdId) {
    return { ok: false, error: 'תנועה לא נמצאה' };
  }
  if (!source.description && !source.normalizedDescription) {
    return { ok: true, transactions: [] };
  }

  // Match liberally: either the visible description matches exactly, OR the
  // normalized form does. This catches:
  //   - merchants whose `normalizedDescription` is null on legacy rows
  //   - rows whose raw description varied (date stamp, store code) but whose
  //     visible cleaned description ended up identical
  // Both columns are populated by the scraper; using both as alternatives
  // makes the lookup robust without false positives.
  const descMatchClauses = [];
  if (source.description) {
    descMatchClauses.push(eq(transactions.description, source.description));
  }
  if (source.normalizedDescription) {
    descMatchClauses.push(
      eq(transactions.normalizedDescription, source.normalizedDescription),
    );
  }
  const descMatch = or(...descMatchClauses);
  if (!descMatch) return { ok: true, transactions: [] };

  const matches = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      accountDisplayName: accounts.displayName,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        descMatch,
        isNull(transactions.categoryId),
        eq(transactions.isInternalTransfer, false),
        eq(transactions.isAggregatedCharge, false),
        sql`${transactions.id} <> ${parsed.data.transactionId}`,
      ),
    )
    .orderBy(desc(transactions.date))
    .limit(50);

  return { ok: true, transactions: matches };
}

// Apply a single category to many transactions at once. Used by the
// "apply to similar" dialog after the user confirms which matches to update.
// Validates household ownership for both the category and every transaction
// id (filtering, not erroring) — extra ids are silently dropped rather than
// aborting the whole batch.
const bulkSetCategorySchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(500),
  categoryId: z.string().uuid(),
});

export async function bulkSetTransactionCategory(
  input: unknown,
): Promise<{ ok: boolean; error?: string; updated?: number }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = bulkSetCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [cat] = await db
    .select({ householdId: categories.householdId })
    .from(categories)
    .where(eq(categories.id, parsed.data.categoryId))
    .limit(1);
  if (!cat) return { ok: false, error: 'קטגוריה לא נמצאה' };
  if (cat.householdId && cat.householdId !== householdId) {
    return { ok: false, error: 'קטגוריה לא נמצאה' };
  }

  const owned = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        inArray(transactions.id, parsed.data.transactionIds),
      ),
    );
  const ownedIds = owned.map((r) => r.id);
  if (ownedIds.length === 0) return { ok: true, updated: 0 };

  await db
    .update(transactions)
    .set({ categoryId: parsed.data.categoryId, isUserModified: true })
    .where(
      and(
        eq(transactions.householdId, householdId),
        inArray(transactions.id, ownedIds),
      ),
    );

  // Intentionally NOT revalidating /transactions here. Calling it triggers a
  // server-driven re-render that lands while base-ui's dialog is mid-cleanup
  // (scroll-lock / inert attributes), producing a hydration mismatch on the
  // next user action. The toast tells the user the update succeeded and
  // updated categories show up on the next filter / load-more / navigation.
  // /dashboard is a different page so revalidating it is safe.
  revalidatePath('/dashboard');
  return { ok: true, updated: ownedIds.length };
}
