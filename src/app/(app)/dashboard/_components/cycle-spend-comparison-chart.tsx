'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/charts/chart-card';
import {
  CHART_AXIS,
  CHART_EXPENSE,
  CHART_GRID,
  CHART_PROJECTION,
} from '@/lib/charts/colors';
import { formatILS, template } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { CycleSpendComparison } from '@/lib/charts/queries';

type Props = {
  data: CycleSpendComparison;
};

// Two horizontal bars stacked vertically:
//   Top bar (gray, dashed look): expected recurring obligations for the cycle.
//   Bottom bar: actual realized spend, split into recurring-paid + variable.
// Reading left-to-right (in RTL flipped) gives an immediate "did I overshoot?"
// answer. The day-progress label puts the totals in context.
export function CycleSpendComparisonChart({ data }: Props) {
  const { expectedRecurring, actual, actualRecurring, actualVariable } = data;

  if (expectedRecurring === 0 && actual === 0) {
    return (
      <ChartCard
        title={t.charts.comparisonTitle}
        subtitle={t.charts.comparisonSubtitle}
      >
        <p className="text-slate-500 text-center py-8">
          {t.charts.donutEmpty}
        </p>
      </ChartCard>
    );
  }

  // Two rows of data; recharts renders each as a horizontal bar.
  // Row order matters — Recharts paints first row at the TOP.
  const chartData = [
    {
      label: t.charts.comparisonExpectedRecurring,
      // Single segment, gray to read as "the bar to compare against".
      expectedRecurring,
      actualRecurring: 0,
      actualVariable: 0,
    },
    {
      label: t.charts.comparisonActualTotal,
      expectedRecurring: 0,
      actualRecurring,
      actualVariable,
    },
  ];

  return (
    <ChartCard
      title={t.charts.comparisonTitle}
      subtitle={t.charts.comparisonSubtitle}
    >
      <div className="h-48 pe-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
            barCategoryGap="40%"
          >
            <CartesianGrid
              stroke={CHART_GRID}
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: CHART_AXIS }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 12, fill: '#334155' }}
              axisLine={false}
              tickLine={false}
              width={100}
              orientation="right"
            />
            <Tooltip content={<ComparisonTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', direction: 'rtl' }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="expectedRecurring"
              name={t.charts.comparisonExpectedRecurring}
              radius={[0, 6, 6, 0]}
            >
              <Cell fill="#CBD5E1" />
              <Cell fill="transparent" />
            </Bar>
            <Bar
              dataKey="actualRecurring"
              stackId="actual"
              name={t.charts.comparisonActualRecurring}
              fill={CHART_PROJECTION}
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="actualVariable"
              stackId="actual"
              name={t.charts.comparisonActualVariable}
              fill={CHART_EXPENSE}
              radius={[0, 6, 6, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer line: totals + cycle progress */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-4">
          <span className="text-slate-500">
            {t.charts.comparisonExpectedRecurring}:
          </span>
          <span className="font-semibold tabular-nums">
            <bdi>{formatILS(expectedRecurring)}</bdi>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-500">
            {t.charts.comparisonActualTotal}:
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{ color: actual > expectedRecurring ? '#EF4444' : '#10B981' }}
          >
            <bdi>{formatILS(actual)}</bdi>
          </span>
        </div>
        <div className="text-xs text-slate-500">
          {template(t.charts.comparisonDaysProgress, {
            n: data.daysIntoCycle,
            total: data.daysInCycle,
          })}
        </div>
      </div>
    </ChartCard>
  );
}

type TooltipEntry = {
  dataKey: string;
  value: number;
  color: string;
  name: string;
};

function ComparisonTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  // Filter zero-segments so each row's tooltip is clean.
  const entries = payload.filter((p) => p.value > 0);
  if (entries.length === 0) return null;

  return (
    <div
      className="bg-white rounded-lg shadow-lg ring-1 ring-slate-200 p-3 text-sm space-y-1"
      style={{ direction: 'rtl' }}
    >
      <div className="font-medium mb-1.5">{label}</div>
      {entries.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-slate-600">{p.name}:</span>
          <span className="tabular-nums">
            <bdi>{formatILS(p.value)}</bdi>
          </span>
        </div>
      ))}
    </div>
  );
}
