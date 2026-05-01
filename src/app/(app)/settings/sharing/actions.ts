'use server';

import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import {
  householdInvitations,
  householdMembers,
  users,
} from '@/lib/db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getUserHouseholdId } from '@/lib/auth/household';
import { generateInvitationToken } from '@/lib/invitations/tokens';
import { sendInvitationEmail } from '@/lib/email/send';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addDays } from 'date-fns';

const inviteSchema = z.object({
  email: z.string().email('כתובת אימייל לא תקינה'),
});

export async function listMembers() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const householdId = await getUserHouseholdId(session.user.id);

  return db
    .select({
      userId: householdMembers.userId,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
      name: users.name,
      email: users.email,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(householdMembers.joinedAt);
}

export async function listPendingInvitations() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const householdId = await getUserHouseholdId(session.user.id);
  const now = new Date();

  return db
    .select({
      id: householdInvitations.id,
      invitedEmail: householdInvitations.invitedEmail,
      role: householdInvitations.role,
      expiresAt: householdInvitations.expiresAt,
      createdAt: householdInvitations.createdAt,
    })
    .from(householdInvitations)
    .where(
      and(
        eq(householdInvitations.householdId, householdId),
        isNull(householdInvitations.acceptedAt),
        gt(householdInvitations.expiresAt, now),
      ),
    )
    .orderBy(householdInvitations.createdAt);
}

export async function createInvitation(
  input: unknown,
): Promise<{
  ok: boolean;
  error?: string;
  link?: string;
  emailSent?: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    };
  }

  const householdId = await getUserHouseholdId(session.user.id);

  const { raw: rawToken, hash: tokenHash } = generateInvitationToken();
  const expiresAt = addDays(new Date(), 7);
  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  await db.insert(householdInvitations).values({
    householdId,
    invitedEmail: normalizedEmail,
    invitedBy: session.user.id,
    role: 'member',
    tokenHash,
    expiresAt,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const link = `${baseUrl}/invite/accept?token=${rawToken}`;

  // Email the link to the recipient. If SMTP isn't configured, this returns
  // false and the inviter falls back to copy-paste UX.
  const emailSent = await sendInvitationEmail({
    to: normalizedEmail,
    link,
    inviterName: session.user.name ?? null,
  }).catch((err) => {
    console.error('invitation email send failed:', err);
    return false;
  });

  revalidatePath('/settings/sharing');
  return { ok: true, link, emailSent };
}

export async function cancelInvitation(
  invitationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [inv] = await db
    .select({ householdId: householdInvitations.householdId })
    .from(householdInvitations)
    .where(eq(householdInvitations.id, invitationId))
    .limit(1);
  if (!inv || inv.householdId !== householdId) {
    return { ok: false, error: 'לא נמצא' };
  }

  await db
    .delete(householdInvitations)
    .where(eq(householdInvitations.id, invitationId));
  revalidatePath('/settings/sharing');
  return { ok: true };
}

export async function removeMember(
  targetUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  if (targetUserId === session.user.id) {
    return { ok: false, error: 'לא ניתן להסיר את עצמך' };
  }

  const householdId = await getUserHouseholdId(session.user.id);

  const [target] = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, targetUserId),
      ),
    )
    .limit(1);
  if (!target) return { ok: false, error: 'לא נמצא' };

  if (target.role === 'admin') {
    const admins = await db
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.role, 'admin'),
        ),
      );
    if (admins.length <= 1) {
      return { ok: false, error: 'לא ניתן להסיר את האדמין האחרון' };
    }
  }

  await db
    .delete(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, targetUserId),
      ),
    );

  revalidatePath('/settings/sharing');
  return { ok: true };
}
