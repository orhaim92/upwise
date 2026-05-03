import {
  createScraper,
  CompanyTypes,
  type ScraperCredentials,
} from 'israeli-bank-scrapers';
import { subMonths } from 'date-fns';
import { decryptJSON } from '@/lib/crypto';

export type ScrapeErrorType =
  | 'INVALID_PASSWORD'
  | 'CHANGE_PASSWORD'
  | 'TIMEOUT'
  | 'GENERIC'
  | 'BLOCKED';

export type ScrapedTransaction = {
  externalId: string | null;
  date: Date;
  processedDate: Date | null;
  amount: number;
  description: string;
  rawDescription: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  accountNumberMasked: string | null;
  // Phase 4.8: last 4 digits of the source card. For CC scrapers,
  // israeli-bank-scrapers returns one sub-account per physical card; this
  // captures which card produced this transaction.
  cardLastFour: string | null;
};

export type ScrapeResult =
  | {
      success: true;
      transactions: ScrapedTransaction[];
      accountNumberMasked: string | null;
      currentBalance: number | null;
    }
  | {
      success: false;
      errorType: ScrapeErrorType;
      errorMessage: string;
    };

const PROVIDER_TO_COMPANY: Record<string, CompanyTypes> = {
  hapoalim: CompanyTypes.hapoalim,
  leumi: CompanyTypes.leumi,
  discount: CompanyTypes.discount,
  mizrahi: CompanyTypes.mizrahi,
  otsarHahayal: CompanyTypes.otsarHahayal,
  isracard: CompanyTypes.isracard,
  max: CompanyTypes.max,
  visaCal: CompanyTypes.visaCal,
};

