import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

// One-shot CLI for cross-day duplicate consolidation. Calls the same logic
// the sync pipeline uses (src/lib/transactions/consolidate-cross-day-duplicates.ts)
// so we don't drift between the two.
//
// `--dry-run` (default) — finds duplicates and previews the plan without
//                         touching the DB.
// `--commit`            — actually deletes losers + repoints transfer FKs.
//
// Scans every household when run without filters.
async function main() {
  const dryRun = !process.argv.includes('--commit');

  const { findCrossDayDuplicates, applyCrossDayDuplicates } = await import(
    '../transactions/consolidate-cross-day-duplicates'
  );

  const consolidations = await findCrossDayDuplicates();

  if (consolidations.length === 0) {
    console.log('No cross-day duplicates found. Nothing to do.');
    return;
  }

  console.log(`Plan: consolidate ${consolidations.length} duplicate row(s).`);
  for (const c of consolidations.slice(0, 10)) {
    console.log(`  • ${c.desc}`);
  }
  if (consolidations.length > 10) {
    console.log(`  … and ${consolidations.length - 10} more`);
  }

  if (dryRun) {
    console.log('\nDry-run only. Re-run with `--commit` to actually delete.');
    return;
  }

  await applyCrossDayDuplicates(consolidations);
  console.log(`\nDeleted ${consolidations.length} duplicate row(s).`);
  console.log(
    'If 3-copy groups existed, a second pass may find leftover pairs — ' +
      're-run to verify.',
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
