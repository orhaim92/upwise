// Sync runner for GitHub Actions (and local manual use).
//
// Args (optional, in priority order):
//   --account-id=<uuid>          Sync just this one account.
//   --provider=<isracard|...>    Sync all active accounts of this provider
//                                across all households (handy for syncing
//                                Isracard locally when its WAF blocks
//                                cloud IPs).
//   --household-id=<uuid>        Sync all active accounts in this household.
//   (none)                       Sync every active account in every household.
//
// Run locally: `npm run sync:all -- --provider=isracard`
// Run in CI:   triggered by `.github/workflows/sync.yml` (schedule + dispatch)

import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

function getArg(prefix: string): string | undefined {
  const found = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const accountIdArg = getArg('--account-id=');
  const providerArg = getArg('--provider=');
  const householdIdArg = getArg('--household-id=');

  const { db } = await import('@/lib/db');
  const { accounts, households } = await import('@/lib/db/schema');
  const { syncAccount, syncAllAccounts } = await import(
    '@/lib/scrapers/sync'
  );
  const { and, eq } = await import('drizzle-orm');

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

  if (providerArg) {
    const matches = await db
      .select({
        id: accounts.id,
        householdId: accounts.householdId,
        displayName: accounts.displayName,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, providerArg),
          eq(accounts.isActive, true),
        ),
      );
    if (matches.length === 0) {
      console.error(`No active accounts found for provider: ${providerArg}`);
      process.exit(1);
    }
    console.log(
      `→ Provider sync: ${providerArg} (${matches.length} account(s))`,
    );
    const results = [];
    for (const acc of matches) {
      console.log(`  • ${acc.displayName}`);
      const r = await syncAccount(acc.id, acc.householdId);
      results.push(r);
    }
    console.log(JSON.stringify(results, null, 2));
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
