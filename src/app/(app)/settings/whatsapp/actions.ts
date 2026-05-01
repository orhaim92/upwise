'use server';

import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { whatsappSubscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { phoneSchema, isValidIsraeliMobile } from '@/lib/validations/phone';
import { sendWhatsApp } from '@/lib/twilio/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createHash, randomInt } from 'crypto';
import { addMinutes } from 'date-fns';

const requestCodeSchema = z.object({
  phone: phoneSchema,
});

const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'קוד 6 ספרות'),
});

const updateSettingsSchema = z.object({
  dailySummaryEnabled: z.boolean(),
  sendTimeLocal: z.string().regex(/^\d{2}:\d{2}$/, 'שעה לא תקינה'), // "09:00"
});

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

export async function getMySubscription() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const [sub] = await db
    .select()
    .from(whatsappSubscriptions)
    .where(eq(whatsappSubscriptions.userId, session.user.id))
    .limit(1);
  return sub ?? null;
}

export async function requestVerificationCode(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = requestCodeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'מספר לא תקין',
    };
  }

  const phone = parsed.data.phone;
  if (!isValidIsraeliMobile(phone)) {
    return { ok: false, error: 'מספר ישראלי לא תקין' };
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = addMinutes(new Date(), 10);

  await db
    .insert(whatsappSubscriptions)
    .values({
      userId: session.user.id,
      phoneE164: phone,
      verificationCodeHash: codeHash,
      verificationExpiresAt: expiresAt,
      isVerified: false,
    })
    .onConflictDoUpdate({
      target: whatsappSubscriptions.userId,
      set: {
        phoneE164: phone,
        verificationCodeHash: codeHash,
        verificationExpiresAt: expiresAt,
        isVerified: false,
      },
    });

  const message = `UpWise: קוד האימות שלך הוא ${code}. תקף ל-10 דקות.`;
  const result = await sendWhatsApp(phone, message);
  if (!result.ok) {
    const hint =
      'ודא שהצטרפת ל-Twilio Sandbox (שלח "join <מילת-קוד>" ל-+14155238886 מהוואטסאפ שלך).';
    return {
      ok: false,
      error: result.error
        ? `שגיאת Twilio: ${result.error}. ${hint}`
        : `לא ניתן לשלוח קוד. ${hint}`,
    };
  }

  revalidatePath('/settings/whatsapp');
  return { ok: true };
}

export async function verifyCode(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = verifyCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'קוד לא תקין' };
  }

  const [sub] = await db
    .select()
    .from(whatsappSubscriptions)
    .where(eq(whatsappSubscriptions.userId, session.user.id))
    .limit(1);
  if (!sub || !sub.verificationCodeHash || !sub.verificationExpiresAt) {
    return { ok: false, error: 'אין קוד פעיל. בקש קוד חדש.' };
  }

  if (sub.verificationExpiresAt < new Date()) {
    return { ok: false, error: 'הקוד פג. בקש קוד חדש.' };
  }

  if (hashCode(parsed.data.code) !== sub.verificationCodeHash) {
    return { ok: false, error: 'קוד שגוי' };
  }

  await db
    .update(whatsappSubscriptions)
    .set({
      isVerified: true,
      verificationCodeHash: null,
      verificationExpiresAt: null,
      optedOutAt: null,
    })
    .where(eq(whatsappSubscriptions.userId, session.user.id));

  revalidatePath('/settings/whatsapp');
  return { ok: true };
}

export async function updateWhatsAppSettings(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    };
  }

  await db
    .update(whatsappSubscriptions)
    .set({
      dailySummaryEnabled: parsed.data.dailySummaryEnabled,
      sendTimeLocal: parsed.data.sendTimeLocal + ':00',
    })
    .where(eq(whatsappSubscriptions.userId, session.user.id));

  revalidatePath('/settings/whatsapp');
  return { ok: true };
}

export async function unsubscribe(): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };

  await db
    .update(whatsappSubscriptions)
    .set({
      dailySummaryEnabled: false,
      optedOutAt: new Date(),
    })
    .where(eq(whatsappSubscriptions.userId, session.user.id));

  revalidatePath('/settings/whatsapp');
  return { ok: true };
}

export async function sendTestMessage(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const [sub] = await db
    .select()
    .from(whatsappSubscriptions)
    .where(eq(whatsappSubscriptions.userId, session.user.id))
    .limit(1);
  if (!sub || !sub.isVerified) {
    return { ok: false, error: 'מספר לא מאומת' };
  }

  const result = await sendWhatsApp(
    sub.phoneE164,
    'בוקר טוב 🌟\nזוהי הודעת בדיקה מ-UpWise. ההתראות פועלות כראוי.',
  );
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}
