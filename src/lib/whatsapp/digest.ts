import { db } from '@/lib/db';
import { accounts, households, transactions } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { computeDailyAllowance } from '@/lib/cycles/daily-allowance';
import { format, subDays } from 'date-fns';
import { formatILS } from '@/lib/format';

// Build the daily digest text for one household. Mirrors the dashboard's
// numbers: spending yesterday + last 7 days, plus the cycle's
// available-to-spend and per-day allowance.
//
// Like the dashboard, we count only BANK-account transactions (CC txs are
// already represented by the bank charge that aggregates them) and use
// COALESCE(processed_date, date) for cycle membership.
export async function buildDigest(householdId: string): Promise<string> {
  const [hh] = await db
    .select()
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  if (!hh) return 'UpWise: שגיאה בבניית הסיכום.';

  const today = new Date();
  const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');
  const sevenDaysAgoStr = format(subDays(today, 7), 'yyyy-MM-dd');
  const todayStr = format(today, 'yyyy-MM-dd');

  const allowance = await computeDailyAllowance(
    householdId,
    hh.billingCycleStartDay,
    today,
  );

  // Negative-sum aggregator: positive shekels = expenses (we negate amount
  // since outflows are stored as negative numbers).
  async function bankExpenseSum(
    fromStr: string,
    toStr: string,
  ): Promise<number> {
    const rows = await db
      .select({
        total: sql<string>`coalesce(sum(case when ${transactions.amount} < 0 then -${transactions.amount} else 0 end), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(accounts.type, 'bank'),
          eq(transactions.isInternalTransfer, false),
          sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${fromStr}`,
          sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${toStr}`,
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  const yesterday = await bankExpenseSum(yesterdayStr, yesterdayStr);
  const sevenDays = await bankExpenseSum(sevenDaysAgoStr, todayStr);

  // Daily budget = available / days_remaining, but never negative (we show
  // ₪0 with a warning instead). When you're over budget the answer to
  // "how much can I spend today" is "nothing — recover first".
  const dailyBudget = Math.max(0, allowance.dailyAllowance);

  const lines: string[] = [];
  lines.push('☀️ *בוקר טוב!*');
  lines.push('');
  lines.push('📊 *הוצאות אחרונות*');
  lines.push(`אתמול: ${formatILS(yesterday)}`);
  lines.push(`7 ימים אחרונים: ${formatILS(sevenDays)}`);
  lines.push('');
  lines.push(
    `💰 *מחזור נוכחי (נותרו ${allowance.cycle.daysRemaining} ימים)*`,
  );
  lines.push(`זמין במחזור: ${formatILS(allowance.availableToSpend)}`);
  lines.push(`תקציב יומי: ${formatILS(dailyBudget)}`);

  if (allowance.isOverBudget) {
    lines.push('');
    lines.push(
      `⚠️ חרגת ב-${formatILS(Math.abs(allowance.availableToSpend))} מהתקציב`,
    );
  } else if (allowance.isLowBalance) {
    lines.push('');
    lines.push('⚠️ יתרה זמינה נמוכה');
  }

  return lines.join('\n');
}
