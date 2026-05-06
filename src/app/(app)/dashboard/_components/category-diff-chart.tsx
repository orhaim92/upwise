'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/charts/chart-card';
import { CHART_AXIS, CHART_GRID } from '@/lib/charts/colors';
import { formatDate, formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { CategoryDiff, CategoryTxStub } from '@/lib/charts/queries';

type Props = {
  diffs: CategoryDiff[];
  // Per-category transaction list for the current cycle; surfaces in the
  // hover tooltip so the user can see what's in each category.
  txByCategory?: Record<string, CategoryTxStub[]>;
};

// 'uncategorized' (no category set) and 'other' (user's catch-all pick) are
// both "doesn't fit elsewhere" buckets — collapse them under 'other' so the
// chart isn't cluttered with two near-identical entries.
const UNCATEGORIZED_KEY = 'uncategorized';
const OTHER_KEY = 'other';

function mergeUncategorizedIntoOther(diffs: CategoryDiff[]): CategoryDiff[] {
  const uncategorized = diffs.find((d) => d.key === UNCATEGORIZED_KEY);
  if (!uncategorized) return diffs;

  // Same mutation guard as in donut: never edit the input objects in place.
  // Re-renders would otherwise compound the merge into 'other' on every
  // hover, inflating the totals.
  let otherFound = false;
  const out: CategoryDiff[] = [];
  for (const d of diffs) {
    if (d.key === UNCATEGORIZED_KEY) continue;
    if (d.key === OTHER_KEY) {
      const previous = d.previous + uncategorized.previous;
      const current = d.current + uncategorized.current;
      out.push({
        ...d,
        previous,
        current,
        delta: current - previous,
        pctChange: previous > 0 ? ((current - previous) / previous) * 100 : null,
      });
      otherFound = true;
    } else {
      out.push(d);
    }
  }
  if (!otherFound) {
    out.push({ ...uncategorized, key: OTHER_KEY, icon: '📦' });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function CategoryDiffChart({ diffs, txByCategory }: Props) {
  // Click-to-expand: clicking a bar pins the detail panel. Same UX as the
  // donut so users have one mental model for "drill into a category".
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Keep the LAST active row rendered during the close transition so the
  // panel content stays visible until the height animation finishes.
  const [renderKey, setRenderKey] = useState<string | null>(null);

  useEffect(() => {
    if (activeKey) setRenderKey(activeKey);
  }, [activeKey]);

  function toggleRow(key: string) {
    setActiveKey((prev) => (prev === key ? null : key));
  }
  function closeDetail() {
    setActiveKey(null);
  }

  const labelMap: Record<string, string> =
    (t as unknown as { categoryLabels?: Record<string, string> })
      .categoryLabels ?? {};

  const merged = mergeUncategorizedIntoOther(diffs);

  if (merged.length === 0 || merged.every((d) => d.delta === 0)) {
    return (
      <ChartCard title={t.charts.diffTitle} subtitle={t.charts.diffSubtitle}>
        <p className="text-slate-500 text-center py-8">
          {t.charts.diffNoChange}
        </p>
      </ChartCard>
    );
  }

  const data = merged.map((d) => ({
    key: d.key,
    label: `${d.icon ?? '📦'} ${labelMap[d.key] ?? d.key}`,
    previous: d.previous,
    current: d.current,
    delta: d.delta,
  }));

  // The merged 'other' row absorbed transactions from BOTH 'other' and
  // 'uncategorized'. Pre-build the merged list so the tooltip doesn't have to.
  const txMap: Record<string, CategoryTxStub[]> = txByCategory
    ? {
        ...txByCategory,
        other: [
          ...(txByCategory['other'] ?? []),
          ...(txByCategory['uncategorized'] ?? []),
        ].sort((a, b) => b.amount - a.amount),
      }
    : {};

  // Each row gets ~44px of vertical space so the bars stay legible. Capped at
  // ~520px viewport height; longer lists scroll vertically inside the card.
  const innerHeight = Math.max(220, Math.min(520, data.length * 44 + 40));

  return (
    <ChartCard title={t.charts.diffTitle} subtitle={t.charts.diffSubtitle}>
      <div className="pe-3 max-h-[520px] overflow-y-auto" style={{ height: innerHeight }}>
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
              // Force every category label to render. Without this, Recharts
              // auto-decimates labels when the chart can't fit them all
              // (1-row-on, 1-row-off pattern), so half the categories looked
              // unlabeled. The card's per-row height (44px) ensures there's
              // always room for the text now.
              interval={0}
            />
            {/* No Recharts <Tooltip>. We render a sticky panel below
                the chart on click — Recharts' floating tooltip auto-hides
                when the cursor leaves the bar, blocking long-list scroll. */}
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
              cursor="pointer"
              onClick={(payload) => {
                const key = (payload as { key?: string })?.key;
                if (key) toggleRow(key);
              }}
            />
            <Bar
              dataKey="current"
              name={t.charts.diffCurrent}
              fill="#7C3AED"
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              onClick={(payload) => {
                const key = (payload as { key?: string })?.key;
                if (key) toggleRow(key);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Subtle hint so the click affordance is discoverable. */}
      <p className="text-[11px] text-slate-400 mt-2 text-center">
        {t.charts.clickForDetails}
      </p>

      {/* Smoothly-expanding detail panel below the chart. Same animation
          pattern as the donut. */}
      {(() => {
        const isOpen = activeKey !== null;
        const row = renderKey ? data.find((d) => d.key === renderKey) : null;
        return (
          <div
            className={`grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
              isOpen
                ? 'grid-rows-[1fr] opacity-100 mt-4'
                : 'grid-rows-[0fr] opacity-0 mt-0'
            }`}
            aria-hidden={!isOpen}
          >
            <div className="min-h-0 overflow-hidden">
              {row && (
                <div className="pt-4 border-t border-slate-100">
                  <DiffDetailPanel
                    row={row}
                    label={row.label}
                    txs={txMap[row.key] ?? []}
                    onClose={closeDetail}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </ChartCard>
  );
}

function DiffDetailPanel({
  row,
  label,
  txs,
  onClose,
}: {
  row: { key: string; previous: number; current: number; delta: number };
  label: string;
  txs: CategoryTxStub[];
  onClose: () => void;
}) {
  return (
    <div className="text-sm" style={{ direction: 'rtl' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium flex-1">{label}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="size-6 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs mb-3">
        <div>
          <div className="text-slate-500">{t.charts.diffPrevious}</div>
          <div className="tabular-nums font-medium mt-0.5">
            <bdi>{formatILS(row.previous)}</bdi>
          </div>
        </div>
        <div>
          <div className="text-slate-500">{t.charts.diffCurrent}</div>
          <div className="tabular-nums font-medium mt-0.5">
            <bdi>{formatILS(row.current)}</bdi>
          </div>
        </div>
        <div>
          <div className="text-slate-500">{t.charts.diffChangeLabel}</div>
          <div
            className={`tabular-nums font-medium mt-0.5 ${
              row.delta > 0
                ? 'text-rose-600'
                : row.delta < 0
                  ? 'text-emerald-600'
                  : ''
            }`}
          >
            <bdi>
              {row.delta > 0 ? '+' : ''}
              {formatILS(row.delta)}
            </bdi>
          </div>
        </div>
      </div>
      {txs.length > 0 ? (
        <ul className="space-y-1 max-h-56 overflow-y-auto pe-1 -me-1 border-t border-slate-100 pt-2">
          {txs.slice(0, 30).map((tx, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="flex-1 min-w-0">
                <span
                  className="block truncate text-slate-700"
                  style={{ unicodeBidi: 'plaintext' }}
                >
                  <bdi>{tx.description}</bdi>
                </span>
                <span className="block text-[10px] text-slate-400 tabular-nums">
                  {formatDate(tx.date)}
                </span>
              </span>
              <span className="tabular-nums text-slate-500 shrink-0">
                <bdi>{formatILS(tx.amount)}</bdi>
              </span>
            </li>
          ))}
          {txs.length > 30 && (
            <li className="text-[11px] text-slate-400 text-center pt-1">
              + {txs.length - 30}
            </li>
          )}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 border-t border-slate-100 pt-2">
          —
        </p>
      )}
    </div>
  );
}
