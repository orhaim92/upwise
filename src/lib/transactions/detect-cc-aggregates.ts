import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { addDays, format, subDays } from 'date-fns';
import { db } from '@/lib/db';
import { accounts, transactions } from '@/lib/db/schema';

// Phase 4.8.2: per-card aggregate detection driven by amount + date matching.
//
// Many Israeli bank descriptions for CC charges DON'T contain the card last4
// (e.g. "חיוב כרטיס: מזרחי"). So we can't filter by description. Instead we
// use the strongest signal: for each candidate bank charge, check if exactly
// one known card has a matching CC sum on (or near) the bank charge date.
//
// Algorithm: for each unmarked negative bank tx above MIN_AMOUNT, compute the
// CC sum per card on bank.date ±1 day. If exactly one card matches the bank
// amount within tolerance, mark the bank tx as that card's aggregate.
// Multiple matches → ambiguous, skip. Zero matches → not an aggregate.
//
// Idempotent. Skips user-modified rows.
const MIN_AGGREGATE_AMOUNT = 50;
const SUM_TOLERANCE = 0.05;
const WINDOW_DAYS = 1;

export async function detectCreditCardAggregates(
  householdId: string,
): Promise<number> {
  const cards = await db
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

  if (cards.length === 0) return 0;

  const bankAccs = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, householdId),
        eq(accounts.type, 'bank'),
        eq(accounts.isActive, true),
      ),
    );
  if (bankAccs.length === 0) return 0;

  const bankInList = sql.join(
    bankAccs.map((b) => sql`${b.id}`),
    sql`, `,
  );

  // Pull every candidate bank tx in one query.
  // Include description so we can do the strongest detection — when the
  // bank itself wrote the card last-4 into the row (e.g. "5385 - אמריקן
  // אקספרס"), match by that before anything else. Description match is
  // unambiguous and cheap; sum / 1:1 fallbacks below handle the silent
  // bank descriptions like "חיוב כרטיס: מזרחי".
  const candidatesRaw = await db.execute<{
    id: string;
    date: string;
    amount: string;
    description: string;
  }>(sql`
    SELECT id, date::text, amount::text, description
    FROM transactions
    WHERE household_id = ${householdId}
      AND account_id IN (${bankInList})
      AND amount < 0
      AND date >= now() - interval '120 days'
      AND is_aggregated_charge = false
      AND is_internal_transfer = false
      AND is_user_modified = false
      AND abs(amount) >= ${MIN_AGGREGATE_AMOUNT}
  `);

  const candidates: Array<{
    id: string;
    date: string;
    amount: string;
    description: string;
  }> =
    (candidatesRaw as unknown as {
      rows?: Array<{
        id: string;
        date: string;
        amount: string;
        description: string;
      }>;
    })?.rows ??
    (candidatesRaw as unknown as Array<{
      id: string;
      date: string;
      amount: string;
      description: string;
    }>);

  // Lookup table of known card last-4 → (accountId, last4). Used by the
  // description-match path. Built once so we don't query per-candidate.
  const cardByLast4 = new Map<
    string,
    { accountId: string; cardLastFour: string }
  >();
  for (const c of cards) {
    if (c.cardLastFour) {
      cardByLast4.set(c.cardLastFour, {
        accountId: c.accountId,
        cardLastFour: c.cardLastFour,
      });
    }
  }

  let marked = 0;
  let skippedAmbiguous = 0;
  let skippedNoMatch = 0;

  let markedByDescription = 0;

  for (const cand of candidates) {
    const bankAmount = Math.abs(parseFloat(cand.amount));
    const candDate = new Date(cand.date);
    const windowStart = format(subDays(candDate, WINDOW_DAYS), 'yyyy-MM-dd');
    const windowEnd = format(addDays(candDate, WINDOW_DAYS), 'yyyy-MM-dd');
    const tolerance = bankAmount * SUM_TOLERANCE;

    // Path 0 — description carries the card last-4 (strongest signal).
    // Banks like Otsar HaHayal write the card number directly, e.g.
    // "5385 - אמריקן אקספרס". Extract every 4-digit run and look for
    // exactly one that matches a known card; if so, link immediately and
    // skip the sum / exact-amount paths.
    const fourDigitMatches = cand.description?.match(/\b\d{4}\b/g) ?? [];
    const recognized = Array.from(
      new Set(
        fourDigitMatches.filter((d) => cardByLast4.has(d)),
      ),
    );
    if (recognized.length === 1) {
      const card = cardByLast4.get(recognized[0])!;
      await db
        .update(transactions)
        .set({
          isAggregatedCharge: true,
          cardLastFour: card.cardLastFour,
        })
        .where(eq(transactions.id, cand.id));
      marked++;
      markedByDescription++;
      continue;
    }

    const matchingCards: Array<{ accountId: string; cardLastFour: string }> = [];

    for (const card of cards) {
      if (!card.cardLastFour) continue;

      const sumResult = await db.execute<{ total: string }>(sql`
        SELECT COALESCE(sum(-amount), 0)::text as total
        FROM transactions
        WHERE household_id = ${householdId}
          AND account_id = ${card.accountId}
          AND card_last_four = ${card.cardLastFour}
          AND amount < 0
          AND processed_date IS NOT NULL
          AND processed_date >= ${windowStart}
          AND processed_date <= ${windowEnd}
      `);

      const sumRows: Array<{ total: string }> =
        (sumResult as unknown as { rows?: Array<{ total: string }> })?.rows ??
        (sumResult as unknown as Array<{ total: string }>);

      const ccTotal = parseFloat(sumRows[0]?.total ?? '0');
      if (ccTotal === 0) continue;
      if (Math.abs(ccTotal - bankAmount) > tolerance) continue;

      matchingCards.push({
        accountId: card.accountId,
        cardLastFour: card.cardLastFour,
      });
    }

    if (matchingCards.length === 0) {
      // Fallback: handle immediate-debit rows ("דיירקט (חיוב מיידי)" etc.)
      // where each bank line corresponds 1:1 to a single CC purchase rather
      // than a summed billing batch. Sum-matching above can't disambiguate
      // these when multiple same-day card purchases exist (each adds to the
      // sum). For 1:1 we instead look for *exactly one* card row whose
      // amount equals the bank amount in the date window.
      const exactRows = await db.execute<{
        account_id: string;
        card_last_four: string;
        match_count: string;
      }>(sql`
        SELECT account_id, card_last_four, count(*)::text AS match_count
        FROM transactions t
        INNER JOIN accounts a ON a.id = t.account_id
        WHERE t.household_id = ${householdId}
          AND a.type = 'credit_card'
          AND t.amount = ${parseFloat(cand.amount)}
          AND COALESCE(t.processed_date, t.date) >= ${windowStart}
          AND COALESCE(t.processed_date, t.date) <= ${windowEnd}
        GROUP BY account_id, card_last_four
      `);

      type ExactRow = {
        account_id: string;
        card_last_four: string;
        match_count: string;
      };
      const exactMatches: ExactRow[] =
        (exactRows as unknown as { rows?: ExactRow[] })?.rows ??
        (exactRows as unknown as ExactRow[]);

      // Need exactly one card with exactly one matching purchase. Anything
      // ambiguous gets skipped — better to leave it un-flagged than to
      // mistakenly hide a real expense from the donut.
      const unique = exactMatches.filter((r) => r.match_count === '1');
      if (unique.length === 1) {
        const winner = unique[0];
        await db
          .update(transactions)
          .set({
            isAggregatedCharge: true,
            cardLastFour: winner.card_last_four,
          })
          .where(eq(transactions.id, cand.id));
        marked++;
      } else {
        skippedNoMatch++;
      }
      continue;
    }
    if (matchingCards.length > 1) {
      skippedAmbiguous++;
      continue;
    }

    const winner = matchingCards[0];
    await db
      .update(transactions)
      .set({
        isAggregatedCharge: true,
        cardLastFour: winner.cardLastFour,
      })
      .where(eq(transactions.id, cand.id));
    marked++;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[cc-aggregates] candidates=${candidates.length} marked=${marked} (byDescription=${markedByDescription}) skippedAmbiguous=${skippedAmbiguous} skippedNoMatch=${skippedNoMatch}`,
    );
  }

  return marked;
}
