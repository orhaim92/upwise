// Sync runner for GitHub Actions (and local manual use).
//
// Args (optional, in priority order):
//   --account-id=<uuid>     Sync just this one account.
//   --household-id=<uuid>   Sync all active accounts in this household.
//   (none)                  Sync every active account in every household.
//
// Run locally: `npm run sync:all -- --household-id=<id>`
// Run in CI:   triggered by `.github/workflows/sync.yml` (schedule + dispatch)

import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

function getArg(prefix: string): string | undefined {
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const accountIdArg = getArg('--account-id=');
  const householdIdArg = getArg('--household-id=');

  const { db } = await import('@/lib/db');
  const { accounts, households } = await import('@/lib/db/schema');
  const { syncAccount, syncAllAccounts } = await import(
    '@/lib/scrapers/sync'
  );
  const { eq } = await import('drizzle-orm');

  if (accountIdArg) {
    const [acc] = await db
      .select({
        householdId: accounts.householdId,
        displayName: accounts.displayName,
      })
      .from(accounts)
      .where(eq(accounts.id, accountIdArg))
      .limit(1);
    if (!acc) {
      console.error(`Account not found: ${accountIdArg}`);
      process.exit(1);
    }
    console.log(`→ Single-account sync: ${acc.displayName}`);
    const r = await syncAccount(accountIdArg, acc.householdId);
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (householdIdArg) {
    console.log(`→ Single-household sync: ${householdIdArg}`);
    const results = await syncAllAccounts(householdIdArg);
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Sweep mode — every household.
  const allHouseholds = await db
    .select({ id: households.id, name: households.name })
    .from(households);

  console.log(`→ Sweep sync: ${allHouseholds.length} household(s)`);

  for (const h of allHouseholds) {
    console.log(`\n=== ${h.name} (${h.id}) ===`);
    try {
      const results = await syncAllAccounts(h.id);
      const errors = results.filter((r) => r.status === 'error');
      const inserted = results.reduce((s, r) => s + r.inserted, 0);
      const scraped = results.reduce((s, r) => s + r.scraped, 0);
      console.log(
        `  ✓ ${results.length} account(s), scraped ${scraped}, inserted ${inserted}, errors ${errors.length}`,
      );
      for (const e of errors) {
        console.log(`    ✗ ${e.displayName}: ${e.errorType} ${e.errorMessage}`);
      }
    } catch (err) {
      console.error(`  household ${h.id} failed:`, err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
