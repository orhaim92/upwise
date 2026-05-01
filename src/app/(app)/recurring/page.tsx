import { listRules } from './actions';
import { listCategoriesForHousehold } from '../transactions/actions';
import { AddRuleDialog } from './_components/add-rule-dialog';
import { PendingSuggestions } from './_components/pending-suggestions';
import { RulesList } from './_components/rules-list';
import { t } from '@/lib/i18n/he';

export default async function RecurringPage() {
  const [rules, categories] = await Promise.all([
    listRules(),
    listCategoriesForHousehold(),
  ]);
  const pending = rules.filter((r) => r.detectionStatus === 'pending');
  const confirmed = rules.filter((r) => r.detectionStatus === 'confirmed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.recurring.title}</h1>
          <p className="text-slate-600 mt-1">{t.recurring.subtitle}</p>
        </div>
        <AddRuleDialog categories={categories} />
      </div>

      {pending.length > 0 && <PendingSuggestions rules={pending} />}

      <RulesList rules={confirmed} categories={categories} />
    </div>
  );
}
