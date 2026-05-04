'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().max(500).optional(),
  deviceLabel: z.string().max(100).optional(),
});

const updatePrefsSchema = z.object({
  id: z.string().uuid(),
  dailyDigestEnabled: z.boolean().optional(),
  lowBalanceEnabled: z.boolean().optional(),
  insightsEnabled: z.boolean().optional(),
  syncCompletionEnabled: z.boolean().optional(),
  sendTimeLocal: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
});

export async function listMyDevices() {
  const session = await auth();
  if (!session?.user?.id) return [];

  return db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      userAgent: pushSubscriptions.userAgent,
      deviceLabel: pushSubscriptions.deviceLabel,
      dailyDigestEnabled: pushSubscriptions.dailyDigestEnabled,
      lowBalanceEnabled: pushSubscriptions.lowBalanceEnabled,
      insightsEnabled: pushSubscriptions.insightsEnabled,
      syncCompletionEnabled: pushSubscriptions.syncCompletionEnabled,
      sendTimeLocal: pushSubscriptions.sendTimeLocal,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, session.user.id))
    .orderBy(pushSubscriptions.createdAt);
}

// Crude UA-based device label so users can tell devices apart in the list.
function defaultDeviceLabel(ua: string | undefined): string {
  if (!ua) return 'מכשיר';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'מכשיר';
}

export async function subscribeDevice(
  input: unknown,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = subscribeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  // Upsert by endpoint — same endpoint re-subscribing (e.g., after re-grant)
  // should refresh the keys, not create a duplicate row.
  const existing = await db
    .select({
      id: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, parsed.data.endpoint))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].userId !== session.user.id) {
      return { ok: false, error: 'מנוי קיים למשתמש אחר' };
    }
    await db
      .update(pushSubscriptions)
      .set({
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        userAgent: parsed.data.userAgent ?? null,
        failureCount: 0,
      })
      .where(eq(pushSubscriptions.id, existing[0].id));
    revalidatePath('/settings/push');
    return { ok: true, id: existing[0].id };
  }

  const [inserted] = await db
    .insert(pushSubscriptions)
    .values({
      userId: session.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      userAgent: parsed.data.userAgent ?? null,
      deviceLabel:
        parsed.data.deviceLabel ?? defaultDeviceLabel(parsed.data.userAgent),
    })
    .returning({ id: pushSubscriptions.id });

  revalidatePath('/settings/push');
  return { ok: true, id: inserted.id };
}

export async function updateDevicePreferences(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = updatePrefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const [sub] = await db
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.id, parsed.data.id))
    .limit(1);
  if (!sub || sub.userId !== session.user.id) {
    return { ok: false, error: 'לא נמצא' };
  }

  const { id, ...rest } = parsed.data;
  await db
    .update(pushSubscriptions)
    .set(rest)
    .where(eq(pushSubscriptions.id, id));

  revalidatePath('/settings/push');
  return { ok: true };
}

export async function removeDevice(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const [sub] = await db
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.id, id))
    .limit(1);
  if (!sub || sub.userId !== session.user.id) {
    return { ok: false, error: 'לא נמצא' };
  }

  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  revalidatePath('/settings/push');
  return { ok: true };
}

export async function sendTestPushToDevice(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const [sub] = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.id, id),
        eq(pushSubscriptions.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!sub) return { ok: false, error: 'לא נמצא' };

  // Lazy-import the server helper so the action file stays edge-friendly
  // (web-push pulls in node:crypto and a few other Node-only deps).
  const { sendPushToSubscription } = await import('@/lib/pwa/push-server');
  const result = await sendPushToSubscription(sub, {
    title: 'UpWise',
    body: '🌟 התראות פועלות כראוי',
    url: '/dashboard',
    tag: 'test',
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
