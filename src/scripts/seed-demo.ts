/**
 * Seed a demo user + household with 6 months of realistic Israeli household
 * data so the dashboard, donut, trend chart, and recurring detection all
 * have something interesting to show during a presentation.
 *
 * Idempotent — re-running deletes the existing demo household (cascade)
 * and reseeds. Safe to run anytime.
 *
 * Run: npx tsx --tsconfig tsconfig.json src/scripts/seed-demo.ts
 *
 * After running:
 *   email:    demo@upwise.local
 *   password: demo1234
 *
 * The demo accounts use provider 'leumi' / 'isracard' so they look real,
 * but the encrypted_credentials are bogus. Don't click "sync now" on
 * them — the scraper will fail. The dashboard works fine without sync
 * because the data is already in the DB.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const DEMO_EMAIL = 'demo@upwise.local';
const DEMO_PASSWORD = 'demo1234';
const DEMO_NAME = 'דמו';
const DEMO_HOUSEHOLD_NAME = 'משפחת דמו';
const MONTHS_OF_HISTORY = 6;

// Cycle anchor: 7th of the month (matches the screenshots so charts look
// natural straight after seeding).
const CYCLE_START_DAY = 7;

type Rng = () => number;
function mulberry32(seed: number): Rng {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rand(rng: Rng, min: number, max: number): number {
  return rng() * (max - min) + min;
}

function dateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Realistic Israeli merchant pools, keyed by category. ---
const MERCHANTS_BY_CATEGORY = {
  groceries: [
    'שופרסל דיל',
    'רמי לוי שיווק',
    'יוחננוף ביג',
    'ויקטורי גדרה',
    'אושר עד ראשל"צ',
    'שפע מרקט- גדרה',
    'טיב טעם',
    'מינימרקט בני',
  ],
  restaurants: [
    'ארומה ישראל',
    'מקדונלדס',
    'BBB בורגרים',
    'קפה גרג',
    'נוטשי',
    'פיצה דומינו',
    'אם הבנים',
    'סושי בר',
  ],
  fuel: ['דלק מוטורס', 'פז גז', 'סונול ישראל', 'טן יד'],
  shopping: [
    'אייס דולפין',
    'הום סנטר',
    'איקאה ראשל"צ',
    'אוסם הסוכן',
    'תכלת מרקט',
  ],
  clothing: ['פוקס', 'רנואר', 'טרמינל איקס', 'גולף', 'קסטרו'],
  health: ['סופר פארם', 'BE פארם', 'קליניק עפולה', 'מעבדות בדיקה'],
  entertainment: ['סינמה סיטי', 'יס', 'הוט בידור', 'תיאטרון בית"ר'],
  subscriptions: [
    'NETFLIX.COM',
    'SPOTIFY AB',
    'APPLE.COM/BILL',
    'GOOGLE *YOUTUBE',
    'CELLCOM TV',
  ],
  kids: ['גן הילדים', 'חוגי ספורט', 'צעצועי טויס', 'חינוך עליון'],
} as const;

type MerchantCategory = keyof typeof MERCHANTS_BY_CATEGORY;

// Per-month frequency × per-tx amount range, by category — calibrated to
// look like a normal Israeli household budget.
const VARIABLE_SPEND_PROFILE: Array<{
  category: MerchantCategory;
  monthlyCount: [number, number];
  amountRange: [number, number];
}> = [
  { category: 'groceries', monthlyCount: [12, 18], amountRange: [40, 350] },
  { category: 'restaurants', monthlyCount: [4, 9], amountRange: [60, 280] },
  { category: 'fuel', monthlyCount: [2, 4], amountRange: [180, 350] },
  { category: 'shopping', monthlyCount: [2, 5], amountRange: [50, 600] },
  { category: 'clothing', monthlyCount: [0, 3], amountRange: [120, 700] },
  { category: 'health', monthlyCount: [1, 3], amountRange: [40, 220] },
  { category: 'entertainment', monthlyCount: [0, 2], amountRange: [60, 200] },
  { category: 'subscriptions', monthlyCount: [3, 5], amountRange: [25, 60] },
  { category: 'kids', monthlyCount: [1, 3], amountRange: [80, 500] },
];

async function main() {
  const { db } = await import('@/lib/db');
  const {
    users,
    households,
    householdMembers,
    accounts,
    categories,
    recurringRules,
    transactions,
    savingsGoals,
  } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { hashPassword } = await import('@/lib/auth/password');
  const { normalizeDescription } = await import(
    '@/lib/transactions/normalize'
  );

  // Keep the user row (and its UUID) stable across reseeds so an already-
  // logged-in demo session keeps working. Only the user's household —
  // accounts, transactions, etc. — gets wiped and rebuilt. If we
  // delete+reinsert the user, the JWT still in the browser points at the
  // old UUID and getUserHouseholdId throws.
  console.log('→ Upserting demo user (preserving UUID across reseeds)...');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);
  if (user) {
    // Refresh password hash and name in case they changed in the script.
    await db
      .update(users)
      .set({ passwordHash, name: DEMO_NAME })
      .where(eq(users.id, user.id));
  } else {
    [user] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        passwordHash,
        name: DEMO_NAME,
        emailVerifiedAt: new Date(),
      })
      .returning();
  }

  // Wipe any prior household + cascading data (accounts, transactions,
  // recurring rules, etc.) the demo user belongs to.
  console.log('→ Wiping prior demo household data...');
  const memberships = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, user.id));
  for (const m of memberships) {
    await db.delete(households).where(eq(households.id, m.householdId));
  }

  console.log('→ Creating household...');
  const [household] = await db
    .insert(households)
    .values({
      name: DEMO_HOUSEHOLD_NAME,
      billingCycleStartDay: CYCLE_START_DAY,
      autoDetectCycleStart: true,
      // Mark 7203 as immediate-charge (דיירקט) so the demo shows off the
      // settings/cards feature working out of the box.
      immediateChargeCards: ['7203'],
    })
    .returning();

  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: 'admin',
  });

  console.log('→ Loading system categories...');
  const cats = await db.select().from(categories);
  const catByKey = new Map(cats.map((c) => [c.key, c]));
  function catId(key: string): string | null {
    return catByKey.get(key)?.id ?? null;
  }

  console.log('→ Creating demo accounts...');
  const [bankAcc] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      type: 'bank',
      provider: 'leumi',
      displayName: 'בנק לאומי',
      accountNumberMasked: '****-3214',
      encryptedCredentials: 'DEMO',
      currentBalance: '32059.94',
      balanceUpdatedAt: new Date(),
      lastScrapedAt: new Date(),
      scrapeStatus: 'success',
    })
    .returning();

  const [ccAcc] = await db
    .insert(accounts)
    .values({
      householdId: household.id,
      type: 'credit_card',
      provider: 'isracard',
      displayName: 'כרטיסי אשראי שלי',
      accountNumberMasked: '****-7271',
      encryptedCredentials: 'DEMO',
      lastFourDigits: '7271',
      lastScrapedAt: new Date(),
      scrapeStatus: 'success',
      statementAccountId: bankAcc.id,
    })
    .returning();

  console.log('→ Creating recurring rules...');
  const today = new Date();
  // Earliest possible rule start so detection considers all generated history.
  const ruleStart = dateString(
    new Date(today.getFullYear(), today.getMonth() - MONTHS_OF_HISTORY, 1),
  );

  const [salaryRule] = await db
    .insert(recurringRules)
    .values({
      householdId: household.id,
      name: 'משכורת ראשית',
      type: 'income',
      expectedAmount: '18400.00',
      amountTolerancePct: '10',
      frequency: 'monthly',
      matchPattern: normalizeDescription('טכנופלוס בע"מ - משכורת'),
      startDate: ruleStart,
      detectionStatus: 'confirmed',
      isActive: true,
    })
    .returning();

  const [salary2Rule] = await db
    .insert(recurringRules)
    .values({
      householdId: household.id,
      name: 'משכורת שניה',
      type: 'income',
      expectedAmount: '9850.00',
      amountTolerancePct: '15',
      frequency: 'monthly',
      matchPattern: normalizeDescription('אינטרסטאר תעשיות בע"מ'),
      startDate: ruleStart,
      detectionStatus: 'confirmed',
      isActive: true,
    })
    .returning();

  const [allowanceRule] = await db
    .insert(recurringRules)
    .values({
      householdId: household.id,
      name: 'קצבת ילדים',
      type: 'income',
      expectedAmount: '598.00',
      amountTolerancePct: '5',
      frequency: 'monthly',
      matchPattern: normalizeDescription('קצבת ילדים'),
      startDate: ruleStart,
      detectionStatus: 'confirmed',
      isActive: true,
    })
    .returning();

  const [mortgageRule] = await db
    .insert(recurringRules)
    .values({
      householdId: household.id,
      name: 'משכנתא',
      type: 'expense',
      expectedAmount: '7500.00',
      amountTolerancePct: '5',
      frequency: 'monthly',
      matchPattern: normalizeDescription('משכנתא בנק לאומי'),
      categoryId: catId('mortgage'),
      startDate: ruleStart,
      detectionStatus: 'confirmed',
      isActive: true,
    })
    .returning();

  await db.insert(recurringRules).values({
    householdId: household.id,
    name: 'חשמל',
    type: 'expense',
    expectedAmount: '650.00',
    amountTolerancePct: '20',
    frequency: 'bimonthly',
    matchPattern: normalizeDescription('חברת חשמל לישראל'),
    categoryId: catId('utilities'),
    startDate: ruleStart,
    detectionStatus: 'confirmed',
    isActive: true,
  });

  await db.insert(recurringRules).values({
    householdId: household.id,
    name: 'ארנונה',
    type: 'expense',
    expectedAmount: '550.00',
    amountTolerancePct: '5',
    frequency: 'bimonthly',
    matchPattern: normalizeDescription('ארנונה עיריה'),
    categoryId: catId('arnona'),
    startDate: ruleStart,
    detectionStatus: 'confirmed',
    isActive: true,
  });

  console.log('→ Generating transactions...');
  const rng = mulberry32(42); // deterministic seed → stable demo every run
  const txValues: Array<typeof transactions.$inferInsert> = [];

  // Helper to push a tx.
  function addTx(opts: {
    accountId: string;
    date: Date;
    amount: number;
    description: string;
    categoryKey?: string | null;
    recurringRuleId?: string | null;
    cardLastFour?: string | null;
    processedDate?: Date | null;
  }) {
    const desc = opts.description;
    txValues.push({
      accountId: opts.accountId,
      householdId: household.id,
      externalId: `demo-${txValues.length}`,
      date: dateString(opts.date),
      processedDate: opts.processedDate
        ? dateString(opts.processedDate)
        : null,
      amount: opts.amount.toFixed(2),
      description: desc,
      rawDescription: desc,
      normalizedDescription: normalizeDescription(desc),
      categoryId: opts.categoryKey ? catId(opts.categoryKey) : null,
      recurringRuleId: opts.recurringRuleId ?? null,
      cardLastFour: opts.cardLastFour ?? null,
    });
  }

  // Walk months from oldest to newest. For each month:
  //   - bank: salary deposits, child allowance, mortgage debit, utilities,
  //     and a CC bill aggregate at month end.
  //   - CC: 25-50 line items spread through the month.
  for (let monthsAgo = MONTHS_OF_HISTORY; monthsAgo >= 0; monthsAgo--) {
    const monthAnchor = new Date(
      today.getFullYear(),
      today.getMonth() - monthsAgo,
      1,
    );
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // ---- Bank-side recurring ----
    // Salary 1: lands ~7th, occasionally 6th or 8th (holiday shift).
    const salaryDay = Math.max(
      1,
      Math.min(daysInMonth, 7 + Math.round(rand(rng, -1.4, 1.4))),
    );
    const salaryDate = new Date(year, month, salaryDay);
    if (salaryDate <= today) {
      addTx({
        accountId: bankAcc.id,
        date: salaryDate,
        amount: 18400 + Math.round(rand(rng, -250, 600) / 50) * 50,
        description: 'טכנופלוס בע"מ - משכורת',
        categoryKey: 'salary',
        recurringRuleId: salaryRule.id,
      });
    }

    // Salary 2: lands ~9th.
    const salary2Day = Math.max(
      1,
      Math.min(daysInMonth, 9 + Math.round(rand(rng, -1, 1))),
    );
    const salary2Date = new Date(year, month, salary2Day);
    if (salary2Date <= today) {
      addTx({
        accountId: bankAcc.id,
        date: salary2Date,
        amount: 9850 + Math.round(rand(rng, -200, 400) / 50) * 50,
        description: 'אינטרסטאר תעשיות בע"מ',
        categoryKey: 'salary',
        recurringRuleId: salary2Rule.id,
      });
    }

    // Child allowance: lands ~20th.
    const allowanceDate = new Date(year, month, 20);
    if (allowanceDate <= today) {
      addTx({
        accountId: bankAcc.id,
        date: allowanceDate,
        amount: 598,
        description: 'קצבת ילדים',
        categoryKey: 'kids',
        recurringRuleId: allowanceRule.id,
      });
    }

    // Mortgage: 5th of the month.
    const mortgageDate = new Date(year, month, 5);
    if (mortgageDate <= today) {
      addTx({
        accountId: bankAcc.id,
        date: mortgageDate,
        amount: -7500,
        description: 'משכנתא בנק לאומי',
        categoryKey: 'mortgage',
        recurringRuleId: mortgageRule.id,
      });
    }

    // Utilities + arnona: bi-monthly, on the 12th of even months.
    if (month % 2 === 0) {
      const electDate = new Date(year, month, 12);
      if (electDate <= today) {
        addTx({
          accountId: bankAcc.id,
          date: electDate,
          amount: -640 - Math.round(rand(rng, -50, 80)),
          description: 'חברת חשמל לישראל',
          categoryKey: 'utilities',
        });
        addTx({
          accountId: bankAcc.id,
          date: electDate,
          amount: -550,
          description: 'ארנונה עיריה',
          categoryKey: 'arnona',
        });
      }
    }

    // ---- CC line items ----
    // 25-50 items spread over the month, mostly the 7271 card with
    // ~5 on 7203 (the immediate-charge card).
    for (const profile of VARIABLE_SPEND_PROFILE) {
      const count = Math.round(
        rand(rng, profile.monthlyCount[0], profile.monthlyCount[1]),
      );
      for (let i = 0; i < count; i++) {
        const day = Math.max(1, Math.min(daysInMonth, Math.floor(rng() * daysInMonth) + 1));
        const txDate = new Date(year, month, day);
        if (txDate > today) continue;

        const isImmediate = rng() < 0.12;
        const cardLastFour = isImmediate ? '7203' : '7271';

        // Regular CC: bill paid on 20th of the FOLLOWING month.
        // Immediate-charge: processed on the same day.
        const billDate = isImmediate
          ? txDate
          : new Date(year, month + 1, 20);

        const merchant = pick(rng, MERCHANTS_BY_CATEGORY[profile.category]);
        const amount = -(
          Math.round(rand(rng, profile.amountRange[0], profile.amountRange[1]) * 100) / 100
        );

        addTx({
          accountId: ccAcc.id,
          date: txDate,
          processedDate: billDate,
          amount,
          description: merchant,
          categoryKey: profile.category,
          cardLastFour,
        });
      }
    }
  }

  console.log(`→ Inserting ${txValues.length} transactions...`);
  // Chunk to avoid hitting parameter limits on a single INSERT.
  const CHUNK = 200;
  for (let i = 0; i < txValues.length; i += CHUNK) {
    await db.insert(transactions).values(txValues.slice(i, i + CHUNK));
  }

  console.log('→ Adding savings goal...');
  await db.insert(savingsGoals).values({
    householdId: household.id,
    name: 'חופשה ביוון',
    targetAmount: '15000',
    currentAmount: '6500',
    monthlyContribution: '1000',
    icon: '✈️',
    color: '#0EA5E9',
    targetDate: dateString(
      new Date(today.getFullYear(), today.getMonth() + 8, 15),
    ),
  });

  console.log('\n✅ Demo seed complete.');
  console.log('   email:    ' + DEMO_EMAIL);
  console.log('   password: ' + DEMO_PASSWORD);
  console.log(
    '   household: ' +
      DEMO_HOUSEHOLD_NAME +
      ` (cycle starts day ${CYCLE_START_DAY}, auto-detect ON)`,
  );
  console.log(
    '   transactions: ' +
      txValues.length +
      ` across ${MONTHS_OF_HISTORY + 1} months`,
  );
  console.log(
    '   note: card 7203 is marked as immediate-charge (דיירקט) for demo.',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
