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
import { InlineCategoryPicker } from './inline-category-picker';

type Category = {
  id: string;
  key: string;
  icon: string | null;
  color: string | null;
};

type Props = {
  diffs: CategoryDiff[];
  // Per-category transaction list for the current cycle; surfaces in the
  // expanded panel so the user can see what's in each category.
  txByCategory?: Record<string, CategoryTxStub[]>;
  // Available categories for the inline picker shown per transaction row.
  categories?: Category[];
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

export function CategoryDiffChart({
  diffs,
  txByCategory,
  categories,
}: Props) {
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
    label: wrapRtl(`${labelMap[d.key] ?? d.key} ${d.icon ?? '📦'}`),
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
      {/* Suppress every focus outline browsers paint on Recharts elements
          when a bar is clicked. The bar-rectangle path AND the SVG surface
          itself can receive focus depending on the browser; both produced
          a visible dark frame around the plot area on click. The
          !important is unfortunate but Recharts injects inline outline-* on
          some browsers so a normal selector loses the cascade. */}
      <style>{`
        .recharts-wrapper :focus,
        .recharts-wrapper :focus-visible,
        .recharts-surface,
        .recharts-surface :focus,
        .recharts-surface :focus-visible {
          outline: none !important;
        }
      `}</style>
      {/* Negative margin-inline-start (right side in RTL) lets the chart
          bleed past the card's p-5 padding on the right edge — that 20px
          was visible empty space between the labels and the card border. */}
      <div
        className="max-h-[520px] overflow-y-auto -ms-5"
        style={{ height: innerHeight }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            // Tight right margin so labels hug the card's right edge — there
            // were ~36px of dead space (chart margin + card padding) on the
            // right that pushed the label column off-screen-end. Bars get
            // proportionally more room.
            margin={{ top: 5, right: 4, left: 4, bottom: 5 }}
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
              axisLine={false}
              tickLine={false}
              // 130px gives the longest Hebrew labels ("הוצאת מזומן",
              // "חשבונות בית") room to fit on a single line at 11px.
              width={130}
              orientation="right"
              // Right-anchor each label inside its column. Bidi consistency
              // (so short labels don't bounce around horizontally vs. long
              // ones) is handled by wrapping each label string in RLE…PDF
              // unicode controls when we build the chart data — see the
              // `wrapRtl` helper above.
              tick={{ fontSize: 11, fill: '#334155', textAnchor: 'end' }}
              // interval=0 forces every category label to render — Recharts
              // would otherwise auto-decimate (1-on/1-off) when many bars.
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
              // Visual feedback on hover: darken slightly + outline the
              // hovered bar so the user knows what they're about to click.
              activeBar={{ fill: '#94A3B8', stroke: '#475569', strokeWidth: 1 }}
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
              activeBar={{ fill: '#6D28D9', stroke: '#4C1D95', strokeWidth: 1 }}
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
                    categories={categories}
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
  categories,
  onClose,
}: {
  row: { key: string; previous: number; current: number; delta: number };
  label: string;
  txs: CategoryTxStub[];
  categories?: Category[];
  onClose: () => void;
}) {
  return (
    // Bounded height with a single scroll context. The summary header (label,
    // prev/current/delta) is sticky inside the scroll, so the user always
    // sees what they're looking at while paging through the transactions.
    <div
      className="text-sm max-h-96 overflow-y-auto pe-2 -me-2"
      style={{ direction: 'rtl' }}
    >
      <div className="sticky top-0 bg-white pb-2 -mt-1 pt-1 z-10 border-b border-slate-100 mb-3">
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
        <div className="grid grid-cols-3 gap-3 text-xs">
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
      </div>
      {txs.length > 0 ? (
        <ul className="space-y-1">
          {txs.map((tx) => (
            <li
              key={tx.id}
              className="flex items-baseline justify-between gap-2 text-xs"
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
              {categories && (
                <InlineCategoryPicker
                  transactionId={tx.id}
                  currentCategoryKey={tx.categoryKey}
                  categories={categories}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">—</p>
      )}
    </div>
  );
}

// Wrap a label string with RIGHT-TO-LEFT EMBEDDING (U+202B) +
// POP DIRECTIONAL FORMATTING (U+202C). This forces every label to be
// laid out with an explicit RTL base, regardless of which character class
// (Hebrew letter, emoji, ASCII) appears first in the source string. Without
// this wrap, the unicode bidi algorithm can flip the icon-vs-Hebrew run
// order based on which char class the label happens to start with, which
// made short and long labels right-align at slightly different X positions.
const RLE = '‫';
const PDF = '‬';
function wrapRtl(s: string): string {
  return `${RLE}${s}${PDF}`;
}
