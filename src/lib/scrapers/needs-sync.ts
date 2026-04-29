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
  if (accs.some((a) => !a.lastScrapedAt)) return null;

  let oldest: Date = accs[0].lastScrapedAt!;
  for (const a of accs) {
    if (a.lastScrapedAt! < oldest) oldest = a.lastScrapedAt!;
  }
  return oldest;
}
