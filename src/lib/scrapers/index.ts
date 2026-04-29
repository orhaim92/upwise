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
};

export type ScrapeResult =
  | {
      success: true;
      transactions: ScrapedTransaction[];
      accountNumberMasked: string | null;
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
    });

    const result = await scraper.scrape(credentials);

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
    };

    function pushTx(t: RawTx, mask: string | null) {
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
      });
    }

    // Dedup across sub-accounts: same logical transaction (e.g. an income
    // credit) often appears in multiple sub-account views with different bank
    // identifiers. Match on content alone — collisions for distinct-but-
    // identical transactions on the same day are rare in personal finance.
    const seen = new Set<string>();

    for (const account of result.accounts ?? []) {
      if (!firstAccountMask) {
        firstAccountMask = maskAccountNumber(account.accountNumber);
      }
      const mask = maskAccountNumber(account.accountNumber);
      const rawTxs = (account.txns ?? []) as unknown as RawTx[];
      let kept = 0;
      let skipped = 0;
      for (const t of rawTxs) {
        const amount = t.chargedAmount ?? t.originalAmount ?? 0;
        const contentKey = `${t.date}|${amount}|${t.description ?? ''}`;
        if (seen.has(contentKey)) {
          skipped++;
          continue;
        }
        seen.add(contentKey);
        pushTx(t, mask);
        kept++;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[scrape:${params.provider}] account ${mask ?? '?'} → ${rawTxs.length} txns (kept ${kept}, skipped ${skipped} cross-account dups)`,
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
