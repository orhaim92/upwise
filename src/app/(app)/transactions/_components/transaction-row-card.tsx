'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftRight,
  CreditCard,
  Link2,
  MoreHorizontal,
  Repeat,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { formatDate, formatILS, template } from '@/lib/format';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n/he';
import type { TransactionRow } from '../queries';
import {
  findSimilarUncategorizedTransactions,
  linkTransactionToRule,
  setTransactionCategory,
  toggleSpecialFlag,
  unmarkAsCardStatement,
} from '../actions';
import { LinkRuleDialog } from './link-rule-dialog';
import { MarkAsCardStatementDialog } from './mark-as-card-statement-dialog';
import { CreateRuleFromTxDialog } from './create-rule-from-tx-dialog';
import {
  ApplyToSimilarDialog,
  type SimilarTransaction,
} from './apply-to-similar-dialog';

type Category = {
  id: string;
  key: string;
  icon: string | null;
  color: string | null;
};

type Props = {
  tx: TransactionRow;
  categories: Category[];
  compact?: boolean;
  onBulkApplied?: (
    ids: string[],
    categoryKey: string,
    categoryIcon: string | null,
  ) => void;
};

export function TransactionRowCard({
  tx,
  categories,
  compact,
  onBulkApplied,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [linkOpen, setLinkOpen] = useState(false);
  const [markCardOpen, setMarkCardOpen] = useState(false);
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [optimisticIcon, setOptimisticIcon] = useState<string | null>(
    tx.categoryIcon,
  );

  // Re-sync optimistic icon when the parent updates this tx's categoryIcon
  // — happens when a sibling row's bulk-apply patches our row in the table.
  // Without this, we'd keep showing the stale icon (📦) even though the
  // parent has the new category in its row state.
  useEffect(() => {
    setOptimisticIcon(tx.categoryIcon);
  }, [tx.categoryIcon]);

  // "Apply to similar" dialog state — populated only after a successful pick
  // that found at least one matching uncategorized transaction.
  const [similarMatches, setSimilarMatches] = useState<SimilarTransaction[]>(
    [],
  );
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarCategoryId, setSimilarCategoryId] = useState<string | null>(
    null,
  );
  const [similarCategoryKey, setSimilarCategoryKey] = useState('');
  const [similarCategoryIcon, setSimilarCategoryIcon] = useState<string | null>(
    null,
  );
  const [similarCategoryLabel, setSimilarCategoryLabel] = useState('');

  const amount = parseFloat(tx.amount);
  const isExpense = amount < 0;
  const dimmed = tx.isInternalTransfer || tx.isAggregatedCharge;

  function changeCategory(categoryId: string | null, icon: string | null) {
    setOptimisticIcon(icon);
    startTransition(async () => {
      const r = await setTransactionCategory({
        transactionId: tx.id,
        categoryId,
      });
      if (!r.ok) {
        setOptimisticIcon(tx.categoryIcon);
        toast.error(r.error ?? t.common.error);
        return;
      }
      toast.success(t.transactions.categoryUpdated);

      // After assigning a category, look for OTHER uncategorized transactions
      // with the same description and offer to apply the same category to
      // them. Skipped when clearing (categoryId=null) or picking the same
      // category that's already on the row (no-op).
      if (!categoryId) return;
      const cat = categories.find((c) => c.id === categoryId);
      if (!cat || cat.key === tx.categoryKey) return;

      const lookup = await findSimilarUncategorizedTransactions({
        transactionId: tx.id,
      });
      if (!lookup.ok) {
        toast.error(lookup.error ?? t.common.error);
        return;
      }
      if (!lookup.transactions || lookup.transactions.length === 0) return;

      setSimilarMatches(lookup.transactions);
      setSimilarCategoryId(categoryId);
      setSimilarCategoryKey(cat.key);
      setSimilarCategoryIcon(icon);
      setSimilarCategoryLabel(
        (t.categoryLabels as Record<string, string>)[cat.key] ?? cat.key,
      );
      setSimilarOpen(true);
    });
  }

  function unlinkRule() {
    startTransition(async () => {
      const r = await linkTransactionToRule({
        transactionId: tx.id,
        ruleId: null,
      });
      if (!r.ok) toast.error(r.error ?? t.common.error);
      else toast.success(t.transactions.unlinked);
    });
  }

  function toggleTransfer() {
    startTransition(async () => {
      const r = await toggleSpecialFlag({
        transactionId: tx.id,
        field: 'isInternalTransfer',
        value: !tx.isInternalTransfer,
      });
      if (!r.ok) toast.error(r.error ?? t.common.error);
      else
        toast.success(
          tx.isInternalTransfer
            ? t.transactions.unmarkedAsTransfer
            : t.transactions.markedAsTransfer,
        );
    });
  }

  function unmarkCard() {
    startTransition(async () => {
      const r = await unmarkAsCardStatement(tx.id);
      if (!r.ok) toast.error(r.error ?? t.common.error);
      else {
        toast.success(t.transactions.cardStatementUnmarked);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-3 hover:bg-slate-50 transition-colors',
          compact ? 'p-2.5' : 'p-4',
          dimmed && !compact && 'opacity-60',
        )}
      >
        <Popover>
          <PopoverTrigger
            type="button"
            disabled={pending}
            aria-label={t.transactions.chooseCategory}
            suppressHydrationWarning
            className={cn(
              'rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0 transition-colors',
              compact ? 'size-8 text-base' : 'size-10 text-lg',
              pending && 'opacity-50',
            )}
          >
            {optimisticIcon ?? '📦'}
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3">
            <p className="text-xs font-semibold text-slate-600 mb-2">
              {t.transactions.chooseCategory}
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {categories.map((cat) => {
                const isSelected = cat.key === tx.categoryKey;
                const label =
                  (t.categoryLabels as Record<string, string>)[cat.key] ??
                  cat.key;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => changeCategory(cat.id, cat.icon)}
                    title={label}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-100 transition-colors',
                      isSelected && 'bg-violet-50 ring-1 ring-violet-300',
                    )}
                  >
                    <span className="text-lg">{cat.icon ?? '📦'}</span>
                    <span className="text-[10px] text-slate-600 truncate w-full text-center">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => changeCategory(null, null)}
              className="mt-3 w-full text-xs text-slate-500 hover:text-slate-700 py-1"
            >
              {t.transactions.clearCategory}
            </button>
          </PopoverContent>
        </Popover>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                'font-medium truncate',
                compact && 'text-sm',
              )}
              style={{ unicodeBidi: 'plaintext' }}
            >
              <bdi>{tx.description}</bdi>
            </p>
            {tx.isInternalTransfer && (
              <ArrowLeftRight
                className="size-3.5 text-slate-400 shrink-0"
                aria-label={t.transactions.internalTransfer}
              />
            )}
            {tx.isAggregatedCharge && (
              <CreditCard
                className="size-3.5 text-violet-500 shrink-0"
                aria-label={t.transactions.aggregatedCharge}
              />
            )}
            {tx.recurringRuleId && (
              <Repeat
                className="size-3.5 text-violet-500 shrink-0"
                aria-label={t.recurring.title}
              />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
            <span>{formatDate(tx.date)}</span>
            {!compact && (
              <>
                <span>•</span>
                <span className="truncate">{tx.accountDisplayName}</span>
              </>
            )}
            {tx.cardLastFour && (
              <>
                <span>•</span>
                <span
                  className="text-slate-600 font-mono inline-flex items-center gap-0.5"
                  dir="ltr"
                >
                  •••• {tx.cardLastFour}
                </span>
              </>
            )}
            {tx.installmentNumber && tx.installmentTotal && (
              <>
                <span>•</span>
                <span className="text-violet-600">
                  {template(t.transactions.installment, {
                    n: tx.installmentNumber,
                    total: tx.installmentTotal,
                  })}
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className={cn(
            'font-semibold tabular-nums shrink-0 text-end min-w-[6.5rem]',
            isExpense ? 'text-slate-900' : 'text-emerald-600',
            compact && 'text-sm min-w-[5.5rem]',
          )}
        >
          <bdi>{formatILS(amount)}</bdi>
        </div>

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
            <DropdownMenuItem onClick={() => setCreateRuleOpen(true)}>
              <Repeat className="size-4 me-2" />
              {t.recurring.createFromTx}
            </DropdownMenuItem>
            {tx.recurringRuleId ? (
              <DropdownMenuItem onClick={unlinkRule}>
                <Unlink className="size-4 me-2" />
                {t.transactions.unlink}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setLinkOpen(true)}>
                <Link2 className="size-4 me-2" />
                {t.transactions.linkToRule}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTransfer}>
              <ArrowLeftRight className="size-4 me-2" />
              {tx.isInternalTransfer
                ? t.transactions.unmarkAsTransfer
                : t.transactions.markAsTransfer}
            </DropdownMenuItem>
            {tx.isAggregatedCharge ? (
              <DropdownMenuItem onClick={unmarkCard}>
                <CreditCard className="size-4 me-2" />
                {t.transactions.unmarkCardStatement}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setMarkCardOpen(true)}>
                <CreditCard className="size-4 me-2" />
                {t.transactions.markAsCardStatement}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <LinkRuleDialog
        transactionId={tx.id}
        open={linkOpen}
        onOpenChange={setLinkOpen}
      />
      <MarkAsCardStatementDialog
        transactionId={tx.id}
        open={markCardOpen}
        onOpenChange={setMarkCardOpen}
      />
      <CreateRuleFromTxDialog
        transaction={{
          id: tx.id,
          description: tx.description,
          amount: tx.amount,
        }}
        categories={categories}
        open={createRuleOpen}
        onOpenChange={setCreateRuleOpen}
      />
      {similarOpen && similarCategoryId && (
        <ApplyToSimilarDialog
          open={similarOpen}
          onOpenChange={setSimilarOpen}
          categoryId={similarCategoryId}
          categoryKey={similarCategoryKey}
          categoryIcon={similarCategoryIcon}
          categoryLabel={similarCategoryLabel}
          matches={similarMatches}
          onBulkApplied={onBulkApplied}
        />
      )}
    </>
  );
}
