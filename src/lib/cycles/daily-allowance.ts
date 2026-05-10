import { and, eq, sql } from 'drizzle-orm';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import {
  accounts,
  manualCycleItems,
  recurringRules,
  savingsGoals,
  transactions,
} from '@/lib/db/schema';
import {
  enumerateOccurrences,
  hasOccurrenceInWindow,
} from './frequency';
import { getActiveBillingCycle, type BillingCycle } from './billing-cycle';
import { checkMaterialization } from './materialization';

export type BreakdownItem = {
  id: string;
  source: 'recurring' | 'manual' | 'goal' | 'account' | 'transaction';
  name: string;
  amount: number;
  note?: string;
  materialized?: boolean;
  materializationReason?: 'fk_link' | 'pattern_match' | 'user_skip' | 'not_yet';
  matchedTransactionIds?: string[];
};

export type DailyAllowance = {
  cycle: BillingCycle;

  currentTotalBalance: number;
  balanceAvailable: boolean;
  balanceBreakdown: BreakdownItem[];

  expectedRemainingIncome: number;
  expectedRemainingIncomeBreakdown: BreakdownItem[];

  expectedRemainingRecurringExpenses: number;
  expectedRemainingRecurringExpensesBreakdown: BreakdownItem[];

  savingsCommitmentRemainingInCycle: number;
  savingsBreakdown: BreakdownItem[];

  manualOneTimeIncome: number;
  manualOneTimeIncomeBreakdown: BreakdownItem[];

  manualOneTimeExpenses: number;
  manualOneTimeExpensesBreakdown: BreakdownItem[];

  availableToSpend: number;
  dailyAllowance: number;

  expensesRealizedToDate: number;
  incomeRealizedToDate: number;
  realizedIncomeBreakdown: BreakdownItem[];
  realizedExpensesBreakdown: BreakdownItem[];

  isOverBudget: boolean;
  isCycleEnded: boolean;
  isLowBalance: boolean;
  // True when bank balance is currently negative. Surfaced as a separate
  // overdraft indicator so the headline daily allowance (which uses a
  // cash-flow / budget model independent of debt) doesn't mask the fact
  // that there's a debt to be aware of.
  isOverdraft: boolean;
};

const LOW_BALANCE_FLOOR = 500;

