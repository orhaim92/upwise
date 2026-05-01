import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurringRules } from '@/lib/db/schema';
import { AUTO_DETECT_MIN_SAMPLES } from '@/lib/constants';

export type DetectedPattern = {
  normalizedDescription: string;
  sampleDescription: string;
  type: 'income' | 'expense';
  expectedAmount: number;
  amountTolerancePct: number;
  frequency:
    | 'weekly'
    | 'monthly'
    | 'bimonthly'
    | 'quarterly'
    | 'semiannual'
    | 'yearly';
  startDate: Date;
  occurrenceCount: number;
  confidence: number;
};

const PERIOD_BUCKETS: Array<{
  freq: DetectedPattern['frequency'];
  minDays: number;
  maxDays: number;
}> = [
  { freq: 'weekly', minDays: 5, maxDays: 9 },
  { freq: 'monthly', minDays: 26, maxDays: 34 },
  { freq: 'bimonthly', minDays: 56, maxDays: 64 },
  { freq: 'quarterly', minDays: 86, maxDays: 94 },
  { freq: 'semiannual', minDays: 175, maxDays: 188 },
  { freq: 'yearly', minDays: 350, maxDays: 380 },
];

// Confidence scoring (max 100):
//   - sample size (≥3 samples baseline; bonus up to 6+ samples) ............ 0–25
//   - period regularity (stddev of day-diffs as % of median) ............... 0–35
//   - amount stability (spread as % of median) ............................. 0–30
//   - bonus: amount within tighter band, periodicity perfect ............... 0–10
//
// Threshold for surfacing as a suggestion: confidence >= 60.
//
// Permissive on amount variance (a salary swinging 10–15% is still clearly a
// salary). Strict on periodicity — that's what distinguishes "recurring charge"
// from "frequent merchant".
const CONFIDENCE_THRESHOLD = 60;

type DetectRow = {
  normalized_description: string;
  amounts: string[];
  dates: string[];
  sample_description: string;
};

export async function detectRecurringPatterns(
  householdId: string,
): Promise<DetectedPattern[]> {
  // Pull groups, excluding internal transfers and CC aggregates (those should
  // never be suggested as recurring).
  const groups = await db.execute<DetectRow>(sql`
    SELECT
      normalized_description,
      count(*)::int as n,
      array_agg(amount::text ORDER BY date) as amounts,
      array_agg(date::text ORDER BY date) as dates,
      (array_agg(description ORDER BY date DESC))[1] as sample_description
    FROM transactions
    WHERE household_id = ${householdId}
      AND normalized_description IS NOT NULL
      AND normalized_description != ''
      AND length(normalized_description) >= 2
      AND is_internal_transfer = false
      AND is_aggregated_charge = false
    GROUP BY normalized_description
    HAVING count(*) >= ${AUTO_DETECT_MIN_SAMPLES}
  `);

  // Skip groups where a rule already exists (any status — including rejected,
  // so rejected suggestions don't come back).
  const existing = await db
    .select({ matchPattern: recurringRules.matchPattern })
    .from(recurringRules)
    .where(eq(recurringRules.householdId, householdId));
  const existingPatterns = new Set(
    existing.map((r) => r.matchPattern).filter((p): p is string => !!p),
  );

  const rows: DetectRow[] =
    (groups as unknown as { rows?: DetectRow[] }).rows ??
    (groups as unknown as DetectRow[]);

  const out: DetectedPattern[] = [];

  for (const row of rows) {
    if (existingPatterns.has(row.normalized_description)) continue;

    const amounts = row.amounts.map((a) => parseFloat(a));
    const dates = row.dates.map((d) => new Date(d));
    if (amounts.length < AUTO_DETECT_MIN_SAMPLES) continue;

    const score = scorePattern(amounts, dates);
    if (!score) continue;
    if (score.confidence < CONFIDENCE_THRESHOLD) continue;

    const median = Math.abs(sortedMedian(amounts.map(Math.abs)));
    const isIncome = sortedMedian([...amounts]) > 0;

    out.push({
      normalizedDescription: row.normalized_description,
      sampleDescription: row.sample_description,
      type: isIncome ? 'income' : 'expense',
      expectedAmount: median,
      amountTolerancePct: score.suggestedTolerance,
      frequency: score.frequency,
      startDate: dates[dates.length - 1],
      occurrenceCount: amounts.length,
      confidence: score.confidence,
    });
  }

  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

function scorePattern(
  amounts: number[],
  dates: Date[],
): {
  confidence: number;
  frequency: DetectedPattern['frequency'];
  suggestedTolerance: number;
} | null {
  if (dates.length < 2) return null;
  const diffs: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    diffs.push(
      (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24),
    );
  }
  const medianDiff = sortedMedian([...diffs]);
  const stddev = standardDeviation(diffs);

  const bucket = PERIOD_BUCKETS.find(
    (b) => medianDiff >= b.minDays && medianDiff <= b.maxDays,
  );
  if (!bucket) return null;

  // Period regularity: stddev as fraction of median. <0% → full marks. ≥20% → zero.
  const regularity = medianDiff > 0 ? Math.min(1, stddev / medianDiff) : 1;
  const periodScore = Math.round(35 * (1 - Math.min(regularity / 0.2, 1)));

  // Amount stability: relative spread. ≤5% → full marks. ≥30% → zero.
  const abs = amounts.map(Math.abs);
  const amountMedian = sortedMedian([...abs]);
  if (amountMedian === 0) return null;
  const spread = (Math.max(...abs) - Math.min(...abs)) / amountMedian;
  let amountScore: number;
  if (spread <= 0.05) amountScore = 30;
  else if (spread >= 0.3) amountScore = 0;
  else amountScore = Math.round(30 * (1 - (spread - 0.05) / 0.25));

  // Sample size: capped at 6+ samples for full marks.
  const sampleScore = Math.min(25, Math.round((amounts.length / 6) * 25));

  // Bonus: very tight pattern in both axes.
  let bonus = 0;
  if (regularity < 0.05 && spread < 0.05) bonus += 10;
  else if (regularity < 0.1 && spread < 0.1) bonus += 5;

  const confidence = Math.min(
    100,
    periodScore + amountScore + sampleScore + bonus,
  );

  // Suggested tolerance: ≥observed spread + headroom, floored at 10%, capped at 25%.
  const suggestedTolerance = Math.round(
    Math.min(25, Math.max(10, spread * 100 * 1.5)),
  );

  return { confidence, frequency: bucket.freq, suggestedTolerance };
}

function sortedMedian(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function standardDeviation(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance =
    arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

export async function persistDetectedPatterns(
  householdId: string,
  patterns: DetectedPattern[],
): Promise<number> {
  if (patterns.length === 0) return 0;

  for (const p of patterns) {
    await db.insert(recurringRules).values({
      householdId,
      name: p.sampleDescription.slice(0, 100),
      type: p.type,
      expectedAmount: p.expectedAmount.toFixed(2),
      amountTolerancePct: p.amountTolerancePct.toString(),
      frequency: p.frequency,
      matchPattern: p.normalizedDescription,
      startDate: p.startDate.toISOString().slice(0, 10),
      isActive: true,
      detectionSource: 'auto',
      detectionStatus: 'pending',
    });
  }

  return patterns.length;
}
