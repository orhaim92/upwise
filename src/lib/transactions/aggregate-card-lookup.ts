import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accounts, transactions } from '@/lib/db/schema';

export type AggregateCardMatch = {
  cardLastFour: string;
  cardAccountId: string;
};

// Phase 4.8: identify which physical card a bank-side aggregate charge
// represents, by:
//   1. The bank tx's own cardLastFour (set when user manually marks via dialog)
//   2. Substring match: any 4-digit sequence in description that matches a
//      known cardLastFour from CC transactions in this household
//
// Returns { cardLastFour, cardAccountId } or null.
export async function findCardForAggregate(
  householdId: string,
  bankTransactionId: string,
): Promise<AggregateCardMatch | null> {
  const [tx] = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      cardLastFour: transactions.cardLastFour,
    })
    .from(transactions)
    .where(eq(transactions.id, bankTransactionId))
    .limit(1);
  if (!tx) return null;

  // Build the catalog of distinct cards in the household.
  const cardRows = await db
    .selectDistinct({
      accountId: transactions.accountId,
      cardLastFour: transactions.cardLastFour,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(accounts.type, 'credit_card'),
        isNotNull(transactions.cardLastFour),
      ),
    );

  if (cardRows.length === 0) return null;

  // Path 1: explicit user marking
  if (tx.cardLastFour) {
    const match = cardRows.find((c) => c.cardLastFour === tx.cardLastFour);
    if (match && match.cardLastFour) {
      return {
        cardLastFour: match.cardLastFour,
        cardAccountId: match.accountId,
      };
    }
  }

  // Path 2: substring of description matches a known card's last4
  for (const card of cardRows) {
    if (!card.cardLastFour) continue;
    if (tx.description.includes(card.cardLastFour)) {
      return {
        cardLastFour: card.cardLastFour,
        cardAccountId: card.accountId,
      };
    }
  }

  return null;
}
