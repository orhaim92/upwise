import { and, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, transactions } from '@/lib/db/schema';

// Match keywords found in a transaction description to a category key.
// Order matters: earlier rules win when multiple match. Patterns are
// case-insensitive substring matches. Hebrew patterns must be exact substrings;
// transliterations are unreliable.
const RULES: Array<{ keywords: string[]; categoryKey: string }> = [
  { keywords: ['משכורת', 'שכר', 'salary', 'payroll'], categoryKey: 'salary' },
  { keywords: ['משכנתא', 'mortgage'], categoryKey: 'mortgage' },
  { keywords: ['שכ"ד', 'שכר דירה', 'שכירות', 'rent'], categoryKey: 'rent' },
  { keywords: ['ארנונה', 'arnona'], categoryKey: 'arnona' },
  { keywords: ['חשמל', 'חברת חשמל', 'electricity'], categoryKey: 'utilities' },
  {
    keywords: ['מים', 'מי אביבים', 'תאגיד מים', 'מי רעננה'],
    categoryKey: 'utilities',
  },
  {
    keywords: ['בזק', 'הוט', 'סלקום', 'פרטנר', 'גולן', 'רמי לוי תקשורת'],
    categoryKey: 'utilities',
  },
  { keywords: ['גז', 'פזגז', 'amisragas'], categoryKey: 'utilities' },
  {
    keywords: [
      'ביטוח',
      'הראל',
      'מגדל',
      'מנורה',
      'הפניקס',
      'כלל ביטוח',
      'insurance',
    ],
    categoryKey: 'insurance',
  },
  {
    keywords: [
      'קופת חולים',
      'מאוחדת',
      'מכבי',
      'כללית',
      'לאומית',
      'בית חולים',
      'רופא',
      'בית מרקחת',
      'סופר פארם',
      'super-pharm',
    ],
    categoryKey: 'health',
  },
  {
    keywords: [
      'שופרסל',
      'רמי לוי',
      'יינות ביתן',
      'ויקטורי',
      'חצי חינם',
      'מגה',
      'אושר עד',
      'טיב טעם',
      'יוחננוף',
    ],
    categoryKey: 'groceries',
  },
  {
    keywords: [
      'מסעדה',
      'קפה',
      'פיצה',
      'בורגר',
      'שווארמה',
      'wolt',
      'תן ביס',
      'מקדונלדס',
      'ארומה',
      'cofix',
    ],
    categoryKey: 'restaurants',
  },
  {
    keywords: ['פז', 'דלק', 'סונול', 'דור אלון', 'תחנת דלק', 'fuel'],
    categoryKey: 'fuel',
  },
  {
    keywords: [
      'רב קו',
      'אגד',
      'דן',
      'רכבת',
      'טקסי',
      'גט טקסי',
      'uber',
      'cab',
      'pango',
      'autotel',
      'careem',
    ],
    categoryKey: 'transportation',
  },
  {
    keywords: [
      'netflix',
      'נטפליקס',
      'spotify',
      'ספוטיפיי',
      'apple.com/bill',
      'icloud',
      'youtube',
      'disney',
      'hbo',
      'amazon prime',
    ],
    categoryKey: 'subscriptions',
  },
  {
    keywords: ['cinema', 'יס פלאנט', 'סינמה סיטי', 'קולנוע'],
    categoryKey: 'entertainment',
  },
  {
    keywords: [
      'ikea',
      'איקאה',
      'castro',
      'fox',
      'h&m',
      'zara',
      'aliexpress',
      'amazon',
    ],
    categoryKey: 'shopping',
  },
  {
    keywords: ['booking', 'airbnb', 'קל אביב', 'el al', 'חברת תעופה', 'מלון', 'hotel'],
    categoryKey: 'travel',
  },
  {
    keywords: ['אוניברסיטה', 'מכללה', 'בית ספר', 'גן ילדים', 'שכר לימוד'],
    categoryKey: 'education',
  },
  { keywords: ['עמלה', 'ריבית', 'fee'], categoryKey: 'fees' },
  { keywords: ['העברה', 'transfer', 'מסב'], categoryKey: 'transfer' },
];

// Categorize all uncategorized, non-modified transactions for the household.
// Skips transactions the user has already touched (is_user_modified = true).
export async function autoCategorizeTransactions(
  householdId: string,
): Promise<number> {
  const cats = await db
    .select({ id: categories.id, key: categories.key })
    .from(categories)
    .where(
      or(
        isNull(categories.householdId),
        eq(categories.householdId, householdId),
      ),
    );

  const keyToId = new Map(cats.map((c) => [c.key, c.id]));

  let categorized = 0;

  for (const rule of RULES) {
    const catId = keyToId.get(rule.categoryKey);
    if (!catId) continue;

    for (const kw of rule.keywords) {
      const result = await db
        .update(transactions)
        .set({ categoryId: catId })
        .where(
          and(
            eq(transactions.householdId, householdId),
            isNull(transactions.categoryId),
            eq(transactions.isUserModified, false),
            ilike(transactions.description, `%${kw}%`),
          ),
        )
        .returning({ id: transactions.id });
      categorized += result.length;
    }
  }

  return categorized;
}
