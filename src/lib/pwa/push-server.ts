import webpush from 'web-push';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { householdMembers, pushSubscriptions } from '@/lib/db/schema';

// VAPID config is set lazily on first send so a missing env var doesn't
// crash module load (e.g., during build, or when push is unconfigured).
let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID env vars not configured');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

type SubscriptionRow = typeof pushSubscriptions.$inferSelect;
type PushPrefKey =
  | 'dailyDigestEnabled'
  | 'lowBalanceEnabled'
  | 'insightsEnabled'
  | 'syncCompletionEnabled';

// Fan-out helper: send to one stored subscription, with auto-cleanup on
// 404/410 (subscription is gone) and counter-based retirement on persistent
// failures. The push services themselves throttle aggressively, so even
// well-behaved senders see occasional 5xx — only retire after 5 in a row.
export async function sendPushToSubscription(
  sub: SubscriptionRow,
  payload: PushPayload,
): Promise<{ ok: boolean; error?: string; gone?: boolean }> {
  ensureConfigured();

  const pushSub = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };

  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload));
    if (sub.failureCount > 0) {
      await db
        .update(pushSubscriptions)
        .set({ failureCount: 0 })
        .where(eq(pushSubscriptions.id, sub.id));
    }
    return { ok: true };
  } catch (err: unknown) {
    const e = err as {
      statusCode?: number;
      body?: string;
      message?: string;
    };
    const code = e.statusCode;

    // 404 / 410 = subscription is gone (user revoked, browser/OS uninstalled).
    if (code === 404 || code === 410) {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, sub.id));
      return { ok: false, gone: true, error: `Subscription gone (${code})` };
    }

    // Soft failure — bump counter, retire after 5.
    await db
      .update(pushSubscriptions)
      .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(eq(pushSubscriptions.id, sub.id));
    if (sub.failureCount + 1 >= 5) {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, sub.id));
    }
    return { ok: false, error: e.message ?? `HTTP ${code ?? '?'}` };
  }
}

// Send to all active subscriptions of a user, gated by which preference
// applies to this notification kind.
export async function sendPushToUser(
  userId: string,
  prefKey: PushPrefKey,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    if (!sub[prefKey]) continue;
    const r = await sendPushToSubscription(sub, payload);
    if (r.ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

// Send to every household member who has an opted-in subscription.
export async function sendPushToHousehold(
  householdId: string,
  prefKey: PushPrefKey,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const members = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));

  const total = { sent: 0, failed: 0 };
  for (const m of members) {
    const r = await sendPushToUser(m.userId, prefKey, payload);
    total.sent += r.sent;
    total.failed += r.failed;
  }
  return total;
}
