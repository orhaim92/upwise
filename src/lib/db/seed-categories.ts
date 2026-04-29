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
  { key: 'entertainment', icon: '🎬', color: '#D946EF' },
  { key: 'travel', icon: '✈️', color: '#0EA5E9' },
  { key: 'education', icon: '📚', color: '#0891B2' },
  { key: 'kids', icon: '👶', color: '#FB7185' },
  { key: 'salary', icon: '💰', color: '#22C55E' },
  { key: 'transfer', icon: '↔️', color: '#94A3B8' },
  { key: 'fees', icon: '💳', color: '#71717A' },
  { key: 'other', icon: '📦', color: '#64748B' },
];

async function main() {
  const { db } = await import('./index');
  const { categories } = await import('./schema');

  for (const cat of SYSTEM_CATEGORIES) {
    await db
      .insert(categories)
      .values({
        householdId: null,
        key: cat.key,
        icon: cat.icon,
        color: cat.color,
      })
      .onConflictDoNothing();
  }
  console.log(`Seeded ${SYSTEM_CATEGORIES.length} system categories.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
