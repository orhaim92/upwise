import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

// Cross-day duplicate consolidation. Some Israeli scrapers return the same
// real-world transaction with `tx.date` (and sometimes `tx.processed_date`)
// shifted by ±1 day between syncs, so the (account, externalId) conflict
// guard on insert doesn't fire and we land a duplicate row.
//
// Finds those near-duplicates (same account/amount/raw_description, dates
// within ±1 day) and consolidates them. Per-pair tie-break, in order:
//   1. The row marked is_user_modified=true (preserves manual edits).
//   2. The older created_at (more likely to have categories / transfer
//      pairings / recurring links the user accumulated against it).
//
// Repoints any rows that point at a loser via `transfer_partner_id` onto the
// winner before delete. Single transaction for atomicity.

export type Consolidation = {
  winner: string;
  loser: string;
  desc: string;
};

type Pair = {
  id1: string;
  id2: string;
  is_user_modified1: boolean;
  is_user_modified2: boolean;
  created1: string;
  created2: string;
  amount: string;
  raw_description: string | null;
  date1: string;
  date2: string;
};

export async function findCrossDayDuplicates(
  householdId?: string,
): Promise<Consolidation[]> {
  const householdClause = householdId
    ? sql`AND a.household_id = ${householdId}`
    : sql``;

  const result = await db.execute<Pair>(sql`
    SELECT
      a.id AS id1,
      b.id AS id2,
      a.is_user_modified AS is_user_modified1,
      b.is_user_modified AS is_user_modified2,
      a.created_at::text AS created1,
      b.created_at::text AS created2,
      a.amount::text     AS amount,
      a.raw_description,
      a.date::text       AS date1,
      b.date::text       AS date2
    FROM transactions a
    INNER JOIN transactions b ON
      a.account_id = b.account_id
      AND a.amount = b.amount
      AND a.raw_description = b.raw_description
      AND a.id < b.id
      AND abs(extract(epoch from (a.date::timestamp - b.date::timestamp))) <= 86400
    WHERE a.amount < 0
      AND a.is_internal_transfer = false
      AND a.is_aggregated_charge = false
      ${householdClause}
    ORDER BY a.created_at ASC
  `);

  const pairs: Pair[] = (
    Array.isArray(result)
      ? result
      : ((result as unknown as { rows?: Pair[] }).rows ?? [])
  ) as Pair[];

  // Walk pairs deterministically. If a 3-copy group surfaces as 3 pairs
  // (a,b), (a,c), (b,c), the third pair touches an already-deleted row and
  // is skipped — caller can re-run to mop up the leftover.
  const deleted = new Set<string>();
  const consolidations: Consolidation[] = [];

  for (const p of pairs) {
    if (deleted.has(p.id1) || deleted.has(p.id2)) continue;

    let winner: string;
    let loser: string;
    if (p.is_user_modified1 && !p.is_user_modified2) {
      winner = p.id1;
      loser = p.id2;
    } else if (p.is_user_modified2 && !p.is_user_modified1) {
      winner = p.id2;
      loser = p.id1;
    } else if (p.created1 <= p.created2) {
      winner = p.id1;
      loser = p.id2;
    } else {
      winner = p.id2;
      loser = p.id1;
    }

    consolidations.push({
      winner,
      loser,
      desc: `${p.amount} "${(p.raw_description ?? '').slice(0, 40)}" (${p.date1.slice(0, 10)} vs ${p.date2.slice(0, 10)})`,
    });
    deleted.add(loser);
  }

  return consolidations;
}

export async function applyCrossDayDuplicates(
  consolidations: Consolidation[],
): Promise<void> {
  if (consolidations.length === 0) return;
  await db.transaction(async (tx) => {
    for (const c of consolidations) {
      await tx.execute(sql`
        UPDATE transactions
        SET transfer_partner_id = ${c.winner}
        WHERE transfer_partner_id = ${c.loser}
      `);
      await tx.execute(sql`
        DELETE FROM transactions WHERE id = ${c.loser}
      `);
    }
  });
}

// Convenience wrapper for the sync pipeline: find + apply in one call.
// Returns how many duplicate rows were consolidated.
export async function consolidateCrossDayDuplicates(
  householdId: string,
): Promise<number> {
  const consolidations = await findCrossDayDuplicates(householdId);
  if (consolidations.length === 0) return 0;
  await applyCrossDayDuplicates(consolidations);
  return consolidations.length;
}
