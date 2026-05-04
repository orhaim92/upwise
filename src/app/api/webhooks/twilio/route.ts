import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { and, desc, eq } from 'drizzle-orm';
import { generateText, tool, stepCountIs, type ModelMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  advisorConversations,
  advisorMessages,
  householdMembers,
  whatsappSubscriptions,
} from '@/lib/db/schema';
import { advisorEnabled } from '@/lib/features';
import { withTenantContext } from '@/lib/advisor/wrap-tool';
import { getCashFlowSummary } from '@/lib/advisor/tools/cash-flow-summary';
import { getSpendingByCategory } from '@/lib/advisor/tools/spending-by-category';
import { getRecurringSummary } from '@/lib/advisor/tools/recurring-summary';
import { simulateEvent } from '@/lib/advisor/tools/simulate-event';
import { compareSpendingPeriods } from '@/lib/advisor/tools/compare-periods';
import { getSubscriptionAudit } from '@/lib/advisor/tools/subscription-audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_PROMPT = `אתה היועץ הפיננסי של UpWise בוואטסאפ.

המשתמש כותב לך הודעות וואטסאפ קצרות. כללים:
- ענה בעברית, בקצרה - מקסימום 3-4 שורות אם אפשר.
- השתמש בכלים כדי לקבל נתונים אמיתיים. אל תמציא מספרים.
- בלי כותרות, בלי bullet points מפורטים. הודעת וואטסאפ צריכה להרגיש שיחה, לא דוח.
- ענה בטון תומך וידידותי.
- פורמט סכומים: "1,234.56₪".
- אם המשתמש שואל "איך המצב?", קבל את הסיכום ותן תשובה של 2-3 משפטים.

הימנע מ:
- תשובות ארוכות
- ייעוץ פיננסי כללי
- שיפוטיות

