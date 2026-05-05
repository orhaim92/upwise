'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  CHART_INCOME,
  CHART_NET_NEGATIVE,
  CHART_NET_POSITIVE,
} from '@/lib/charts/colors';
import { formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { TrendPoint } from '@/lib/charts/queries';
import { RangePicker, type ChartRange } from './range-picker';

type Props = {
  data: TrendPoint[];
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
};

export function MonthlyTrendChart({ data, range, onRangeChange }: Props) {
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);

  return (
    <ChartCard
      title={t.charts.trendTitle}
      action={<RangePicker value={range} onChange={onRangeChange} />}
    >
      {!hasData ? (
        <p className="text-slate-500 text-center py-12">
          {t.charts.trendNoData}
        </p>
      ) : (
        <div className="h-64 pe-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid
                stroke={CHART_GRID}
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: CHART_AXIS }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_AXIS }}
                tickFormatter={(v) => `${(Math.abs(v) / 1000).toFixed(0)}k`}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px', direction: 'rtl' }}
                iconType="circle"
                iconSize={8}
              />
              <ReferenceLine y={0} stroke={CHART_AXIS} />
              <Bar
                dataKey="income"
                name={t.charts.trendIncome}
                fill={CHART_INCOME}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="expense"
                name={t.charts.trendExpense}
                fill={CHART_EXPENSE}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasData && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <SummaryItem
              label={t.charts.trendIncome}
              value={data.reduce((s, d) => s + d.income, 0)}
              color={CHART_INCOME}
            />
            <SummaryItem
              label={t.charts.trendExpense}
              value={data.reduce((s, d) => s + d.expense, 0)}
              color={CHART_EXPENSE}
              prefix="-"
            />
            <SummaryItem
              label={t.charts.trendNet}
              value={data.reduce((s, d) => s + d.net, 0)}
              color={
                data.reduce((s, d) => s + d.net, 0) >= 0
                  ? CHART_NET_POSITIVE
                  : CHART_NET_NEGATIVE
              }
              bold
            />
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function SummaryItem({
  label,
  value,
  color,
  prefix,
  bold,
}: {
  label: string;
  value: number;
  color: string;
  prefix?: string;
  bold?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`tabular-nums mt-1 ${bold ? 'text-base font-bold' : 'text-sm font-medium'}`}
        style={{ color }}
      >
        <bdi>
          {prefix}
          {formatILS(Math.abs(value))}
        </bdi>
      </div>
    </div>
  );
}

type TooltipEntry = {
  dataKey: string;
  value: number;
  color: string;
  name: string;
};

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const income = payload.find((p) => p.dataKey === 'income')?.value ?? 0;
  const expense = payload.find((p) => p.dataKey === 'expense')?.value ?? 0;
  const net = income - expense;

  return (
    <div
      className="bg-white rounded-lg shadow-lg ring-1 ring-slate-200 p-3 text-sm space-y-1"
      style={{ direction: 'rtl' }}
    >
      <div className="font-medium mb-1.5">{label}</div>
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{ background: CHART_INCOME }}
        />
        <span className="text-slate-600">{t.charts.trendIncome}:</span>
        <span className="tabular-nums">
          <bdi>{formatILS(income)}</bdi>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="size-2 rounded-full"
          style={{ background: CHART_EXPENSE }}
        />
        <span className="text-slate-600">{t.charts.trendExpense}:</span>
        <span className="tabular-nums">
          <bdi>{formatILS(expense)}</bdi>
        </span>
      </div>
      <div className="flex items-center gap-2 pt-1 mt-1 border-t border-slate-100">
        <span className="text-slate-600">{t.charts.trendNet}:</span>
        <span
          className={`tabular-nums font-medium ${
            net >= 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          <bdi>{formatILS(net)}</bdi>
        </span>
      </div>
    </div>
  );
}
