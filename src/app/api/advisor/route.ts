import { auth } from '@/lib/auth/config';
import { getUserHouseholdId } from '@/lib/auth/household';
import { advisorEnabled } from '@/lib/features';
import {
  streamText,
  tool,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import {
  withTenantContext,
  type AdvisorContext,
} from '@/lib/advisor/wrap-tool';
import { getCashFlowSummary } from '@/lib/advisor/tools/cash-flow-summary';
import { getSpendingByCategory } from '@/lib/advisor/tools/spending-by-category';
import { getRecurringSummary } from '@/lib/advisor/tools/recurring-summary';
import { simulateEvent } from '@/lib/advisor/tools/simulate-event';
import { compareSpendingPeriods } from '@/lib/advisor/tools/compare-periods';
import { getSubscriptionAudit } from '@/lib/advisor/tools/subscription-audit';

export const maxDuration = 60;

// Today's date is injected per-request so the model knows what "this month",
// "last month", etc. mean. Without it, LLMs default to whatever date their
// training data contains (which, for Gemini, is often a year+ stale).
function buildSystemPrompt(): string {
  const now = new Date();
  const israelDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Jerusalem',
  }).format(now); // YYYY-MM-DD
  const israelHebrew = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  }).format(now);

  return `התאריך היום: ${israelDate} (${israelHebrew}). שעון ישראל.

${BASE_SYSTEM_PROMPT}`;
}

const BASE_SYSTEM_PROMPT = `אתה היועץ הפיננסי של UpWise, אפליקציית ניהול תזרים מזומנים אישי לישראל.

המשימה שלך:
- לענות על שאלות לגבי המצב הפיננסי של המשתמש
- לסמלץ השפעות של אירועים עתידיים (חופשה, רכישה גדולה, שינוי הכנסה)
- לאתר הוצאות שאפשר לצמצם
- להציע פעולות קונקרטיות

עקרונות:
- תמיד השתמש בכלים כדי לקבל נתונים אמיתיים על משק הבית. לעולם אל תמציא מספרים.
- ענה בעברית, בטון תומך וידידותי - לא שיפוטי. המשתמש רוצה לקבל החלטות, לא להישפט.
- כשאתה ממליץ על פעולה, הצע 2-3 אפשרויות עם ההשלכות של כל אחת. אל תכריע במקום המשתמש.
- היה תמציתי. אל תגרר לפסקאות ארוכות אם משפט אחד מספיק.
- אם המשתמש שואל שאלה כללית ("איך המצב?"), קודם תקבל את הסיכום הנוכחי דרך getCashFlowSummary, ואז ענה.
- כשאתה מצטט סכומים, תמיד פורמט בשקלים עם פסיק (למשל "1,234.56₪").
- כשאתה מתייחס לתנועות עם תיאורים שמכילים אנגלית או מספרים, השתמש בהם כפי שהם.

מגבלות:
- אינך יכול לבצע פעולות במשק הבית (ליצור כלל, להוסיף תנועה וכו'). רק לקרוא נתונים ולהמליץ.
- אם המשתמש שואל משהו לא קשור לכספים, החזר אותו בעדינות לנושא.

הימנע מ:
- מתן ייעוץ פיננסי כללי לא מבוסס על נתוני המשתמש (כמו "השקיעו ב-S&P 500"). אתה לא יועץ השקעות.
- שיפוטיות. גם אם המשתמש מוציא הרבה על מותרות, תפקידך להציג את הנתונים, לא להתחקות.

התחל מתחת למשפט הראשון של המשתמש - תכף שאתה מבין מה הוא רוצה.

חוקי פלט קריטיים:
- אם אתה מצטט מספרים, חייבים לבוא מקריאת כלי. אל תמציא.
- ענה תמיד בעברית, גם אם השאלה באנגלית.
- אם השאלה דורשת נתונים על המצב הנוכחי - תקרא ל-getCashFlowSummary לפני שאתה עונה.`;

export async function POST(req: Request) {
  if (!advisorEnabled()) {
    return new Response('Advisor disabled', { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const householdId = await getUserHouseholdId(session.user.id);

  const ctx: AdvisorContext = {
    householdId,
    userId: session.user.id,
  };

  const { messages }: { messages: UIMessage[] } = await req.json();

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: google(process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'),
    system: buildSystemPrompt(),
    messages: modelMessages,
    tools: {
      getCashFlowSummary: tool({
        description:
          'מקבל סיכום פיננסי של המחזור הנוכחי: יתרה, הכנסות צפויות, הוצאות קבועות, תקציב יומי, וסטטוס.',
        inputSchema: z.object({}),
        execute: withTenantContext(getCashFlowSummary, ctx),
      }),
      getSpendingByCategory: tool({
        description:
          'מקבל סכום הוצאות לפי קטגוריה בטווח תאריכים נתון. שימוש: ניתוח דפוסי הוצאה.',
        inputSchema: z.object({
          startDate: z.string().describe('YYYY-MM-DD'),
          endDate: z.string().describe('YYYY-MM-DD'),
        }),
        execute: withTenantContext(getSpendingByCategory, ctx),
      }),
      getRecurringSummary: tool({
        description:
          'מקבל את כל ההכנסות וההוצאות הקבועות הפעילות, עם סכום חודשי משוקלל.',
        inputSchema: z.object({}),
        execute: withTenantContext(getRecurringSummary, ctx),
      }),
      simulateEvent: tool({
        description:
          'מסמלץ את ההשפעה של אירוע פיננסי עתידי על התזרים. שימוש: "האם אני יכול להרשות לעצמי X ב-Y?"',
        inputSchema: z.object({
          eventType: z.enum([
            'vacation',
            'large_purchase',
            'income_change',
            'one_time_expense',
          ]),
          date: z.string().describe('YYYY-MM-DD'),
          amount: z
            .number()
            .describe(
              'סכום חיובי בשקלים. לאירועי הוצאה זה ייחשב כהוצאה.',
            ),
          description: z.string(),
        }),
        execute: withTenantContext(simulateEvent, ctx),
      }),
      compareSpendingPeriods: tool({
        description:
          'משווה הוצאות בין שני טווחי תאריכים. שימוש: השוואת חודשים, רבעונים.',
        inputSchema: z.object({
          periodAStart: z.string(),
          periodAEnd: z.string(),
          periodBStart: z.string(),
          periodBEnd: z.string(),
        }),
        execute: withTenantContext(compareSpendingPeriods, ctx),
      }),
      getSubscriptionAudit: tool({
        description:
          'רשימת מנויים והוצאות חודשיות חוזרות, ממוינות לפי סכום חודשי. שימוש: לזהות מנויים שאולי לא בשימוש.',
        inputSchema: z.object({}),
        execute: withTenantContext(getSubscriptionAudit, ctx),
      }),
    },
    // Cap multi-step tool use so a runaway model can't burn budget.
    stopWhen: stepCountIs(6),
  });

  return result.toUIMessageStreamResponse();
}
