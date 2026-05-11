import { and, eq, ne, sql } from 'drizzle-orm';
import { addDays, format, subDays } from 'date-fns';
import { db } from '@/lib/db';
import { transactions } from '@/lib/db/schema';

// Mizrahi (and a few others) report a "placeholder" CC charge a couple
// days before the real one clears. Both end up in our DB:
//   - placeholder: "חיוב/זיכוי כרטיס אשראי" with an estimated amount
//   - real:       "ישראכרט (י)" with the actual amount (close but different)
// The bank app itself only shows the real one once it clears — the
// placeholder vanishes — but our sync only sees what's currently in the
// account, so the stale placeholder lives on as a phantom debit.
//
// This consolidator finds placeholders that have a real twin (same account,
// ±DATE_WINDOW_DAYS, amount in tolerance) and deletes the placeholder.
// Skips anything user-modified — the user might have categorized or linked
// the placeholder explicitly, in which case we don't second-guess them.
//
// Idempotent + safe to run after every sync.

// Normalized descriptions that look like the bank's auto-generated CC
// charge label (no merchant name attached). We match on `description`
// with these as exact strings — `normalized_description` strips
// punctuation but keeps the wording, so the prefix check is robust to
// trailing whitespace differences and parenthetical noise.
const PLACEHOLDER_PATTERNS: readonly string[] = [
  'חיוב/זיכוי כרטיס אשראי',
  'חיוב כרטיס אשראי',
  'חיוב ישראכרט עתידי',
  'זיכוי כרטיס אשראי',
];

// Amount tolerance: a real CC charge usually clears within a few shekels
// of the placeholder, but FX-denominated bills can drift by a percent or
// two. Use the larger of an absolute floor and a relative window so both
// small and large charges have a sensible match radius.
const ABSOLUTE_TOLERANCE_ILS = 50;
const RELATIVE_TOLERANCE = 0.02;
const DATE_WINDOW_DAYS = 2;

export async function consolidateCcPlaceholders(
  householdId: string,
): Promise<number> {
  // Build a single LIKE-based filter over description so we pull
  // placeholders in one query rather than per-pattern.
  const orFragments = PLACEHOLDER_PATTERNS.map(
    (p) => sql`${transactions.description} ILIKE ${`%${p}%`}`,
  );
  const placeholderWhere = sql.join(orFragments, sql` OR `);

  const placeholders = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.isUserModified, false),
        sql`(${placeholderWhere})`,
      ),
    );

  if (placeholders.length === 0) return 0;

  let deleted = 0;
  for (const ph of placeholders) {
    const phAmount = parseFloat(ph.amount);
    const tolerance = Math.max(
      ABSOLUTE_TOLERANCE_ILS,
      Math.abs(phAmount) * RELATIVE_TOLERANCE,
    );
    const minAmount = phAmount - tolerance;
    const maxAmount = phAmount + tolerance;

    // Compute the date window in JS so we bind concrete yyyy-MM-dd strings
    // — Postgres parameter inference was reading `date - $integer` as
    // `date - date` (returns int), which broke the comparison with
    // transactions.date.
    const phDate = new Date(ph.date);
    const minDate = format(subDays(phDate, DATE_WINDOW_DAYS), 'yyyy-MM-dd');
    const maxDate = format(addDays(phDate, DATE_WINDOW_DAYS), 'yyyy-MM-dd');

    // The real twin is on the SAME account (Mizrahi reports both placeholder
    // and clearing under the bank account, not the CC account), within the
    // date window, with an amount close to the placeholder, and a
    // description that does NOT itself match the placeholder set.
    const candidates = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.accountId, ph.accountId),
          ne(transactions.id, ph.id),
          sql`${transactions.amount} BETWEEN ${minAmount.toFixed(2)} AND ${maxAmount.toFixed(2)}`,
          sql`${transactions.date} >= ${minDate}`,
          sql`${transactions.date} <= ${maxDate}`,
          sql`NOT (${placeholderWhere})`,
        ),
      );

    if (candidates.length !== 1) continue; // 0 = no clearing yet; 2+ = ambiguous, leave alone.

    await db.delete(transactions).where(eq(transactions.id, ph.id));
    deleted++;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[cc-placeholders] checked=${placeholders.length} deleted=${deleted}`,
    );
  }

  return deleted;
}
