import { listGoals } from './actions';
import { AddGoalDialog } from './_components/add-goal-dialog';
import { GoalCard } from './_components/goal-card';
import { t } from '@/lib/i18n/he';

export default async function GoalsPage() {
  const goals = await listGoals();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.goals.title}</h1>
          <p className="text-slate-600 mt-1">{t.goals.subtitle}</p>
        </div>
        <AddGoalDialog />
      </div>

      {goals.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-2xl ring-1 ring-slate-200">
          <p className="text-slate-500">{t.goals.empty}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}
    </div>
  );
}
