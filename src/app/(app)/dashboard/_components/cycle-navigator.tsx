'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { t } from '@/lib/i18n/he';

type Props = {
  // 0 = current cycle, -1 = previous cycle, etc. Always <= 0.
  offset: number;
  // Already-formatted label for the cycle being viewed (e.g. "8.4 — 7.5").
  cycleRangeLabel: string;
};

// Steps backward/forward through billing cycles. Updates `?cycleOffset=N`
// in the URL so the server-side dashboard re-fetches donut + forecast for
// the targeted cycle. Forward step is disabled at offset 0 (we never want
// to look at a future cycle that hasn't happened yet).
export function CycleNavigator({ offset, cycleRangeLabel }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setOffset(next: number) {
    startTransition(() => {
      const search = new URLSearchParams(params);
      if (next === 0) search.delete('cycleOffset');
      else search.set('cycleOffset', String(next));
      const qs = search.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const isCurrent = offset === 0;
  const label = isCurrent
    ? t.charts.cycleNavCurrent
    : cycleRangeLabel;

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl bg-white ring-1 ring-slate-200 px-3 py-2 ${
        isPending ? 'opacity-60 transition-opacity' : ''
      }`}
    >
      {/* Older cycle (offset goes more negative) */}
      <button
        type="button"
        onClick={() => setOffset(offset - 1)}
        aria-label={t.charts.cycleNavPrev}
        title={t.charts.cycleNavPrev}
        className="size-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
      >
        <ChevronRight className="size-4" />
      </button>

      <div className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
        <span className="font-medium text-sm tabular-nums truncate">
          {label}
        </span>
        {!isCurrent && (
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="text-[11px] text-violet-600 hover:text-violet-700 inline-flex items-center gap-1"
          >
            <RotateCcw className="size-3" />
            {t.charts.cycleNavBackToCurrent}
          </button>
        )}
      </div>

      {/* Newer cycle (offset moves toward 0). Disabled at current. */}
      <button
        type="button"
        onClick={() => setOffset(offset + 1)}
        disabled={isCurrent}
        aria-label={t.charts.cycleNavNext}
        title={t.charts.cycleNavNext}
        className="size-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors shrink-0"
      >
        <ChevronLeft className="size-4" />
      </button>
    </div>
  );
}
