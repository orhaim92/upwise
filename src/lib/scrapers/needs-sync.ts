import { and, eq } from 'drizzle-orm';
import { differenceInHours } from 'date-fns';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';

const STALE_THRESHOLD_HOURS = 24;

export async function householdNeedsSync(
  householdId: string,
): Promise<boolean> {
  const accs = await db
    .select({ lastScrapedAt: accounts.lastScrapedAt })
    .from(accounts)
    .where(
      and(eq(accounts.householdId, householdId), eq(accounts.isActive, true)),
    );

  if (accs.length === 0) return false;

  return accs.some((a) => {
    if (!a.lastScrapedAt) return true;
    return differenceInHours(new Date(), a.lastScrapedAt) >= STALE_THRESHOLD_HOURS;
  });
}

// Returns the most-recent successful sync timestamp across the household's
// active accounts. The dashboard banner uses this to decide whether to warn
// the user that data may be stale — by surfacing the *newest* sync, the
// banner only triggers when EVERY account is overdue. A single stale CC
// while the bank synced an hour ago no longer flips the whole dashboard
// red. Returns null when the household has no active accounts so the
// caller can branch on "fresh install" vs "all stale".
export async function householdOldestSync(
  householdId: string,
): Promise<Date | null> {
  const accs = await db
    .select({ lastScrapedAt: accounts.lastScrapedAt })
    .from(accounts)
    .where(
      and(eq(accounts.householdId, householdId), eq(accounts.isActive, true)),
    );

  if (accs.length === 0) return null;

  let newest: Date | null = null;
  for (const a of accs) {
    if (!a.lastScrapedAt) continue;
    if (!newest || a.lastScrapedAt > newest) newest = a.lastScrapedAt;
  }
  return newest;
}
