'use client';

import { useTransition } from 'react';
import { Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { dismissInsight } from '../insight-actions';
import { t } from '@/lib/i18n/he';

type Insight = {
  id: string;
  type: string;
  urgency: number;
  title: string;
  body: string;
};

export function InsightsStrip({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="space-y-2">
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const [pending, startTransition] = useTransition();

  function handleDismiss() {
    startTransition(async () => {
      const r = await dismissInsight(insight.id);
      if (!r.ok) toast.error(r.error ?? t.advisor.errorGeneric);
    });
  }

  // High-urgency = rose accent (matches the over-budget banner style on
  // the same dashboard); medium / low = violet (the brand AI accent).
  const isHighUrgency = insight.urgency >= 8;
  const wrapperClass = isHighUrgency
    ? 'bg-rose-50 border-rose-200 text-rose-900'
    : 'bg-violet-50 border-violet-200 text-violet-900';
  const iconClass = isHighUrgency ? 'text-rose-600' : 'text-violet-600';

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border ${wrapperClass}`}
    >
      <Sparkles className={`size-5 shrink-0 mt-0.5 ${iconClass}`} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{insight.title}</p>
        <p className="text-sm mt-1 opacity-90">{insight.body}</p>
      </div>
      <button
        onClick={handleDismiss}
        disabled={pending}
        className="p-1 hover:bg-white/50 rounded transition-colors"
        aria-label={t.advisor.insightDismiss}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
