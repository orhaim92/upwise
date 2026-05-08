'use server';

import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/config';
import { getUserHouseholdId } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { accounts, households, transactions } from '@/lib/db/schema';

export type CardSummary = {
  cardLastFour: string;
  // Issuer account name (e.g., "ישראכרט") to help the user identify the card.
  // A single physical card always belongs to one account, so we pick any.
  accountName: string;
  txCount: number;
  isImmediate: boolean;
};

// Lists every distinct card_last_four value from CC transactions in the
// household, alongside its parent account name and a tx count so the user
// can recognize which physical card is which. Marks each as immediate or
// not, based on the household's saved list.
export async function listCards(): Promise<CardSummary[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const householdId = await getUserHouseholdId(session.user.id);

  const [hh] = await db
    .select({ immediateChargeCards: households.immediateChargeCards })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  const immediateSet = new Set(hh?.immediateChargeCards ?? []);

  const rows = await db
    .select({
      cardLastFour: transactions.cardLastFour,
      accountName: accounts.displayName,
      txCount: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(accounts.type, 'credit_card'),
        isNotNull(transactions.cardLastFour),
      ),
    )
    .groupBy(transactions.cardLastFour, accounts.displayName)
    .orderBy(desc(sql`count(*)`));

  return rows
    .filter((r): r is typeof r & { cardLastFour: string } =>
      Boolean(r.cardLastFour),
    )
    .map((r) => ({
      cardLastFour: r.cardLastFour,
      accountName: r.accountName,
      txCount: r.txCount,
      isImmediate: immediateSet.has(r.cardLastFour),
    }));
}

// Toggles a card's immediate-charge flag on the household. Add / remove
// from the array in one statement so concurrent toggles don't race on a
// read-modify-write of the full list.
export async function setCardImmediate(input: {
  cardLastFour: string;
  isImmediate: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthenticated' };
  const householdId = await getUserHouseholdId(session.user.id);

  const value = input.cardLastFour.trim();
  if (!/^[0-9]{2,8}$/.test(value)) {
    return { ok: false, error: 'invalid_card_number' };
  }

  if (input.isImmediate) {
    // array_append duplicates if already present — guard with NOT (= ANY).
    await db
      .update(households)
      .set({
        immediateChargeCards: sql`CASE
          WHEN ${value} = ANY(${households.immediateChargeCards})
            THEN ${households.immediateChargeCards}
          ELSE array_append(${households.immediateChargeCards}, ${value})
        END`,
      })
      .where(eq(households.id, householdId));
  } else {
    await db
      .update(households)
      .set({
        immediateChargeCards: sql`array_remove(${households.immediateChargeCards}, ${value})`,
      })
      .where(eq(households.id, householdId));
  }

  revalidatePath('/dashboard');
  revalidatePath('/settings/cards');
  return { ok: true };
}
