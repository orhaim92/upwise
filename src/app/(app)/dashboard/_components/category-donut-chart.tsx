'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { ChartCard } from '@/components/charts/chart-card';
import { colorForCategory } from '@/lib/charts/colors';
import { formatDate, formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { CategoryTxStub, DonutSlice } from '@/lib/charts/queries';

type Props = {
  slices: DonutSlice[];
  // Per-category transaction list (description + amount + date). When set,
  // hovering a slice swaps the legend area to a detail panel listing the
  // hovered category's transactions instead of the floating Recharts tooltip.
  txByCategory?: Record<string, CategoryTxStub[]>;
};

// Both 'uncategorized' (no category set) and 'other' (the user's "doesn't
// fit elsewhere" pick) are catch-all buckets. Surfacing them as separate
// slices was confusing — collapse them under the system 'other' label.
const UNCATEGORIZED_KEY = 'uncategorized';
const OTHER_KEY = 'other';

function mergeUncategorizedIntoOther(slices: DonutSlice[]): DonutSlice[] {
  const uncategorized = slices.find((s) => s.key === UNCATEGORIZED_KEY);
  if (!uncategorized) return slices;

  // CRITICAL: never mutate the input objects. The donut re-renders on every
  // hover (state change), and `slices` comes from the parent's server-fetched
  // data. Mutating `other.value` made each re-render ADD `uncategorized.value`
  // to the shared object, so the total kept growing on every hover.
  let otherFound = false;
  const out: DonutSlice[] = [];
  for (const s of slices) {
    if (s.key === UNCATEGORIZED_KEY) continue;
    if (s.key === OTHER_KEY) {
      out.push({ ...s, value: s.value + uncategorized.value });
      otherFound = true;
    } else {
      out.push(s);
    }
  }
  if (!otherFound) {
    out.push({
      key: OTHER_KEY,
      label: OTHER_KEY,
      icon: '📦',
      value: uncategorized.value,
    });
  }
  // Re-sort by value desc so the merged 'other' lands in its true position.
  return out.sort((a, b) => b.value - a.value);
}

type ChartDatum = DonutSlice & { color: string; displayLabel: string };

export function CategoryDonutChart({ slices, txByCategory }: Props) {
  // Click-to-expand: clicking a slice or legend row pins the detail panel
  // until the user clicks the close button (or clicks the same slice again).
  // Switched away from hover because users wanted to scroll the transaction
  // list, and hover-out kept dismissing the panel mid-scroll.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Keep the LAST active slice rendered during the close transition so the
  // panel content doesn't disappear before the height animation finishes.
  const [renderKey, setRenderKey] = useState<string | null>(null);

  useEffect(() => {
    if (activeKey) setRenderKey(activeKey);
  }, [activeKey]);

  function toggleSlice(key: string) {
    setActiveKey((prev) => (prev === key ? null : key));
  }
  function closeDetail() {
    setActiveKey(null);
  }

  if (slices.length === 0 || slices.every((s) => s.value === 0)) {
    return (
      <ChartCard title={t.charts.donutTitle}>
        <p className="text-slate-500 text-center py-8">{t.charts.donutEmpty}</p>
      </ChartCard>
    );
  }

  const merged = mergeUncategorizedIntoOther(slices);

  const labelMap: Record<string, string> =
    (t as unknown as { categoryLabels?: Record<string, string> })
      .categoryLabels ?? {};

  // Show every category — no top-N rollup. Tiny slices are still useful for
  // the user; long legend scrolls inside the card.
  const data: ChartDatum[] = merged.map((s) => ({
    ...s,
    color: colorForCategory(s.key),
    displayLabel: labelMap[s.key] ?? s.label,
  }));

  const total = data.reduce((s, d) => s + d.value, 0);
  const isOpen = activeKey !== null;
  // During the close transition we still want the panel content rendered, so
  // we resolve the slice from `renderKey` (sticky last-active) instead of
  // `activeKey` (which already flipped to null when the user clicked close).
  const renderSlice = renderKey
    ? (data.find((d) => d.key === renderKey) ?? null)
    : null;
  const renderTxs = renderSlice
    ? (pickTxsForSlice(renderSlice.key, txByCategory) ?? [])
    : [];

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
                innerRadius={72}
                outerRadius={100}
                paddingAngle={2}
                strokeWidth={0}
                cursor="pointer"
                onClick={(_payload, index) => {
                  const item = data[index];
                  if (item) toggleSlice(item.key);
                }}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={entry.color}
                    stroke={
                      activeKey === entry.key ? '#0F172A' : 'transparent'
                    }
                    strokeWidth={activeKey === entry.key ? 2 : 0}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center label. text-base + max-w-[88%] keeps the amount inside
              the inner radius even for 6-digit totals. */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-center px-2">
            <span className="text-xs text-slate-500">
              {t.charts.donutCenterLabel}
            </span>
            <span className="text-base font-bold tabular-nums leading-tight max-w-[88%] truncate">
              <bdi>{formatILS(total)}</bdi>
            </span>
            <span className="text-xs text-slate-500">
              {t.charts.donutCenterAmount}
            </span>
          </div>
        </div>

        {/* Legend column — always visible. Clicking a row toggles the detail
            panel; the active row gets highlighted so the user knows what
            they're inspecting. `title` on each row gives a hover affordance
            saying "click for details". */}
        <div className="max-h-64 overflow-y-auto pe-1">
          <ul className="space-y-1.5 text-sm">
            {data.map((d) => {
              const isActive = activeKey === d.key;
              return (
                <li key={d.key}>
                  <button
                    type="button"
                    onClick={() => toggleSlice(d.key)}
                    title={t.charts.clickForDetails}
                    className={`w-full flex items-center gap-2 rounded px-1 -mx-1 py-0.5 cursor-pointer transition-colors text-start ${
                      isActive
                        ? 'bg-violet-50 ring-1 ring-violet-200'
                        : 'hover:bg-slate-50'
                    }`}
                  >
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
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Smoothly-expanding detail panel below the chart. Uses the
          grid-template-rows 0fr → 1fr trick so the height animates without
          us needing to know the content size. The inner div has min-h-0 so
          it can shrink below content height during the close transition. */}
      <div
        className={`grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
          isOpen
            ? 'grid-rows-[1fr] opacity-100 mt-4'
            : 'grid-rows-[0fr] opacity-0 mt-0'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="min-h-0 overflow-hidden">
          {renderSlice && (
            <div className="pt-4 border-t border-slate-100">
              <CategoryDetailPanel
                slice={renderSlice}
                total={total}
                txs={renderTxs}
                onClose={closeDetail}
              />
            </div>
          )}
        </div>
      </div>
    </ChartCard>
  );
}

function CategoryDetailPanel({
  slice,
  total,
  txs,
  onClose,
}: {
  slice: ChartDatum;
  total: number;
  txs: CategoryTxStub[];
  onClose: () => void;
}) {
  const pct = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0';
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="size-3 rounded-sm shrink-0"
          style={{ background: slice.color }}
        />
        <span className="text-lg">{slice.icon ?? '📦'}</span>
        <span className="font-medium flex-1">{slice.displayLabel}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="size-6 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="tabular-nums text-slate-700 mb-2">
        <bdi>{formatILS(slice.value)}</bdi>{' '}
        <span className="text-slate-500">({pct}%)</span>
      </div>
      {txs.length > 0 ? (
        <ul className="space-y-1 text-xs border-t border-slate-100 pt-2">
          {txs.slice(0, 30).map((tx, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between gap-3"
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
              <span className="tabular-nums text-slate-600 shrink-0">
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

// Donut renders some synthetic keys ('other' merged with 'uncategorized').
// Resolve those back to the real categoryKey buckets in `txByCategory`.
function pickTxsForSlice(
  sliceKey: string,
  txByCategory?: Record<string, CategoryTxStub[]>,
): CategoryTxStub[] | undefined {
  if (!txByCategory) return undefined;
  if (sliceKey === OTHER_KEY) {
    const a = txByCategory[OTHER_KEY] ?? [];
    const b = txByCategory[UNCATEGORIZED_KEY] ?? [];
    return [...a, ...b].sort((x, y) => y.amount - x.amount);
  }
  return txByCategory[sliceKey];
}
