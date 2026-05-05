'use client';

import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  CategoryDiff,
  DonutSlice,
  ForecastPoint,
  TrendPoint,
} from '@/lib/charts/queries';
import type { ChartRange } from './range-picker';
import { CycleNavigator } from './cycle-navigator';

// Recharts' ResponsiveContainer measures DOM via ResizeObserver, which only
// works after mount. With SSR enabled it renders at 0×0 on the server and
// often fails to redraw on the client, leaving empty chart cards. Skipping
// SSR for chart components forces a single client-side render where the
// container has real dimensions.
const CategoryDonutChart = dynamic(
  () => import('./category-donut-chart').then((m) => m.CategoryDonutChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const CycleForecastChart = dynamic(
  () => import('./cycle-forecast-chart').then((m) => m.CycleForecastChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const MonthlyTrendChart = dynamic(
  () => import('./monthly-trend-chart').then((m) => m.MonthlyTrendChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const CategoryDiffChart = dynamic(
  () => import('./category-diff-chart').then((m) => m.CategoryDiffChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="h-5 w-40 bg-slate-100 rounded mb-4 animate-pulse" />
      <div className="h-64 bg-slate-50 rounded animate-pulse" />
    </div>
  );
}

type Props = {
  donutSlices: DonutSlice[];
  forecastPoints: ForecastPoint[];
  forecastExpectedTotal?: number;
  forecastTodayLabel?: string;
  trendData: TrendPoint[];
  diffData: CategoryDiff[];
  initialRange: ChartRange;
  cycleOffset: number;
  cycleRangeLabel: string;
};

export function DashboardCharts({
  donutSlices,
  forecastPoints,
  forecastExpectedTotal,
  forecastTodayLabel,
  trendData,
  diffData,
  initialRange,
  cycleOffset,
  cycleRangeLabel,
}: Props) {
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleRangeChange(next: ChartRange) {
    setRange(next);
    startTransition(() => {
      // Preserve any other query params (e.g. cycleOffset) so changing the
      // trend range doesn't snap the donut/forecast back to the current cycle.
      const params = new URLSearchParams(searchParams);
      params.set('range', next);
      router.replace(`/dashboard?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className={`space-y-4 ${isPending ? 'opacity-60 transition-opacity' : ''}`}
    >
      <CycleNavigator
        offset={cycleOffset}
        cycleRangeLabel={cycleRangeLabel}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryDonutChart slices={donutSlices} />
        <CycleForecastChart
          points={forecastPoints}
          expectedTotal={forecastExpectedTotal}
          todayLabel={forecastTodayLabel}
        />
      </div>

      <MonthlyTrendChart
        data={trendData}
        range={range}
        onRangeChange={handleRangeChange}
      />

      <CategoryDiffChart diffs={diffData} />
    </div>
  );
}
