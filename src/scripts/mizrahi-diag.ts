// Diagnostic for the Mizrahi "logs in but reports UNKNOWN_ERROR" problem.
//
// Runs the real israeli-bank-scrapers Mizrahi scraper, but through a browser
// instance WE own, so that after the scrape we can inspect what page(s) the
// session actually landed on. The library's success detection wants either
// a URL matching /mto.mizrahi-tefahot.co.il/OnlineApp/.../ or a "עובר ושב"
// <a><span>. This prints the post-scrape page URLs + titles and dumps the
// primary page's HTML so we can see whether the redesigned portal is
// patchable.
//
// Prints only URLs/titles to the console (no credentials). Page HTML is
// written to a local file for inspection.
//
// Usage: npm run mizrahi:diag -- <accountId> [--headful]

import { loadEnvConfig } from '@next/env';
import { writeFileSync } from 'fs';
import { join } from 'path';

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const accountId = args[0];
  if (!accountId) {
    console.error('Usage: npm run mizrahi:diag -- <accountId> [--headful]');
    process.exit(1);
  }
  const headful = args.includes('--headful');

  const { db } = await import('@/lib/db');
  const { accounts } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { decryptJSON } = await import('@/lib/crypto');
  const { createScraper, CompanyTypes } = await import('israeli-bank-scrapers');
  const { subMonths } = await import('date-fns');
  const puppeteer = (await import('puppeteer')).default;

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) {
    console.error(`Account not found: ${accountId}`);
    process.exit(1);
  }
  if (account.provider !== 'mizrahi') {
    console.warn(`Note: account provider is "${account.provider}", not mizrahi.`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const credentials = decryptJSON(account.encryptedCredentials) as any;

  const browser = await puppeteer.launch({
    headless: !headful,
    protocolTimeout: 180_000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
    ],
  });

  const scraper = createScraper({
    companyId: CompanyTypes.mizrahi,
    startDate: subMonths(new Date(), 1),
    combineInstallments: false,
    verbose: false,
    browser,
    // We own the browser; keep it alive so we can inspect pages afterward.
    skipCloseBrowser: true,
  });

  // The scraper closes its page during cleanup, so inspecting after scrape()
  // returns only finds about:blank. Instead, poll during the scrape and keep
  // the latest snapshot of the "real" (non-blank, non-login) page.
  let snapshot: { url: string; title: string; html: string } | null = null;
  let polling = true;
  const poller = (async () => {
    while (polling) {
      try {
        for (const page of await browser.pages()) {
          const url = page.url();
          if (!url || url.startsWith('about:') || /\/login\//.test(url)) {
            continue;
          }
          // Capture the deepest post-login page we can see.
          const [title, html] = await Promise.all([
            page.title().catch(() => ''),
            page.content().catch(() => ''),
          ]);
          if (html) snapshot = { url, title, html };
        }
      } catch {
        /* pages churn during navigation; ignore and keep polling */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();

  console.log('Scraping (this reproduces the failure)...\n');
  const result = await scraper.scrape(credentials);
  polling = false;
  await poller;

  console.log('Scrape result:', {
    success: result.success,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorType: (result as any).errorType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorMessage: (result as any).errorMessage,
  });

  if (!snapshot) {
    console.log(
      '\nNo post-login page was captured (login may not have advanced past ' +
        'the login screen in this run).',
    );
  } else {
    const snap: { url: string; title: string; html: string } = snapshot;
    const matchesOnlineApp =
      /https:\/\/mto\.mizrahi-tefahot\.co\.il\/OnlineApp\/.*/.test(snap.url);
    const hasOshText = /עובר ושב|Checking Account/.test(snap.html);
    console.log('\nPost-login page captured:');
    console.log('  url  :', snap.url);
    console.log('  title:', snap.title);
    console.log('\nSuccess-signal analysis (what a patch would key off of):');
    console.log('  URL matches /OnlineApp/ regex :', matchesOnlineApp);
    console.log('  page text contains "עובר ושב" :', hasOshText);

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const out = join(process.cwd(), `mizrahi-postlogin-${ts}.html`);
    writeFileSync(out, snap.html, 'utf8');
    console.log(`\nPost-login page HTML written to:\n  ${out}`);
  }

  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
