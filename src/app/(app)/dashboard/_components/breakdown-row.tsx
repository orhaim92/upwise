'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, ChevronUp, MoreHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { formatILS } from '@/lib/format';
import { t } from '@/lib/i18n/he';
import type { BreakdownItem } from '@/lib/cycles/daily-allowance';
import {
  skipRuleForCycle,
  unskipRuleForCycle,
} from '../../recurring/skip-actions';
import { deleteRule } from '../../recurring/actions';
import { removeManualItem } from '../manual-actions';

type Props = {
  label: string;
  totalAmount: number;
  items: BreakdownItem[];
  signed?: '+' | '-';
  positive?: boolean;
  bold?: boolean;
  emptyMessage?: string;
};

export function BreakdownRow({
  label,
  totalAmount,
  items,
  signed,
  positive,
  bold,
  emptyMessage,
}: Props) {
  const [open, setOpen] = useState(false);
  const sign = signed ?? '';
  const display = `${sign}${formatILS(totalAmount)}`;
  const isClickable = items.length > 0 || !!emptyMessage;

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        onClick={() => isClickable && setOpen((o) => !o)}
        disabled={!isClickable}
        type="button"
        className={`flex items-center justify-between w-full py-2 px-2 -mx-2 rounded transition-colors ${
          isClickable ? 'hover:bg-slate-50' : 'cursor-default'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-700">{label}</span>
          {items.length > 0 && (
            <span className="text-xs text-slate-400">({items.length})</span>
          )}
          {isClickable &&
            (open ? (
              <ChevronUp className="size-4 text-slate-400" />
            ) : (
              <ChevronDown className="size-4 text-slate-400" />
            ))}
        </div>
        <span
          className={`tabular-nums ${bold ? 'font-bold' : ''} ${
            positive ? 'text-emerald-600' : ''
          }`}
        >
          <bdi>{display}</bdi>
        </span>
      </button>

      {open && (
        <div className="ps-4 pe-2 pb-2 space-y-1">
          {items.length === 0 ? (
            <p className="text-xs text-slate-500 py-1">
              {emptyMessage ?? t.allowance.noItems}
            </p>
          ) : (
            items.map((item) => (
              <BreakdownItemRow key={item.id} item={item} signed={sign} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BreakdownItemRow({
  item,
  signed,
}: {
  item: BreakdownItem;
  signed: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleSkipRule() {
    startTransition(async () => {
      const r = await skipRuleForCycle({ ruleId: item.id });
      if (!r.ok) toast.error(r.error);
      else toast.success(t.allowance.ruleSkipped);
    });
  }

  function handleUnskipRule() {
    startTransition(async () => {
      const r = await unskipRuleForCycle({ ruleId: item.id });
      if (!r.ok) toast.error(r.error);
      else toast.success(t.allowance.ruleUnskipped);
    });
  }

  function handleDeleteRule() {
    if (!confirm(t.recurring.deleteConfirm)) return;
    startTransition(async () => {
      const r = await deleteRule(item.id);
      if (!r.ok) toast.error(r.error);
      else toast.success(t.recurring.ruleDeleted);
    });
  }

  function handleRemoveManual() {
    startTransition(async () => {
      const r = await removeManualItem(item.id);
      if (!r.ok) toast.error(r.error);
      else toast.success(t.allowance.manualItemRemoved);
    });
  }

  const hasMenu = item.source === 'recurring' || item.source === 'manual';
  const isSkipped = item.materializationReason === 'user_skip';

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className="truncate text-slate-700"
          style={{ unicodeBidi: 'plaintext' }}
        >
          <bdi>{item.name}</bdi>
        </span>

        {item.materialized && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 shrink-0">
            {item.materializationReason === 'user_skip'
              ? t.allowance.skipped
              : t.allowance.matched}
          </span>
        )}

        {item.note && (
          <span className="text-xs text-slate-400 truncate">{item.note}</span>
        )}
      </div>

      <span className="tabular-nums text-slate-700 shrink-0">
        <bdi>{`${signed}${formatILS(item.amount)}`}</bdi>
      </span>

      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t.common.more}
                disabled={pending}
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {item.source === 'recurring' && !isSkipped && !item.materialized && (
              <DropdownMenuItem onClick={handleSkipRule}>
                <X className="size-4 me-2" />
                {t.allowance.skipForCycle}
              </DropdownMenuItem>
            )}
            {item.source === 'recurring' && isSkipped && (
              <DropdownMenuItem onClick={handleUnskipRule}>
                {t.allowance.unskip}
              </DropdownMenuItem>
            )}
            {item.source === 'recurring' && (
              <DropdownMenuItem
                onClick={handleDeleteRule}
                className="text-rose-600"
              >
                <Trash2 className="size-4 me-2" />
                {t.allowance.removeForever}
              </DropdownMenuItem>
            )}
            {item.source === 'manual' && (
              <DropdownMenuItem
                onClick={handleRemoveManual}
                className="text-rose-600"
              >
                <Trash2 className="size-4 me-2" />
                {t.allowance.manualItemRemove}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