// THIS IS THE ONLY PLACE IN THE APP THAT CALLS decrypt().
export async function scrapeAccount(params: {
  provider: string;
  encryptedCredentials: string;
  startDate?: Date;
}): Promise<ScrapeResult> {
  const company = PROVIDER_TO_COMPANY[params.provider];
  if (!company) {
    return {
      success: false,
      errorType: 'GENERIC',
      errorMessage: `Provider not supported: ${params.provider}`,
    };
  }

  const startDate = params.startDate ?? subMonths(new Date(), 6);
  const credentials = decryptJSON<ScraperCredentials>(
    params.encryptedCredentials,
  );

  try {
    const scraper = createScraper({
      companyId: company,
      startDate,
      combineInstallments: false,
      showBrowser: false,
      verbose: false,
      timeout: 120_000,
      // CI / anti-detection args:
      //  --no-sandbox / --disable-setuid-sandbox: GH Actions Ubuntu has no
      //    user namespaces, Chrome's sandbox can't init. Standard workaround.
      //  --disable-blink-features=AutomationControlled: removes the
      //    navigator.webdriver=true flag — the #1 signal bank WAFs use to
      //    fingerprint headless Chrome.
      //  --disable-dev-shm-usage: small /dev/shm in CI containers; without
      //    this Chrome OOMs on heavy SPAs.
      //  --window-size: matches a real desktop viewport.
      //  --user-agent: identify as a recent stable Chrome on Windows
      //    (matching what most home users actually browse from).
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ],
    });

    const result = await scraper.scrape(credentials);

    // TEMP debug: dump the raw scraper response to a file for inspection.
    // Remove once aggregate detection is dialed in.
    if (process.env.NODE_ENV !== 'production') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const outFile = path.join(
          process.cwd(),
          `scraper-dump-${params.provider}-${ts}.json`,
        );
        fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
        console.log(
          `[scrape:${params.provider}] raw response written to ${outFile}`,
        );
      } catch (dumpErr) {
        console.warn(`[scrape:${params.provider}] dump failed:`, dumpErr);
      }
    }

    if (!result.success) {
      return {
        success: false,
        errorType: mapErrorType(result.errorType),
        errorMessage: result.errorMessage ?? 'Scrape failed',
      };
    }

    const allTxs: ScrapedTransaction[] = [];
    let firstAccountMask: string | null = null;

    type RawTx = {
      identifier?: string | number;
      date: string;
      processedDate?: string;
      chargedAmount?: number;
      originalAmount?: number;
      description?: string;
      installments?: { number: number; total: number };
      // israeli-bank-scrapers includes "completed" or "pending". Pending =
      // not yet settled (e.g. Mizrahi's "חיוב ישראכרט עתידי" rows that are
      // future-dated debits). We exclude these — they shouldn't show up as
      // realized expenses, and they'll re-appear as completed once they
      // actually clear, so there's no risk of losing data.
      status?: string;
    };

    function pushTx(t: RawTx, mask: string | null, last4: string | null) {
      allTxs.push({
        externalId: t.identifier?.toString() ?? null,
        date: new Date(t.date),
        processedDate: t.processedDate ? new Date(t.processedDate) : null,
        amount: t.chargedAmount ?? t.originalAmount ?? 0,
        description: t.description ?? '',
        rawDescription: t.description ?? '',
        installmentNumber: t.installments?.number ?? null,
        installmentTotal: t.installments?.total ?? null,
        accountNumberMasked: mask,
        cardLastFour: last4,
      });
    }

    // Dedup across sub-accounts: same logical transaction (e.g. an income
    // credit) often appears in multiple sub-account views with different bank
    // identifiers. Match on content alone — collisions for distinct-but-
    // identical transactions on the same day are rare in personal finance.
    const seen = new Set<string>();
    let currentBalance: number | null = null;

    for (const account of result.accounts ?? []) {
      if (!firstAccountMask) {
        firstAccountMask = maskAccountNumber(account.accountNumber);
      }
      const mask = maskAccountNumber(account.accountNumber);
      const last4 = extractLastFour(account.accountNumber);
      const accountWithBalance = account as unknown as { balance?: number };
      if (typeof accountWithBalance.balance === 'number') {
        currentBalance = (currentBalance ?? 0) + accountWithBalance.balance;
      }
      const rawTxs = (account.txns ?? []) as unknown as RawTx[];
      let kept = 0;
      let skippedDup = 0;
      let skippedPending = 0;
      for (const t of rawTxs) {
        // Drop pending / not-yet-cleared transactions. Mizrahi returns
        // "חיוב ישראכרט עתידי" (future Isracard charge) as pending rows
        // with positive amounts; storing them shows phantom income today
        // and double-counts when they later clear as completed.
        if (t.status && t.status !== 'completed') {
          skippedPending++;
          continue;
        }
        const amount = t.chargedAmount ?? t.originalAmount ?? 0;
        const contentKey = `${t.date}|${amount}|${t.description ?? ''}`;
        if (seen.has(contentKey)) {
          skippedDup++;
          continue;
        }
        seen.add(contentKey);
        pushTx(t, mask, last4);
        kept++;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[scrape:${params.provider}] account ${mask ?? '?'} (last4=${last4 ?? 'n/a'}) → ${rawTxs.length} txns (kept ${kept}, dup ${skippedDup}, pending ${skippedPending})`,
        );
      }
    }

    // Pending / upcoming charges (mostly credit cards)
    const futureDebits = (result as unknown as {
      futureDebits?: Array<{ chargeDate?: string; amount?: number }>;
    }).futureDebits;
    if (futureDebits && futureDebits.length > 0 && process.env.NODE_ENV !== 'production') {
      console.log(
        `[scrape:${params.provider}] ${futureDebits.length} future debits (not stored — informational)`,
      );
    }

    return {
      success: true,
      transactions: allTxs,
      accountNumberMasked: firstAccountMask,
      currentBalance,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errorType: 'GENERIC',
      errorMessage: message,
    };
  }
}

function mapErrorType(raw: string | undefined): ScrapeErrorType {
  switch (raw) {
    case 'INVALID_PASSWORD':
      return 'INVALID_PASSWORD';
    case 'CHANGE_PASSWORD':
      return 'CHANGE_PASSWORD';
    case 'TIMEOUT':
      return 'TIMEOUT';
    case 'ACCOUNT_BLOCKED':
      return 'BLOCKED';
    default:
      return 'GENERIC';
  }
}

function maskAccountNumber(
  accountNumber: string | undefined,
): string | null {
  if (!accountNumber) return null;
  const digits = accountNumber.replace(/\D/g, '');
  if (digits.length <= 4) return accountNumber;
  return `••••${digits.slice(-4)}`;
}

function extractLastFour(accountNumber: string | undefined): string | null {
  if (!accountNumber) return null;
  const digits = accountNumber.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}