חוקי פלט קריטיים:
- אם אתה מצטט מספרים, חייבים לבוא מקריאת כלי. אל תמציא.
- ענה תמיד בעברית, גם אם השאלה באנגלית.`;

// Inject today's Israel date so the model knows what "this month" / "last
// month" / "yesterday" mean. Same pattern as the chat route.
function buildSystemPrompt(): string {
  const now = new Date();
  const israelDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Jerusalem',
  }).format(now);
  const israelHebrew = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  }).format(now);
  return `התאריך היום: ${israelDate} (${israelHebrew}). שעון ישראל.\n\n${BASE_PROMPT}`;
}

export async function POST(req: Request) {
  const formData = await req.formData();

  // Verify Twilio signature when configured. In dev (no AUTH_TOKEN) we
  // skip — easier local testing.
  const signature = req.headers.get('x-twilio-signature');
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (signature && authToken && baseUrl) {
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === 'string') params[key] = value;
    });
    const url = baseUrl.replace(/\/$/, '') + '/api/webhooks/twilio';
    const isValid = twilio.validateRequest(authToken, signature, url, params);
    if (!isValid) {
      return new NextResponse('forbidden', { status: 403 });
    }
  }

  const fromRaw = formData.get('From')?.toString() ?? '';
  const body = formData.get('Body')?.toString() ?? '';
  const phoneE164 = fromRaw.replace(/^whatsapp:/, '');

  // Find the user behind this phone number (must be verified).
  const [sub] = await db
    .select()
    .from(whatsappSubscriptions)
    .where(
      and(
        eq(whatsappSubscriptions.phoneE164, phoneE164),
        eq(whatsappSubscriptions.isVerified, true),
      ),
    )
    .limit(1);
  if (!sub) {
    return twimlReply(
      'המספר אינו רשום ב-UpWise. הירשם דרך הגדרות > וואטסאפ.',
    );
  }

  const [member] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, sub.userId))
    .limit(1);
  if (!member) {
    return twimlReply('שגיאה: משק בית לא נמצא.');
  }

  // Empty body or feature off → just ack so the sandbox session resets.
  if (!advisorEnabled() || !body.trim()) {
    return twimlReply('👍 התקבל.');
  }

  // One rolling "WhatsApp" conversation per user — easier to follow than
  // creating a new one each time, and the LLM keeps last-10-msg context.
  let [convo] = await db
    .select()
    .from(advisorConversations)
    .where(
      and(
        eq(advisorConversations.householdId, member.householdId),
        eq(advisorConversations.userId, sub.userId),
        eq(advisorConversations.title, 'WhatsApp'),
      ),
    )
    .orderBy(desc(advisorConversations.lastMessageAt))
    .limit(1);
  if (!convo) {
    [convo] = await db
      .insert(advisorConversations)
      .values({
        householdId: member.householdId,
        userId: sub.userId,
        title: 'WhatsApp',
      })
      .returning();
  }

  // Persist the inbound message immediately so even if the LLM fails we
  // still have the user's question.
  await db.insert(advisorMessages).values({
    conversationId: convo.id,
    role: 'user',
    content: body,
  });

  // Pull last 10 messages for chat-style context (most recent at the end).
  const history = await db
    .select({
      role: advisorMessages.role,
      content: advisorMessages.content,
    })
    .from(advisorMessages)
    .where(eq(advisorMessages.conversationId, convo.id))
    .orderBy(desc(advisorMessages.createdAt))
    .limit(10);

  const messages: ModelMessage[] = history
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const ctx = { householdId: member.householdId, userId: sub.userId };

  let replyText = '';
  try {
    const result = await generateText({
      model: google(process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'),
      system: buildSystemPrompt(),
      messages,
      tools: {
        getCashFlowSummary: tool({
          description: 'סיכום פיננסי של המחזור הנוכחי.',
          inputSchema: z.object({}),
          execute: withTenantContext(getCashFlowSummary, ctx),
        }),
        getSpendingByCategory: tool({
          description: 'הוצאות לפי קטגוריה בטווח תאריכים.',
          inputSchema: z.object({
            startDate: z.string(),
            endDate: z.string(),
          }),
          execute: withTenantContext(getSpendingByCategory, ctx),
        }),
        getRecurringSummary: tool({
          description: 'הכנסות והוצאות קבועות.',
          inputSchema: z.object({}),
          execute: withTenantContext(getRecurringSummary, ctx),
        }),
        simulateEvent: tool({
          description: 'סימולציה של אירוע פיננסי עתידי.',
          inputSchema: z.object({
            eventType: z.enum([
              'vacation',
              'large_purchase',
              'income_change',
              'one_time_expense',
            ]),
            date: z.string(),
            amount: z.number(),
            description: z.string(),
          }),
          execute: withTenantContext(simulateEvent, ctx),
        }),
        compareSpendingPeriods: tool({
          description: 'השוואה בין שני טווחי תאריכים.',
          inputSchema: z.object({
            periodAStart: z.string(),
            periodAEnd: z.string(),
            periodBStart: z.string(),
            periodBEnd: z.string(),
          }),
          execute: withTenantContext(compareSpendingPeriods, ctx),
        }),
        getSubscriptionAudit: tool({
          description: 'סקירת מנויים והוצאות חוזרות.',
          inputSchema: z.object({}),
          execute: withTenantContext(getSubscriptionAudit, ctx),
        }),
      },
      stopWhen: stepCountIs(5),
    });

    replyText = result.text || '🤔 לא הצלחתי לענות. נסה שוב.';
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('Advisor WhatsApp error:', detail, err);
    // Surface the underlying cause so prod debugging doesn't require log
    // diving for every failed message. Truncate so we don't blow Twilio's
    // 1500-char limit with a giant stack trace.
    const short = detail.slice(0, 250);
    replyText = `שגיאה זמנית: ${short}\nנסה שוב בעוד רגע.`;
  }

  // WhatsApp soft-limits free-form messages to ~1600 chars; truncate to be
  // safe rather than have Twilio reject the send.
  if (replyText.length > 1500) {
    replyText = replyText.slice(0, 1497) + '...';
  }

  await db.insert(advisorMessages).values({
    conversationId: convo.id,
    role: 'assistant',
    content: replyText,
  });
  await db
    .update(advisorConversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(advisorConversations.id, convo.id));

  return twimlReply(replyText);
}

function twimlReply(message: string): NextResponse {
  // XML-escape the message body so quotes / brackets don't break parsing.
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${escaped}</Message></Response>`;
  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
