'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartCard } from '@/components/charts/chart-card';
import { colorForCategory } from '@/lib/charts/colors';
import { formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { DonutSlice } from '@/lib/charts/queries';

type Props = {
  slices: DonutSlice[];
};

const MAX_VISIBLE_CATEGORIES = 7;

// Visual distinction for the synthetic "no category assigned" slice. The
// system "other" category (`key='other'`, icon 📦) is what users explicitly
// pick when nothing fits — this one is the absence of any choice. Different
// concept, so it gets a different icon (❓) and is treated as a flag that
// some rows still need categorizing.
const UNCATEGORIZED_KEY = 'uncategorized';
const UNCATEGORIZED_ICON = '❓';

type ChartDatum = DonutSlice & { color: string; displayLabel: string };

export function CategoryDonutChart({ slices }: Props) {
  if (slices.length === 0 || slices.every((s) => s.value === 0)) {
    return (
      <ChartCard title={t.charts.donutTitle}>
        <p className="text-slate-500 text-center py-8">{t.charts.donutEmpty}</p>
      </ChartCard>
    );
  }

  const visible = slices.slice(0, MAX_VISIBLE_CATEGORIES);
  const others = slices.slice(MAX_VISIBLE_CATEGORIES);

  const labelMap: Record<string, string> =
    (t as unknown as { categoryLabels?: Record<string, string> })
      .categoryLabels ?? {};

  const data: ChartDatum[] = [
    ...visible.map((s) => ({
      ...s,
      // Override the (null) icon coming from a left-joined NULL category so
      // the synthetic "uncategorized" bucket doesn't visually collide with
      // the system "other" category (both would otherwise default to 📦).
      icon: s.key === UNCATEGORIZED_KEY ? UNCATEGORIZED_ICON : s.icon,
      color: colorForCategory(s.key),
      displayLabel: labelMap[s.key] ?? s.label,
    })),
    ...(others.length > 0
      ? [
          {
            key: 'others',
            label: t.charts.donutOthers,
            displayLabel: t.charts.donutOthers,
            icon: '📦',
            value: others.reduce((sum, o) => sum + o.value, 0),
            color: '#94A3B8',
          },
        ]
      : []),
  ];

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <ChartCard title={t.charts.donutTitle}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div className="relative h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="displayLabel"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-center">
            <span className="text-xs text-slate-500">
              {t.charts.donutCenterLabel}
            </span>
            <span className="text-xl font-bold tabular-nums">
              <bdi>{formatILS(total)}</bdi>
            </span>
            <span className="text-xs text-slate-500">
              {t.charts.donutCenterAmount}
            </span>
          </div>
        </div>

        <ul className="space-y-1.5 text-sm">
          {data.map((d) => (
            <li key={d.key} className="flex items-center gap-2">
              <span
                className="size-3 rounded-sm shrink-0"
                style={{ background: d.color }}
              />
              <span className="text-base shrink-0">{d.icon ?? '📦'}</span>
              <span className="flex-1 truncate text-slate-700">
                {d.displayLabel}
              </span>
              <span className="tabular-nums text-slate-500 shrink-0">
                <bdi>{formatILS(d.value)}</bdi>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

type TooltipPayload = {
  payload?: ChartDatum;
};

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  total: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0].payload;
  if (!slice) return null;
  const pct = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0';

  return (
    <div
      className="bg-white rounded-lg shadow-lg ring-1 ring-slate-200 p-3 text-sm"
      style={{ direction: 'rtl' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{slice.icon ?? '📦'}</span>
        <span className="font-medium">{slice.displayLabel}</span>
      </div>
      <div className="tabular-nums text-slate-700">
        <bdi>{formatILS(slice.value)}</bdi> ({pct}%)
      </div>
    </div>
  );
}
