'use server';

import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { authenticators } from '@/lib/db/schema';
import {
  buildRegistrationOptions,
  verifyAndSaveRegistration,
} from '@/lib/auth/webauthn/server';
import { setChallenge } from '@/lib/auth/webauthn/challenge';

// Authenticated server actions for managing the signed-in user's passkeys.
// Generation actions stash the challenge in an httpOnly cookie; the matching
// verify action reads + clears it so each ceremony is single-use.

export type PasskeySummary = {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
  deviceType: string | null;
};

export async function getPasskeyRegistrationOptions(): Promise<
  | { ok: true; options: Awaited<ReturnType<typeof buildRegistrationOptions>> }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthenticated' };

  const options = await buildRegistrationOptions({
    userId: session.user.id,
    userName: session.user.email ?? session.user.id,
    userDisplayName: session.user.name ?? null,
  });
  await setChallenge('registration', options.challenge);
  return { ok: true, options };
}

export async function verifyPasskeyRegistration(input: {
  // The JSON object the browser produced from startRegistration().
  // Typed loosely here because the SimpleWebAuthn type is internal; the
  // server-side helper validates the shape.
  response: Parameters<typeof verifyAndSaveRegistration>[0]['response'];
  label?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthenticated' };

  const { readAndClearChallenge } = await import(
    '@/lib/auth/webauthn/challenge'
  );
  const challenge = await readAndClearChallenge('registration');
  if (!challenge) return { ok: false, error: 'challenge_missing' };

  return verifyAndSaveRegistration({
    userId: session.user.id,
    expectedChallenge: challenge,
    response: input.response,
    label: input.label ?? null,
  });
}

export async function listMyPasskeys(): Promise<PasskeySummary[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const rows = await db
    .select({
      id: authenticators.id,
      label: authenticators.label,
      createdAt: authenticators.createdAt,
      lastUsedAt: authenticators.lastUsedAt,
      backedUp: authenticators.backedUp,
      deviceType: authenticators.deviceType,
    })
    .from(authenticators)
    .where(eq(authenticators.userId, session.user.id));

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    backedUp: r.backedUp,
    deviceType: r.deviceType,
  }));
}

export async function renamePasskey(input: {
  id: string;
  label: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthenticated' };

  const trimmed = input.label.trim().slice(0, 64);
  if (!trimmed) return { ok: false, error: 'empty_label' };

  await db
    .update(authenticators)
    .set({ label: trimmed })
    .where(
      and(
        eq(authenticators.id, input.id),
        eq(authenticators.userId, session.user.id),
      ),
    );
  return { ok: true };
}

export async function deletePasskey(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthenticated' };

  await db
    .delete(authenticators)
    .where(
      and(
        eq(authenticators.id, input.id),
        eq(authenticators.userId, session.user.id),
      ),
    );
  return { ok: true };
}
