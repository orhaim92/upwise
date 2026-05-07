import { createHash } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/lib/db';
import { accounts, households, transactions } from '@/lib/db/schema';
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
import { applyUserLearnedCategories } from '@/lib/transactions/learned-categorize';
import { consolidateCrossDayDuplicates } from '@/lib/transactions/consolidate-cross-day-duplicates';
import { computeDailyAllowance } from '@/lib/cycles/daily-allowance';
import { sendPushToHousehold } from '@/lib/pwa/push-server';
import { formatILS } from '@/lib/format';

// All date formatting is locked to Asia/Jerusalem so the same transaction
// produces the same `date` / `processedDate` / externalKey regardless of
// where the sync runs (local Israel TZ vs GH Actions UTC vs Vercel UTC).
// Without this, a tx whose UTC instant straddles Israeli midnight gets
// dupe-inserted with adjacent dates on different runs.
const TZ = 'Asia/Jerusalem';

function dateString(d: Date): string {
  return formatInTimeZone(d, TZ, 'yyyy-MM-dd');
}

// Composite dedup key. Always includes the bank's identifier (if present) PLUS
// content fields, so we survive scrapers that reuse the same identifier across
// real distinct transactions (Mizrahi has been observed doing this).
function externalKey(tx: ScrapedTransaction): string {
  const parts = [
    tx.externalId ?? '',
    dateString(tx.date),
    tx.processedDate ? dateString(tx.processedDate) : '',
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
        date: dateString(tx.date),
        processedDate: tx.processedDate ? dateString(tx.processedDate) : null,
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

  // Cheap, idempotent post-processors safe after every single-account sync.
  // Order inside the categorize chain matters:
  //   1. consolidate cross-day dupes first — some Israeli scrapers shift
  //      tx.date by ±1 day between syncs, landing duplicate rows. Cleaning
  //      them before categorization avoids categorizing rows we're about
  //      to delete.
  //   2. user-learned (per-household choices) wins over generic rules.
  //   3. generic keyword RULES fill in the rest.
  await Promise.allSettled([
    detectInternalTransfers(householdId),
    (async () => {
      await consolidateCrossDayDuplicates(householdId);
      await applyUserLearnedCategories(householdId);
      await autoCategorizeTransactions(householdId);
    })(),
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
  // SYNC_SKIP_PROVIDERS lets a scheduled / CI run opt out of providers that
  // always 403 from cloud IPs (Isracard, Amex, Visa Cal — they geo/IP-fence
  // their login pages). Set in the GH Actions workflow env, NOT in local
  // .env, so local manual runs still hit every account. Comma-separated
  // provider ids: e.g. SYNC_SKIP_PROVIDERS=isracard,amex,visaCal
  const skipProviders = (process.env.SYNC_SKIP_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const accs = await db
    .select({
      id: accounts.id,
      provider: accounts.provider,
      displayName: accounts.displayName,
    })
    .from(accounts)
    .where(
      and(eq(accounts.householdId, householdId), eq(accounts.isActive, true)),
    );

  const results: AccountSyncResult[] = [];
  for (const acc of accs) {
    if (skipProviders.includes(acc.provider)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[sync] skipping ${acc.displayName} (provider=${acc.provider}; in SYNC_SKIP_PROVIDERS)`,
        );
      }
      continue;
    }
    const r = await syncAccount(acc.id, householdId);
    results.push(r);
  }

  // Order matters:
  // 1. Mark internal transfers first (they should never be auto-categorized as expenses)
  // 2. Identify CC aggregated charges (cross-account; only run on full sync)
  // 3. Consolidate cross-day duplicate rows (date drift across syncs) before
  //    we waste effort categorizing rows we're about to delete
  // 4a. Apply user-learned categories — per-household choices for descriptions
  //     the user has already categorized before
  // 4b. Auto-categorize remaining uncategorized rows via generic keyword rules
  // 5. Detect & persist recurring patterns (excludes transfers and aggregates)
  // 6. Link transactions to confirmed recurring rules
  try {
    await detectInternalTransfers(householdId);
    await detectCreditCardAggregates(householdId);
    await consolidateCrossDayDuplicates(householdId);
    await applyUserLearnedCategories(householdId);
    await autoCategorizeTransactions(householdId);
    const patterns = await detectRecurringPatterns(householdId);
    await persistDetectedPatterns(householdId, patterns);
    await linkTransactionsToRules(householdId);
  } catch (err) {
    console.error('Post-sync processing failed:', err);
  }

  // ===== Post-sync push notifications =====
  // Run after all post-processors so the allowance reflects the latest
  // categorization / transfer detection / aggregation. Each push type is
  // independently best-effort — failures here must NOT poison the sync
  // result the caller is waiting on.
  try {
    const [hh] = await db
      .select()
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    if (hh) {
      const allowance = await computeDailyAllowance(
        householdId,
        hh.billingCycleStartDay,
      );
      if (allowance.isOverBudget) {
        await sendPushToHousehold(householdId, 'lowBalanceEnabled', {
          title: '⚠️ חרגת מהתקציב',
          body: `אתה ${formatILS(Math.abs(allowance.availableToSpend))} מעל הזמין במחזור.`,
          url: '/dashboard',
          tag: 'low-balance',
          requireInteraction: true,
        });
      } else if (allowance.isLowBalance) {
        await sendPushToHousehold(householdId, 'lowBalanceEnabled', {
          title: '⚠️ יתרה זמינה נמוכה',
          body: `נותרו ${formatILS(allowance.availableToSpend)} ל-${allowance.cycle.daysRemaining} ימים.`,
          url: '/dashboard',
          tag: 'low-balance',
        });
      }
    }
  } catch (err) {
    console.error('Low-balance push check failed:', err);
  }

  // Sync-completion notification (default-off pref — opt in only).
  // Skip noisy zero-change syncs.
  try {
    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const errCount = results.filter((r) => r.status === 'error').length;
    if (totalInserted > 0 || errCount > 0) {
      await sendPushToHousehold(householdId, 'syncCompletionEnabled', {
        title: 'סנכרון הסתיים',
        body:
          errCount > 0
            ? `נוספו ${totalInserted} תנועות. ${errCount} חשבונות נכשלו.`
            : `נוספו ${totalInserted} תנועות.`,
        url: '/transactions',
        tag: 'sync-complete',
      });
    }
  } catch (err) {
    console.error('Sync-completion push failed:', err);
  }

  return results;
}
