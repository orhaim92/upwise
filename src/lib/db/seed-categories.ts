import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const SYSTEM_CATEGORIES = [
  { key: 'groceries', icon: '🛒', color: '#10B981' },
  { key: 'restaurants', icon: '🍽️', color: '#F59E0B' },
  { key: 'transportation', icon: '🚗', color: '#3B82F6' },
  { key: 'fuel', icon: '⛽', color: '#6B7280' },
  { key: 'utilities', icon: '💡', color: '#8B5CF6' },
  { key: 'rent', icon: '🏠', color: '#EC4899' },
  { key: 'mortgage', icon: '🏦', color: '#EC4899' },
  { key: 'arnona', icon: '🏛️', color: '#EF4444' },
  { key: 'health', icon: '🏥', color: '#14B8A6' },
  { key: 'insurance', icon: '🛡️', color: '#6366F1' },
  { key: 'subscriptions', icon: '📺', color: '#A855F7' },
  { key: 'shopping', icon: '🛍️', color: '#F97316' },
  { key: 'clothing', icon: '👕', color: '#DB2777' },
  { key: 'entertainment', icon: '🎬', color: '#D946EF' },
  { key: 'travel', icon: '✈️', color: '#0EA5E9' },
  { key: 'education', icon: '📚', color: '#0891B2' },
  { key: 'kids', icon: '👶', color: '#FB7185' },
  { key: 'savings', icon: '🐷', color: '#059669' },
  { key: 'cash_withdrawal', icon: '🏧', color: '#475569' },
  { key: 'salary', icon: '💰', color: '#22C55E' },
  { key: 'transfer', icon: '↔️', color: '#94A3B8' },
  { key: 'fees', icon: '💳', color: '#71717A' },
  { key: 'other', icon: '📦', color: '#64748B' },
];

async function main() {
  const { db } = await import('./index');
  const { categories } = await import('./schema');
  const { and, eq, isNull } = await import('drizzle-orm');

  // Query-before-insert. The categories table has a (household_id, key)
  // unique constraint, but Postgres treats NULL as distinct in unique
  // constraints by default — so onConflictDoNothing never fires for system
  // categories (household_id IS NULL) and re-running the seed previously
  // inserted full duplicates. This pattern is properly idempotent.
  let inserted = 0;
  for (const cat of SYSTEM_CATEGORIES) {
    const existing = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(isNull(categories.householdId), eq(categories.key, cat.key)),
      )
      .limit(1);

    if (existing.length > 0) continue;

    await db.insert(categories).values({
      householdId: null,
      key: cat.key,
      icon: cat.icon,
      color: cat.color,
    });
    inserted++;
  }
  console.log(
    `Seeded ${inserted} new system categor${inserted === 1 ? 'y' : 'ies'} ` +
      `(${SYSTEM_CATEGORIES.length - inserted} already existed).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
