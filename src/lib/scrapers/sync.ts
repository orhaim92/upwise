import { createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { accounts, transactions } from '@/lib/db/schema';
import { scrapeAccount, type ScrapedTransaction } from './index';
import {
  normalizeDescription,
  parseInstallment,
} from '@/lib/transactions/normalize';

// Composite dedup key. Always includes the bank's identifier (if present) PLUS
// content fields, so we survive scrapers that reuse the same identifier across
// real distinct transactions (Mizrahi has been observed doing this).
// Same real transaction → same hash across re-syncs → idempotent.
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

  if (process.env.NODE_ENV !== 'production') {
    const withId = scrape.transactions.filter((t) => t.externalId).length;
    const distinctIds = new Set(
      scrape.transactions.filter((t) => t.externalId).map((t) => t.externalId),
    ).size;
    console.log(
      `[sync:${account.provider}] composition: ${scrape.transactions.length} total, ${withId} with bank identifier, ${distinctIds} distinct identifiers`,
    );
  }

  let inserted = 0;
  for (const tx of scrape.transactions) {
    const externalId = externalKey(tx);

    const installment = parseInstallment(tx.rawDescription);
    const installmentNumber =
      tx.installmentNumber ?? installment?.number ?? null;
    const installmentTotal =
      tx.installmentTotal ?? installment?.total ?? null;

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
      })
      .onConflictDoNothing()
      .returning({ id: transactions.id });

    if (inserts.length > 0) inserted++;
  }

  await db
    .update(accounts)
    .set({
      scrapeStatus: 'success',
      scrapeError: null,
      lastScrapedAt: new Date(),
      ...(scrape.accountNumberMasked && !account.accountNumberMasked
        ? { accountNumberMasked: scrape.accountNumberMasked }
        : {}),
    })
    .where(eq(accounts.id, accountId));

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[sync:${account.provider}/${account.displayName}] scraped=${scrape.transactions.length} inserted=${inserted}`,
    );
  }

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
  return results;
}
