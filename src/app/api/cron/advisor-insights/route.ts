import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { generateText, tool, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  advisorInsights,
  households,
  householdMembers,
  whatsappSubscriptions,
} from '@/lib/db/schema';
import { advisorEnabled } from '@/lib/features';
import { sendWhatsApp } from '@/lib/twilio/client';
import { withTenantContext } from '@/lib/advisor/wrap-tool';
import { getCashFlowSummary } from '@/lib/advisor/tools/cash-flow-summary';
import { getSpendingByCategory } from '@/lib/advisor/tools/spending-by-category';
import { getRecurringSummary } from '@/lib/advisor/tools/recurring-summary';
import { getSubscriptionAudit } from '@/lib/advisor/tools/subscription-audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_INSIGHT_PROMPT = `אתה מנתח את המצב הפיננסי של משק בית כדי לזהות תובנה אחת חשובה.

השתמש בכלים כדי לבדוק את המצב. אם תזהה אחת מהבעיות הבאות, תחזיר תובנה:
- היתרה הזמינה לבזבוז שלילית או נמוכה מאוד (urgency 8-10)
- הוצאה לקטגוריה אחת חרגה משמעותית מההוצאה החודשית הרגילה (urgency 6-7)
- מנוי גדול שלא חויב לאחרונה ויכול להיות נשכח (urgency 4-5)
- חודש כבד מתקרב עם הרבה תשלומים קבועים (urgency 5-7)

החזר אך ורק JSON אחד בפורמט הבא, או "{}" אם אין תובנה משמעותית:

{
  "type": "overspend_alert" | "low_balance" | "subscription_audit" | "high_pressure_cycle",
  "urgency": 1-10,
  "title": "כותרת קצרה בעברית",
  "body": "הסבר של 2-3 משפטים בעברית"
}

חשוב מאוד: התגובה שלך חייבת להיות JSON תקין בלבד. בלי טקסט לפני, בלי טקסט אחרי, בלי backticks, בלי "\`\`\`json". אם אין תובנה משמעותית - החזר בדיוק "{}".`;

function buildInsightPrompt(): string {
  const now = new Date();
  const israelDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Jerusalem',
  }).format(now);
  return `התאריך היום: ${israelDate}. שעון ישראל.\n\n${BASE_INSIGHT_PROMPT}`;
}

// Strip common markdown wrappers Gemini sometimes adds despite instructions.
function extractJson(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    // Drop opening fence (```json or ```)
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  return s;
}

type ParsedInsight = {
  type: string;
  urgency: number;
  title: string;
  body: string;
};

type ResultRow = {
  householdId: string;
  insight: boolean;
  reason?: string;
};

export async function GET(req: Request) {
  if (!advisorEnabled()) {
    return NextResponse.json({ ok: false, reason: 'disabled' });
  }

  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const allHouseholds = await db
    .select({ id: households.id })
    .from(households);

  const results: ResultRow[] = [];

  for (const hh of allHouseholds) {
    try {
      // userId is required by AdvisorContext but unused by these tools, so a
      // placeholder is fine. The tenant wrapper still scopes everything to
      // householdId for safety.
      const ctx = { householdId: hh.id, userId: '<system>' };

      const result = await generateText({
        model: google(process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'),
        system: buildInsightPrompt(),
        messages: [
          {
            role: 'user',
            content: 'בדוק את המצב הפיננסי הנוכחי וזהה תובנה אם יש.',
          },
        ],
        tools: {
          getCashFlowSummary: tool({
            description: 'סיכום פיננסי.',
            inputSchema: z.object({}),
            execute: withTenantContext(getCashFlowSummary, ctx),
          }),
          getSpendingByCategory: tool({
            description: 'הוצאות לפי קטגוריה.',
            inputSchema: z.object({
              startDate: z.string(),
              endDate: z.string(),
            }),
            execute: withTenantContext(getSpendingByCategory, ctx),
          }),
          getRecurringSummary: tool({
            description: 'תשלומים קבועים.',
            inputSchema: z.object({}),
            execute: withTenantContext(getRecurringSummary, ctx),
          }),
          getSubscriptionAudit: tool({
            description: 'סקירת מנויים.',
            inputSchema: z.object({}),
            execute: withTenantContext(getSubscriptionAudit, ctx),
          }),
        },
        stopWhen: stepCountIs(6),
      });

      const text = extractJson(result.text);
      if (!text || text === '{}') {
        results.push({
          householdId: hh.id,
          insight: false,
          reason: 'no insight',
        });
        continue;
      }

      let parsed: ParsedInsight;
      try {
        parsed = JSON.parse(text) as ParsedInsight;
      } catch {
        results.push({
          householdId: hh.id,
          insight: false,
          reason: 'parse failed',
        });
        continue;
      }

      if (
        !parsed.title ||
        !parsed.body ||
        !parsed.type ||
        !parsed.urgency
      ) {
        results.push({
          householdId: hh.id,
          insight: false,
          reason: 'invalid shape',
        });
        continue;
      }

      const urgency = Math.min(10, Math.max(1, Math.round(parsed.urgency)));

      await db.insert(advisorInsights).values({
        householdId: hh.id,
        type: parsed.type,
        urgency,
        title: parsed.title.slice(0, 200),
        body: parsed.body.slice(0, 1000),
        status: 'new',
      });

      results.push({ householdId: hh.id, insight: true });

      // Push to WhatsApp only for genuinely urgent stuff. Subscribers must
      // be both verified AND have insight_alerts_enabled (separate from
      // the daily-digest opt-in).
      if (urgency >= 8) {
        const subs = await db
          .select({
            phoneE164: whatsappSubscriptions.phoneE164,
          })
          .from(whatsappSubscriptions)
          .innerJoin(
            householdMembers,
            eq(householdMembers.userId, whatsappSubscriptions.userId),
          )
          .where(
            and(
              eq(householdMembers.householdId, hh.id),
              eq(whatsappSubscriptions.isVerified, true),
              eq(whatsappSubscriptions.insightAlertsEnabled, true),
              isNull(whatsappSubscriptions.optedOutAt),
            ),
          );

        const message = `⚠️ ${parsed.title}\n\n${parsed.body}`;
        for (const s of subs) {
          await sendWhatsApp(s.phoneE164, message);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error('Insight cron error for household', hh.id, msg);
      results.push({ householdId: hh.id, insight: false, reason: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
