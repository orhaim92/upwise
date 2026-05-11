/**
 * One-off cleanup for stale Mizrahi-style CC placeholders that already
 * have a real cleared twin in the DB. Run once to clean existing data;
 * future syncs handle this automatically via the post-sync chain.
 *
 * Run: npx tsx --tsconfig tsconfig.json src/scripts/cleanup-cc-placeholders.ts
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import('@/lib/db');
  const { households } = await import('@/lib/db/schema');
  const { consolidateCcPlaceholders } = await import(
    '@/lib/transactions/consolidate-cc-placeholders'
  );

  const allHouseholds = await db
    .select({ id: households.id, name: households.name })
    .from(households);

  let totalDeleted = 0;
  for (const h of allHouseholds) {
    const deleted = await consolidateCcPlaceholders(h.id);
    console.log(`  ${h.name} (${h.id}): deleted ${deleted}`);
    totalDeleted += deleted;
  }
  console.log(`\n✅ Done. Removed ${totalDeleted} stale placeholders.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
