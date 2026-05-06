'use client';

import { format } from 'date-fns';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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
import { formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { ForecastPoint } from '@/lib/charts/queries';

type Props = {
  points: ForecastPoint[];
  // Recurring + realized expenses for the current cycle. Omit for past
  // cycles — there's no "expected vs actual" anymore once a cycle is closed,
  // and drawing a redundant line at the realized peak is just noise.
  expectedTotal?: number;
  // Formatted date for today's reference line. Omit for past cycles
  // (the "today" marker doesn't apply when the whole cycle is in the past).
  todayLabel?: string;
};

export function CycleForecastChart({
  points,
  expectedTotal,
  todayLabel,
}: Props) {
  if (points.length === 0) {
    return (
      <ChartCard
        title={t.charts.forecastTitle}
        subtitle={t.charts.forecastSubtitle}
      >
        <p className="text-slate-500 text-center py-8">
          {t.charts.donutEmpty}
        </p>
      </ChartCard>
    );
  }

  const chartData = points.map((p) => ({
    day: p.day,
    dayLabel: format(new Date(p.day), 'd.M'),
    actual: p.actual,
    projected: p.projected,
  }));

  const tickInterval = Math.max(1, Math.floor(chartData.length / 6));

  // Past cycles have no future days — every point is realized, so the
  // projected line literally retraces the actual line. Hide it (and its
  // legend entry) so the chart reads as a clean cumulative-spend history
  // instead of a misleading "forecast that matches reality perfectly."
  const hasFutureDays = points.some((p) => p.actual === null);

  return (
    <ChartCard
      title={t.charts.forecastTitle}
      subtitle={t.charts.forecastSubtitle}
    >
      {/* pe-3 prevents tooltip overflow at the right edge in RTL */}
      <div className="h-64 pe-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              stroke={CHART_GRID}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="dayLabel"
              tick={{ fontSize: 11, fill: CHART_AXIS }}
              interval={tickInterval - 1}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: CHART_AXIS }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<ForecastTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', direction: 'rtl' }}
              iconType="circle"
              iconSize={8}
            />
            {expectedTotal !== undefined && expectedTotal > 0 && (
              <ReferenceLine
                y={expectedTotal}
                stroke="#94A3B8"
                strokeDasharray="4 4"
                label={{
                  value: t.charts.forecastBudget,
                  position: 'insideTopRight',
                  fill: '#64748B',
                  fontSize: 11,
                }}
              />
            )}
            {todayLabel && (
              <ReferenceLine
                x={todayLabel}
                stroke="#7C3AED"
                strokeDasharray="2 4"
                label={{
                  value: t.charts.forecastTodayMarker,
                  position: 'top',
                  fill: '#7C3AED',
                  fontSize: 10,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="actual"
              name={t.charts.forecastActual}
              stroke={CHART_EXPENSE}
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
            />
            {hasFutureDays && (
              <Line
                type="monotone"
                dataKey="projected"
                name={t.charts.forecastProjected}
                stroke={CHART_PROJECTION}
                strokeDasharray="6 3"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

type TooltipEntry = {
  dataKey: string;
  value: number | null;
  color: string;
  name: string;
};

function ForecastTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload) return null;

  return (
    <div
      className="bg-white rounded-lg shadow-lg ring-1 ring-slate-200 p-3 text-sm"
      style={{ direction: 'rtl' }}
    >
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p) =>
        p.value === null ? null : (
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
        ),
      )}
    </div>
  );
}
