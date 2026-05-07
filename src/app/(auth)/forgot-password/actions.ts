'use server';

import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { addHours } from 'date-fns';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { sendPasswordResetEmail } from '@/lib/email/send';

// Hash token for storage (so a leaked DB row can't be used directly).
// SHA-256 is enough — these are random 32-byte values, not user secrets.
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const requestSchema = z.object({
  email: z.string().email(),
});

// Generates a reset token, stores its hash, emails the link.
//
// Always returns ok:true regardless of whether the email exists — otherwise
// the form becomes an account-enumeration oracle. The actual email is only
// sent if the user exists AND SMTP is configured. The page also returns
// `link` in dev when SMTP isn't configured so the developer can copy-paste.
export async function requestPasswordReset(input: unknown): Promise<{
  ok: boolean;
  // Only set in dev when SMTP isn't configured — never returned in prod.
  devLink?: string;
}> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: true }; // pretend OK; don't leak info

  const email = parsed.data.email.toLowerCase().trim();

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) return { ok: true };

  const raw = randomBytes(32).toString('hex'); // 64-char hex
  const tokenHash = hashToken(raw);
  const expiresAt = addHours(new Date(), 1);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '';
  const link = `${baseUrl}/reset-password/${raw}`;

  const sent = await sendPasswordResetEmail({ to: email, link });

  if (!sent && process.env.NODE_ENV !== 'production') {
    return { ok: true, devLink: link };
  }

  return { ok: true };
}

const resetSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(128),
});

// Consumes a reset token and updates the user's password. Validates that
// the token exists, hasn't been used, and hasn't expired. Returns a
// shape-friendly result so the UI can show specific errors.
export async function performPasswordReset(input: unknown): Promise<{
  ok: boolean;
  error?: 'invalid' | 'expired' | 'invalid_password';
}> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.some((i) => i.path[0] === 'password')
        ? 'invalid_password'
        : 'invalid',
    };
  }

  const tokenHash = hashToken(parsed.data.token);

  const [row] = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
    })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, error: 'invalid' };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, row.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
  });

  return { ok: true };
}
