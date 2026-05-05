import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

// One-shot: re-run CC-aggregate detection across every household, picking up
// the new 1:1 immediate-debit matching. Existing rows that already match the
// old sum-based heuristic stay flagged; rows like "דיירקט (חיוב מיידי)" that
// previously slipped through now get flagged on this pass.
//
// Idempotent. Safe to re-run. Skips user-modified rows (the detection
// itself respects is_user_modified=false).
async function main() {
  const { db } = await import('./index');
  const { households } = await import('./schema');
  const { detectCreditCardAggregates } = await import(
    '../transactions/detect-cc-aggregates'
  );

  const allHouseholds = await db.select({ id: households.id }).from(households);

  let total = 0;
  for (const h of allHouseholds) {
    const marked = await detectCreditCardAggregates(h.id);
    if (marked > 0) {
      console.log(`  household ${h.id}: marked ${marked} new aggregate(s)`);
    }
    total += marked;
  }

  console.log(
    `Done. Marked ${total} additional CC-aggregate row(s) across ` +
      `${allHouseholds.length} household(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