export async function computeDailyAllowance(
  householdId: string,
  cycleStartDay: number,
  today: Date = new Date(),
  // Optional pre-resolved cycle (e.g. from auto-detect). If provided we use
  // it as-is; otherwise we fall back to the day-anchored cycle. Lets the
  // caller decide whether the cycle should follow the actual salary date.
  precomputedCycle?: BillingCycle,
): Promise<DailyAllowance> {
  const cycle =
    precomputedCycle ?? getActiveBillingCycle(cycleStartDay, today);
  const startStr = format(cycle.startDate, 'yyyy-MM-dd');
  const todayStr = format(today, 'yyyy-MM-dd');

  // Per-bank-account balance (source of truth)
  const bankAccs = await db
    .select({
      id: accounts.id,
      displayName: accounts.displayName,
      currentBalance: accounts.currentBalance,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, householdId),
        eq(accounts.type, 'bank'),
        eq(accounts.isActive, true),
      ),
    );

  const balanceAvailable =
    bankAccs.length > 0 && bankAccs.every((a) => a.currentBalance !== null);
  const currentTotalBalance = bankAccs.reduce(
    (sum, a) => sum + (a.currentBalance ? Number(a.currentBalance) : 0),
    0,
  );
  const balanceBreakdown: BreakdownItem[] = bankAccs.map((a) => ({
    id: a.id,
    source: 'account',
    name: a.displayName,
    amount: a.currentBalance ? Number(a.currentBalance) : 0,
    note: a.currentBalance === null ? 'יתרה לא זמינה' : undefined,
  }));

  const rules = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.householdId, householdId),
        eq(recurringRules.isActive, true),
        eq(recurringRules.detectionStatus, 'confirmed'),
      ),
    );

  // 3-way OR materialization check (FK link OR pattern match OR user skip)
  const materialization = await checkMaterialization(
    householdId,
    rules,
    cycle.startDate,
    cycle.endDate,
  );

  const expectedRemainingIncomeBreakdown: BreakdownItem[] = [];
  const expectedRemainingRecurringExpensesBreakdown: BreakdownItem[] = [];
  let expectedRemainingIncome = 0;
  let expectedRemainingRecurringExpenses = 0;

  for (const r of rules) {
    const mat = materialization.get(r.id);

    const hasOcc = hasOccurrenceInWindow(
      {
        frequency: r.frequency,
        customIntervalDays: r.customIntervalDays,
        startDate: r.startDate,
        endDate: r.endDate,
        remainingOccurrences: r.remainingOccurrences,
      },
      cycle.startDate,
      cycle.endDate,
    );
    if (!hasOcc) continue;

    // Materialized rules don't count in "remaining" — they're already in the balance.
    if (mat?.isMaterialized) continue;

    const occs = enumerateOccurrences(
      {
        frequency: r.frequency,
        customIntervalDays: r.customIntervalDays,
        startDate: r.startDate,
        endDate: r.endDate,
      },
      cycle.startDate,
      cycle.endDate,
    );
    const totalForCycle = occs.length * Number(r.expectedAmount);

    const item: BreakdownItem = {
      id: r.id,
      source: 'recurring',
      name: r.name,
      amount: totalForCycle,
      materialized: false,
      materializationReason: 'not_yet',
    };

    if (r.type === 'income') {
      expectedRemainingIncome += totalForCycle;
      expectedRemainingIncomeBreakdown.push(item);
    } else {
      expectedRemainingRecurringExpenses += totalForCycle;
      expectedRemainingRecurringExpensesBreakdown.push(item);
    }
  }

  // Manual one-time items for this cycle
  const manualItems = await db
    .select()
    .from(manualCycleItems)
    .where(
      and(
        eq(manualCycleItems.householdId, householdId),
        eq(manualCycleItems.cycleStartDate, startStr),
      ),
    );

  const manualOneTimeIncomeBreakdown: BreakdownItem[] = [];
  const manualOneTimeExpensesBreakdown: BreakdownItem[] = [];
  let manualOneTimeIncome = 0;
  let manualOneTimeExpenses = 0;

  for (const m of manualItems) {
    const amt = Number(m.amount);
    const item: BreakdownItem = {
      id: m.id,
      source: 'manual',
      name: m.name,
      amount: amt,
      note: m.note ?? undefined,
    };
    if (m.type === 'income') {
      manualOneTimeIncome += amt;
      manualOneTimeIncomeBreakdown.push(item);
    } else {
      manualOneTimeExpenses += amt;
      manualOneTimeExpensesBreakdown.push(item);
    }
  }

  // Savings
  const goals = await db
    .select()
    .from(savingsGoals)
    .where(eq(savingsGoals.householdId, householdId));
  const savingsBreakdown: BreakdownItem[] = goals
    .filter((g) => g.monthlyContribution && Number(g.monthlyContribution) > 0)
    .map((g) => ({
      id: g.id,
      source: 'goal',
      name: g.name,
      amount: Number(g.monthlyContribution),
    }));
  const savingsCommitmentRemainingInCycle = savingsBreakdown.reduce(
    (s, x) => s + x.amount,
    0,
  );

  // Realized this cycle (informational only).
  //
  // Restricted to BANK-account transactions to avoid double-counting. Each CC
  // purchase eventually shows up as part of a bank charge (either an immediate
  // debit like "דיירקט" or a monthly bill aggregate). With CC txs filtered
  // out by account type, the BANK aggregate is exactly what we want to count
  // — so we keep aggregates here (no `isAggregatedCharge=false` filter).
  //
  // Cycle membership uses processedDate when available (cash-out date — bank
  // statement date); falls back to `date` for txs without a processedDate.
  // Sorted by date desc for the dashboard breakdown panels.
  const realized = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(accounts.type, 'bank'),
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) >= ${startStr}`,
        sql`COALESCE(${transactions.processedDate}, ${transactions.date}) <= ${todayStr}`,
        eq(transactions.isInternalTransfer, false),
      ),
    )
    .orderBy(sql`COALESCE(${transactions.processedDate}, ${transactions.date}) DESC`);

  const realizedIncomeBreakdown: BreakdownItem[] = realized
    .filter((tx) => Number(tx.amount) > 0)
    .map((tx) => ({
      id: tx.id,
      source: 'transaction',
      name: tx.description,
      amount: Number(tx.amount),
      note: tx.date,
    }));
  const realizedExpensesBreakdown: BreakdownItem[] = realized
    .filter((tx) => Number(tx.amount) < 0)
    .map((tx) => ({
      id: tx.id,
      source: 'transaction',
      name: tx.description,
      amount: Math.abs(Number(tx.amount)),
      note: tx.date,
    }));
  const incomeRealizedToDate = realizedIncomeBreakdown.reduce(
    (s, x) => s + x.amount,
    0,
  );
  const expensesRealizedToDate = realizedExpensesBreakdown.reduce(
    (s, x) => s + x.amount,
    0,
  );

  // Budget / cash-flow model (independent of historical debt):
  //
  //   cycleBudget       = totalCycleIncome - savings - manual expenses
  //                       - expected remaining recurring expenses
  //   availableToSpend  = cycleBudget - already-realized expenses this cycle
  //
  // For a household in overdraft, the previous "currentBalance + ..."
  // formula tried to pay off the entire debt every cycle — daily allowance
  // would crater even though the user is on track. The delta-based model
  // says "how much more can you spend this cycle and still hit your
  // savings goal." Existing overdraft is surfaced via `isOverdraft` so the
  // user keeps situational awareness.
  const totalCycleIncome =
    incomeRealizedToDate + expectedRemainingIncome + manualOneTimeIncome;

  const availableToSpend =
    totalCycleIncome -
    expensesRealizedToDate -
    expectedRemainingRecurringExpenses -
    manualOneTimeExpenses -
    savingsCommitmentRemainingInCycle;

  const dailyAllowance =
    cycle.daysRemaining > 0
      ? Math.max(0, availableToSpend) / cycle.daysRemaining
      : 0;

  return {
    cycle,
    currentTotalBalance,
    balanceAvailable,
    balanceBreakdown,
    expectedRemainingIncome,
    expectedRemainingIncomeBreakdown,
    expectedRemainingRecurringExpenses,
    expectedRemainingRecurringExpensesBreakdown,
    manualOneTimeIncome,
    manualOneTimeIncomeBreakdown,
    manualOneTimeExpenses,
    manualOneTimeExpensesBreakdown,
    savingsCommitmentRemainingInCycle,
    savingsBreakdown,
    availableToSpend,
    dailyAllowance,
    incomeRealizedToDate,
    expensesRealizedToDate,
    realizedIncomeBreakdown,
    realizedExpensesBreakdown,
    isOverBudget: availableToSpend < 0,
    isCycleEnded: cycle.daysRemaining === 0,
    isLowBalance: availableToSpend >= 0 && availableToSpend < LOW_BALANCE_FLOOR,
    isOverdraft: balanceAvailable && currentTotalBalance < 0,
  };
}
