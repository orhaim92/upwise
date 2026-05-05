'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/charts/chart-card';
import { CHART_AXIS, CHART_GRID } from '@/lib/charts/colors';
import { formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { CategoryDiff } from '@/lib/charts/queries';

type Props = {
  diffs: CategoryDiff[];
};

// Synthetic "no category" rows get a distinct icon so they don't blend in
// with the system "other" category (which also defaults to 📦).
const UNCATEGORIZED_KEY = 'uncategorized';
const UNCATEGORIZED_ICON = '❓';

export function CategoryDiffChart({ diffs }: Props) {
  const labelMap: Record<string, string> =
    (t as unknown as { categoryLabels?: Record<string, string> })
      .categoryLabels ?? {};

  if (diffs.length === 0 || diffs.every((d) => d.delta === 0)) {
    return (
      <ChartCard title={t.charts.diffTitle} subtitle={t.charts.diffSubtitle}>
        <p className="text-slate-500 text-center py-8">
          {t.charts.diffNoChange}
        </p>
      </ChartCard>
    );
  }

  const data = diffs.map((d) => {
    const icon =
      d.key === UNCATEGORIZED_KEY ? UNCATEGORIZED_ICON : (d.icon ?? '📦');
    return {
      key: d.key,
      label: `${icon} ${labelMap[d.key] ?? d.key}`,
      previous: d.previous,
      current: d.current,
      delta: d.delta,
    };
  });

  return (
    <ChartCard title={t.charts.diffTitle} subtitle={t.charts.diffSubtitle}>
      <div className="h-72 pe-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 60, left: 5, bottom: 5 }}
            barCategoryGap="25%"
          >
            <CartesianGrid
              stroke={CHART_GRID}
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: CHART_AXIS }}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 12, fill: '#334155' }}
              axisLine={false}
              tickLine={false}
              width={120}
              orientation="right"
            />
            <Tooltip content={<DiffTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', direction: 'rtl' }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="previous"
              name={t.charts.diffPrevious}
              fill="#CBD5E1"
              radius={[0, 4, 4, 0]}
            />
            <Bar
              dataKey="current"
              name={t.charts.diffCurrent}
              fill="#7C3AED"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

type TooltipEntry = {
  payload: { previous: number; current: number; delta: number };
};

function DiffTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div
      className="bg-white rounded-lg shadow-lg ring-1 ring-slate-200 p-3 text-sm space-y-1"
      style={{ direction: 'rtl' }}
    >
      <div className="font-medium mb-1.5">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-slate-600">{t.charts.diffPrevious}:</span>
        <span className="tabular-nums">
          <bdi>{formatILS(d.previous)}</bdi>
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-slate-600">{t.charts.diffCurrent}:</span>
        <span className="tabular-nums">
          <bdi>{formatILS(d.current)}</bdi>
        </span>
      </div>
      <div className="flex justify-between gap-4 pt-1 mt-1 border-t border-slate-100">
        <span className="text-slate-600">{t.charts.diffChangeLabel}:</span>
        <span
          className={`tabular-nums font-medium ${
            d.delta > 0
              ? 'text-rose-600'
              : d.delta < 0
                ? 'text-emerald-600'
                : ''
          }`}
        >
          <bdi>
            {d.delta > 0 ? '+' : ''}
            {formatILS(d.delta)}
          </bdi>
        </span>
      </div>
    </div>
  );
}
