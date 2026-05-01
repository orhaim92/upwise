import { and, eq, isNull, sql } from 'drizzle-orm';
import { addDays, subDays } from 'date-fns';
import { db } from '@/lib/db';
import { transactions } from '@/lib/db/schema';

// Match each "outgoing" transaction in account A with an "incoming" transaction
// of equal magnitude in any other household account, within a 3-day window.
// Both sides get is_internal_transfer = true and reference each other via
// transfer_partner_id, excluding them from cycle math. Idempotent.
const FLOOR = 50; // shekels — below this, dedup-by-amount is too noisy

export async function detectInternalTransfers(
  householdId: string,
): Promise<number> {
  const candidates = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.isInternalTransfer, false),
        isNull(transactions.transferPartnerId),
        sql`abs(${transactions.amount}) >= ${FLOOR}`,
      ),
    );

  type Cand = (typeof candidates)[number];
  const outgoing = candidates.filter((c) => Number(c.amount) < 0);
  const incoming = candidates.filter((c) => Number(c.amount) > 0);

  const incomingByAmount = new Map<string, Cand[]>();
  for (const inc of incoming) {
    const key = Math.abs(Number(inc.amount)).toFixed(2);
    if (!incomingByAmount.has(key)) incomingByAmount.set(key, []);
    incomingByAmount.get(key)!.push(inc);
  }

  let matched = 0;
  const claimedIncoming = new Set<string>();

  for (const out of outgoing) {
    const absAmount = Math.abs(Number(out.amount)).toFixed(2);
    const bucket = incomingByAmount.get(absAmount);
    if (!bucket) continue;

    const outDate = new Date(out.date);
    const windowStart = subDays(outDate, 3);
    const windowEnd = addDays(outDate, 3);

    const partner = bucket.find((inc) => {
      if (claimedIncoming.has(inc.id)) return false;
      if (inc.accountId === out.accountId) return false;
      const incDate = new Date(inc.date);
      return incDate >= windowStart && incDate <= windowEnd;
    });

    if (!partner) continue;

    await db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({ isInternalTransfer: true, transferPartnerId: partner.id })
        .where(eq(transactions.id, out.id));
      await tx
        .update(transactions)
        .set({ isInternalTransfer: true, transferPartnerId: out.id })
        .where(eq(transactions.id, partner.id));
    });

    claimedIncoming.add(partner.id);
    matched++;
  }

  return matched;
}
