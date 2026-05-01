import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  householdMembers,
  whatsappSubscriptions,
} from '@/lib/db/schema';
import { sendWhatsApp } from '@/lib/twilio/client';
import { buildDigest } from '@/lib/whatsapp/digest';

const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel Cron triggers GET once per day (Hobby tier caps at daily). The
// route sends the digest to every verified, enabled, non-opted-out
// subscriber. The `send_time_local` field is preserved as user intent for
// when we move to hourly cron (Pro tier or self-hosted scheduler), but is
// not used as a filter today.
//
// Sequential per-user dispatch is fine for personal-scale use (well under 50
// subscribers). Twilio sandbox restrictions still apply: a recipient must
// have replied to the sender within the last 24h to receive a free-form
// message — see the keep-alive notice on the WhatsApp settings page.
export async function GET(req: Request) {
  if (CRON_SECRET) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

  const now = new Date();

  const candidates = await db
    .select({
      userId: whatsappSubscriptions.userId,
      phoneE164: whatsappSubscriptions.phoneE164,
      lastSentAt: whatsappSubscriptions.lastSentAt,
    })
    .from(whatsappSubscriptions)
    .where(
      and(
        eq(whatsappSubscriptions.isVerified, true),
        eq(whatsappSubscriptions.dailySummaryEnabled, true),
        isNull(whatsappSubscriptions.optedOutAt),
      ),
    );

  type Result = {
    userId: string;
    sent: boolean;
    error?: string;
    skipped?: string;
  };
  const results: Result[] = [];

  for (const c of candidates) {
    // Idempotency: if cron fires twice in the same window, don't double-send.
    // Threshold is 12h so a manual re-trigger same day is blocked but a
    // genuine next-day cron always proceeds. `?force=1` bypasses for
    // testing — the CRON_SECRET still gates the endpoint.
    if (!force && c.lastSentAt) {
      const hoursSince =
        (now.getTime() - new Date(c.lastSentAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 12) {
        results.push({ userId: c.userId, sent: false, skipped: 'recent send' });
        continue;
      }
    }

    const [member] = await db
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, c.userId))
      .limit(1);
    if (!member) {
      results.push({ userId: c.userId, sent: false, error: 'no household' });
      continue;
    }

    try {
      const message = await buildDigest(member.householdId);
      const r = await sendWhatsApp(c.phoneE164, message);
      if (r.ok) {
        await db
          .update(whatsappSubscriptions)
          .set({ lastSentAt: now })
          .where(eq(whatsappSubscriptions.userId, c.userId));
        results.push({ userId: c.userId, sent: true });
      } else {
        results.push({ userId: c.userId, sent: false, error: r.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'send failed';
      results.push({ userId: c.userId, sent: false, error: msg });
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}
