import { createHash } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { accounts, transactions } from '@/lib/db/schema';
import { scrapeAccount, type ScrapedTransaction } from './index';
import {
  normalizeDescription,
  parseInstallment,
} from '@/lib/transactions/normalize';
import {
  detectRecurringPatterns,
  persistDetectedPatterns,
} from '@/lib/recurring/detect';
import { linkTransactionsToRules } from '@/lib/recurring/link';
import { detectInternalTransfers } from '@/lib/transactions/detect-transfers';
import { detectCreditCardAggregates } from '@/lib/transactions/detect-cc-aggregates';
import { autoCategorizeTransactions } from '@/lib/transactions/auto-categorize';

// Composite dedup key. Always includes the bank's identifier (if present) PLUS
// content fields, so we survive scrapers that reuse the same identifier across
// real distinct transactions (Mizrahi has been observed doing this).
function externalKey(tx: ScrapedTransaction): string {
  const parts = [
    tx.externalId ?? '',
    format(tx.date, 'yyyy-MM-dd'),
    tx.processedDate ? format(tx.processedDate, 'yyyy-MM-dd') : '',
    tx.amount.toFixed(2),
    tx.rawDescription ?? '',
    tx.installmentNumber ?? '',
    tx.installmentTotal ?? '',
  ].join('|');
  return createHash('sha1').update(parts).digest('hex').slice(0, 24);
}

export type AccountSyncResult = {
  accountId: string;
  displayName: string;
  status: 'success' | 'error';
  scraped: number;
  inserted: number;
  errorType?: string;
  errorMessage?: string;
};

export async function syncAccount(
  accountId: string,
  householdId: string,
): Promise<AccountSyncResult> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)))
    .limit(1);

  if (!account) {
    return {
      accountId,
      displayName: '?',
      status: 'error',
      scraped: 0,
      inserted: 0,
      errorType: 'NOT_FOUND',
      errorMessage: 'Account not found',
    };
  }

  await db
    .update(accounts)
    .set({ scrapeStatus: 'running', scrapeError: null })
    .where(eq(accounts.id, accountId));

  const scrape = await scrapeAccount({
    provider: account.provider,
    encryptedCredentials: account.encryptedCredentials,
  });

  if (!scrape.success) {
    await db
      .update(accounts)
      .set({
        scrapeStatus: 'error',
        scrapeError: `${scrape.errorType}: ${scrape.errorMessage}`,
      })
      .where(eq(accounts.id, accountId));
    return {
      accountId,
      displayName: account.displayName,
      status: 'error',
      scraped: 0,
      inserted: 0,
      errorType: scrape.errorType,
      errorMessage: scrape.errorMessage,
    };
  }

  let inserted = 0;
  for (const tx of scrape.transactions) {
    const externalId = externalKey(tx);

    const installment = parseInstallment(tx.rawDescription);
    const installmentNumber =
      tx.installmentNumber ?? installment?.number ?? null;
    const installmentTotal =
      tx.installmentTotal ?? installment?.total ?? null;

    // Phase 4.8 fix: on conflict, backfill cardLastFour if it's currently NULL.
    // Existing rows stay otherwise untouched (preserves user category edits etc.)
    const inserts = await db
      .insert(transactions)
      .values({
        accountId,
        householdId,
        externalId,
        date: format(tx.date, 'yyyy-MM-dd'),
        processedDate: tx.processedDate
          ? format(tx.processedDate, 'yyyy-MM-dd')
          : null,
        amount: tx.amount.toFixed(2),
        description: tx.description,
        rawDescription: tx.rawDescription,
        normalizedDescription: normalizeDescription(tx.rawDescription),
        installmentNumber,
        installmentTotal,
        cardLastFour: tx.cardLastFour,
      })
      .onConflictDoUpdate({
        target: [transactions.accountId, transactions.externalId],
        set: {
          cardLastFour: sql`COALESCE(${transactions.cardLastFour}, EXCLUDED.card_last_four)`,
        },
      })
      .returning({ id: transactions.id });

    if (inserts.length > 0) inserted++;
  }

  await db
    .update(accounts)
    .set({
      scrapeStatus: 'success',
      scrapeError: null,
      lastScrapedAt: new Date(),
      ...(scrape.currentBalance !== null
        ? {
            currentBalance: scrape.currentBalance.toFixed(2),
            balanceUpdatedAt: new Date(),
          }
        : {}),
      ...(scrape.accountNumberMasked && !account.accountNumberMasked
        ? { accountNumberMasked: scrape.accountNumberMasked }
        : {}),
    })
    .where(eq(accounts.id, accountId));

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[sync:${account.provider}/${account.displayName}] scraped=${scrape.transactions.length} inserted=${inserted} balance=${scrape.currentBalance ?? 'n/a'}`,
    );
  }

  // Cheap, idempotent post-processors safe after every single-account sync
  await Promise.allSettled([
    detectInternalTransfers(householdId),
    autoCategorizeTransactions(householdId),
    linkTransactionsToRules(householdId),
  ]);

  return {
    accountId,
    displayName: account.displayName,
    status: 'success',
    scraped: scrape.transactions.length,
    inserted,
  };
}

export async function syncAllAccounts(
  householdId: string,
): Promise<AccountSyncResult[]> {
  const accs = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.householdId, householdId), eq(accounts.isActive, true)),
    );

  const results: AccountSyncResult[] = [];
  for (const acc of accs) {
    const r = await syncAccount(acc.id, householdId);
    results.push(r);
  }

  // Order matters:
  // 1. Mark internal transfers first (they should never be auto-categorized as expenses)
  // 2. Identify CC aggregated charges (cross-account; only run on full sync)
  // 3. Auto-categorize remaining transactions
  // 4. Detect & persist recurring patterns (excludes transfers and aggregates)
  // 5. Link transactions to confirmed recurring rules
  try {
    await detectInternalTransfers(householdId);
    await detectCreditCardAggregates(householdId);
    await autoCategorizeTransactions(householdId);
    const patterns = await detectRecurringPatterns(householdId);
    await persistDetectedPatterns(householdId, patterns);
    await linkTransactionsToRules(householdId);
  } catch (err) {
    console.error('Post-sync processing failed:', err);
  }

  return results;
}
