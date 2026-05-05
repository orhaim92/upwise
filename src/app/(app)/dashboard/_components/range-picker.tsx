'use client';

import { t } from '@/lib/i18n/he';

export type ChartRange = '3m' | '6m' | '12m';

type Props = {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
};

export function RangePicker({ value, onChange }: Props) {
  const options: Array<{ value: ChartRange; label: string }> = [
    { value: '3m', label: t.charts.range_3m },
    { value: '6m', label: t.charts.range_6m },
    { value: '12m', label: t.charts.range_12m },
  ];

  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            value === opt.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
