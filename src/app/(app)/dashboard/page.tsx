import Link from 'next/link';
import { Plus, Sparkles } from 'lucide-react';
import { and, desc, eq } from 'drizzle-orm';
import { differenceInHours, subMonths } from 'date-fns';
import { auth } from '@/lib/auth/config';
import { getUserHouseholdId } from '@/lib/auth/household';
import { db } from '@/lib/db';
import {
  accounts,
  advisorInsights,
  households,
  recurringRules,
} from '@/lib/db/schema';
import { advisorEnabled } from '@/lib/features';
import { InsightsStrip } from './_components/insights-strip';
import { householdOldestSync } from '@/lib/scrapers/needs-sync';
import { computeDailyAllowance } from '@/lib/cycles/daily-allowance';
import {
  formatCycleRange,
  getActiveBillingCycle,
} from '@/lib/cycles/billing-cycle';
import { resolveActiveBillingCycle } from '@/lib/cycles/resolve-cycle';
import {
  getCurrentCycleSpendByCategory,
  getMonthOverMonthDiff,
  getMonthlyTrend,
  getTransactionsByCategoryForCycle,
  rangeToMonths,
} from '@/lib/charts/queries';
import { listCategoriesForHousehold } from '@/app/(app)/transactions/actions';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { SyncButton } from '@/components/sync-button';
import { StalenessBanner } from '@/components/staleness-banner';
import { cn } from '@/lib/utils';
import { template } from '@/lib/format';
import { STALENESS_HOURS } from '@/lib/constants';
import { AllowanceHero } from './_components/allowance-hero';
import { CycleMathCard } from './_components/cycle-math-card';
import { DashboardCharts } from './_components/dashboard-charts';
import type { ChartRange } from './_components/range-picker';
import { t } from '@/lib/i18n/he';

type Props = {
  searchParams: Promise<{ range?: string; cycleOffset?: string }>;
};

// Hard cap on backwards navigation. 24 months of history is already past the
// useful debugging window for a personal finance app, and bounding the offset
// stops a malformed URL from running 1000 cycle queries.
const MAX_CYCLE_OFFSET_BACK = 24;

export default async function DashboardPage({ searchParams }: Props) {
  const session = await auth();
  const householdId = await getUserHouseholdId(session!.user.id);
  const params = await searchParams;
  const range: ChartRange =
    params.range === '3m' || params.range === '12m' ? params.range : '6m';

  // Negative integer = N cycles back. Forward navigation is intentionally
  // disallowed (offset is clamped to <= 0) — there's no useful "future cycle"
  // chart since none of the data exists yet.
  const rawOffset = parseInt(params.cycleOffset ?? '0', 10);
  const cycleOffset = Number.isFinite(rawOffset)
    ? Math.max(-MAX_CYCLE_OFFSET_BACK, Math.min(0, rawOffset))
    : 0;

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);

  const [accountCount, oldestSync, pendingRules, insights] = await Promise.all([
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.householdId, householdId))
      .then((r) => r.length),
    householdOldestSync(householdId),
    db
      .select({ id: recurringRules.id })
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.householdId, householdId),
          eq(recurringRules.detectionStatus, 'pending'),
        ),
      )
      .then((r) => r.length),
    advisorEnabled()
      ? db
          .select({
            id: advisorInsights.id,
            type: advisorInsights.type,
            urgency: advisorInsights.urgency,
            title: advisorInsights.title,
            body: advisorInsights.body,
          })
          .from(advisorInsights)
          .where(
            and(
              eq(advisorInsights.householdId, householdId),
              eq(advisorInsights.status, 'new'),
            ),
          )
          .orderBy(
            desc(advisorInsights.urgency),
            desc(advisorInsights.createdAt),
          )
          .limit(3)
      : Promise.resolve([]),
  ]);

  if (accountCount === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{t.dashboard.title}</h1>
        <Card className="p-12 text-center bg-white">
          <p className="text-slate-600 mb-4">{t.dashboard.noAccountsYet}</p>
          <Link
            href="/accounts"
            className={cn(
              buttonVariants(),
              'bg-violet-600 text-white hover:bg-violet-700 inline-flex',
            )}
          >
            <Plus className="size-4" />
            {t.dashboard.addFirstAccount}
          </Link>
        </Card>
      </div>
    );
  }

  const today = new Date();

  // When the household opted into auto-detect, the cycle anchors to the
  // earliest linked income tx around the configured day rather than the
  // configured day itself. Resolved once and threaded through allowance +
  // chart so they stay in sync. Past cycles (cycleOffset != 0) keep the
  // naive day for visual stability across the navigator.
  const currentCycle = await resolveActiveBillingCycle(household, today);

  const allowance = await computeDailyAllowance(
    householdId,
    household.billingCycleStartDay,
    today,
    currentCycle,
  );

  const isStale =
    !oldestSync ||
    differenceInHours(new Date(), oldestSync) >= STALENESS_HOURS;

  const isCurrentCycle = cycleOffset === 0;
  const chartCycle = isCurrentCycle
    ? currentCycle
    : getActiveBillingCycle(
        household.billingCycleStartDay,
        subMonths(today, -cycleOffset),
      );

  const immediateCards = household.immediateChargeCards;

  const [
    donutSlices,
    trendData,
    diffData,
    txByCategory,
    categoriesForPicker,
  ] = await Promise.all([
    getCurrentCycleSpendByCategory(householdId, chartCycle, immediateCards),
    getMonthlyTrend(
      householdId,
      rangeToMonths(range),
      household.billingCycleStartDay,
    ),
    getMonthOverMonthDiff(
      householdId,
      household.billingCycleStartDay,
      today,
      immediateCards,
    ),
    getTransactionsByCategoryForCycle(householdId, chartCycle, immediateCards),
    listCategoriesForHousehold(),
  ]);
  const cycleRangeLabel = formatCycleRange(chartCycle);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.dashboard.title}</h1>
          <p className="text-slate-600 mt-1">
            {t.dashboard.welcome}, {session?.user.name}
          </p>
        </div>
        <SyncButton />
      </div>

      <StalenessBanner lastSync={oldestSync} />

      <InsightsStrip insights={insights} />

      {pendingRules > 0 && (
        <Link
          href="/recurring"
          className="block p-4 bg-violet-50 ring-1 ring-violet-200 rounded-xl hover:bg-violet-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="size-5 text-violet-600 shrink-0" />
            <span className="font-medium">
              {template(t.dashboard.reviewSuggestions, { n: pendingRules })}
            </span>
          </div>
        </Link>
      )}

      <AllowanceHero allowance={allowance} isStale={isStale} />

      <CycleMathCard allowance={allowance} />

      <DashboardCharts
        donutSlices={donutSlices}
        trendData={trendData}
        diffData={diffData}
        txByCategory={txByCategory}
        categories={categoriesForPicker}
        initialRange={range}
        cycleOffset={cycleOffset}
        cycleRangeLabel={cycleRangeLabel}
      />
    </div>
  );
}
