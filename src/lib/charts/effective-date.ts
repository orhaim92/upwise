import { sql } from 'drizzle-orm';
import { accounts, transactions } from '@/lib/db/schema';

// Returns the SQL expression for a transaction's "effective cycle date" —
// the date the chart filter buckets it by.
//
// Default: COALESCE(processed_date, date) — for normal credit cards this is
// the bill-payment date, which is when the money actually leaves the bank.
//
// Override: when the tx is on a CC account AND its card_last_four is in
// the household's immediate-charge list (debit-style cards like דיירקט),
// the effective date is the purchase date instead — those cards charge
// immediately, so the purchase date IS the cash-out date.
//
// Producing the SQL fragment from a function (rather than templating
// strings) lets every chart query share the exact same logic, so totals
// stay coherent.
export function effectiveCycleDateSql(immediateCards: readonly string[]) {
  if (immediateCards.length === 0) {
    return sql`COALESCE(${transactions.processedDate}, ${transactions.date})`;
  }
  // Inline as `IN ($1, $2, ...)` via sql.join so each value binds as its
  // own parameter — postgres-js + Drizzle don't reliably translate a JS
  // array into the right shape for `ANY(?)` here, so IN keeps it explicit
  // and parameterized.
  const inList = sql.join(
    immediateCards.map((c) => sql`${c}`),
    sql`, `,
  );
  return sql`(
    CASE
      WHEN ${accounts.type} = 'credit_card'
        AND ${transactions.cardLastFour} IN (${inList})
      THEN ${transactions.date}
      ELSE COALESCE(${transactions.processedDate}, ${transactions.date})
    END
  )`;
}
