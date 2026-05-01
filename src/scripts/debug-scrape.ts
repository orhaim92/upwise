// Debug script: dump the RAW response from israeli-bank-scrapers for a single
// account, so you can inspect exactly what the scraper returns (per sub-account
// transactions, account numbers, processedDate values, futureDebits, etc).
//
// Usage:
//   npm run debug:scrape -- <accountId>
//   npm run debug:scrape -- <accountId> --months 12
//
// Output is written to ./scraper-dump-<accountId>-<timestamp>.json next to the
// project root, so it's easy to diff/inspect without scrolling terminal output.

import { loadEnvConfig } from '@next/env';
import { writeFileSync } from 'fs';
import { join } from 'path';

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const accountId = args[0];
  if (!accountId) {
    console.error('Usage: npm run debug:scrape -- <accountId> [--months N]');
    process.exit(1);
  }

  const monthsIdx = args.indexOf('--months');
  const months =
    monthsIdx >= 0 && args[monthsIdx + 1] ? parseInt(args[monthsIdx + 1], 10) : 6;

  const { db } = await import('@/lib/db');
  const { accounts } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { decryptJSON } = await import('@/lib/crypto');
  const { createScraper, CompanyTypes } = await import('israeli-bank-scrapers');
  const { subMonths } = await import('date-fns');

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    console.error(`Account not found: ${accountId}`);
    process.exit(1);
  }

  console.log(
    `\nAccount: ${account.displayName} (${account.provider}, ${account.type})`,
  );
  console.log(`Scraping last ${months} months...\n`);

  const PROVIDER_TO_COMPANY: Record<
    string,
    (typeof CompanyTypes)[keyof typeof CompanyTypes]
  > = {
    hapoalim: CompanyTypes.hapoalim,
    leumi: CompanyTypes.leumi,
    discount: CompanyTypes.discount,
    mizrahi: CompanyTypes.mizrahi,
    otsarHahayal: CompanyTypes.otsarHahayal,
    isracard: CompanyTypes.isracard,
    max: CompanyTypes.max,
    visaCal: CompanyTypes.visaCal,
  };

  const company = PROVIDER_TO_COMPANY[account.provider];
  if (!company) {
    console.error(`Provider not supported: ${account.provider}`);
    process.exit(1);
  }

  const credentials = decryptJSON(account.encryptedCredentials);

  const scraper = createScraper({
    companyId: company,
    startDate: subMonths(new Date(), months),
    combineInstallments: false,
    showBrowser: false,
    verbose: false,
    timeout: 120_000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await scraper.scrape(credentials as any);

  // Print a brief summary to console
  if (!result.success) {
    console.error('Scrape failed:', result.errorType, result.errorMessage);
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  console.log(`\nTop-level keys: ${Object.keys(r).join(', ')}`);
  console.log(`accounts.length: ${r.accounts?.length ?? 0}`);

  for (const [i, acc] of (r.accounts ?? []).entries()) {
    console.log(
      `\n  account[${i}] number=${acc.accountNumber ?? '?'} balance=${acc.balance ?? 'n/a'} txns=${(acc.txns ?? []).length}`,
    );
    if (acc.txns && acc.txns.length > 0) {
      const sample = acc.txns[0];
      console.log(`    sample tx keys: ${Object.keys(sample).join(', ')}`);
      console.log(`    first tx:`, JSON.stringify(sample, null, 2));
    }
  }

  if (r.futureDebits) {
    console.log(`\nfutureDebits: ${r.futureDebits.length}`);
    if (r.futureDebits.length > 0) {
      console.log('  sample:', JSON.stringify(r.futureDebits[0], null, 2));
    }
  }

  // Write full response to file for inspection
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = join(process.cwd(), `scraper-dump-${accountId}-${ts}.json`);
  writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n✓ Full response written to: ${outFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
