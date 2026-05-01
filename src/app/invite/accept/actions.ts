'use server';

import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import {
  accounts,
  households,
  householdInvitations,
  householdMembers,
  users,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { hashInvitationToken } from '@/lib/invitations/tokens';
import { revalidatePath } from 'next/cache';

export async function acceptInvitation(
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const tokenHash = hashInvitationToken(token);

  const [inv] = await db
    .select()
    .from(householdInvitations)
    .where(eq(householdInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!inv) return { ok: false, error: 'הזמנה לא תקינה' };
  if (inv.acceptedAt) return { ok: false, error: 'ההזמנה כבר התקבלה' };
  if (inv.expiresAt < new Date())
    return { ok: false, error: 'ההזמנה פגה' };

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user || user.email !== inv.invitedEmail) {
    return { ok: false, error: 'ההזמנה הזו עבור משתמש אחר' };
  }

  // Already a member of THIS household → block
  const [existingMembership] = await db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, inv.householdId),
        eq(householdMembers.userId, session.user.id),
      ),
    )
    .limit(1);

  if (existingMembership) {
    return { ok: false, error: 'אתה כבר חבר במשק הבית הזה' };
  }

  // Multi-household browsing isn't supported yet. Two cases here:
  //
  // (1) The user is already in another household with REAL DATA (accounts /
  //     other members). Refuse — multi-household is a future phase.
  //
  // (2) The user is alone in an orphan household (auto-created at signup,
  //     before they accepted this invite). It's safe to delete it and join
  //     the inviter's instead. This commonly happens when the recipient
  //     signs up directly (not via the invite link) and only later clicks
  //     the link. Cascade FKs clean up auto-seeded categories etc.
  const otherMemberships = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, session.user.id));

  for (const mem of otherMemberships) {
    if (mem.householdId === inv.householdId) continue;

    const otherMembers = await db
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(eq(householdMembers.householdId, mem.householdId));
    const accountRows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.householdId, mem.householdId))
      .limit(1);

    const isOrphan = otherMembers.length === 1 && accountRows.length === 0;
    if (!isOrphan) {
      return {
        ok: false,
        error:
          'אתה כבר חבר במשק בית אחר. בשלב הזה לא ניתן לחבר שני משקי בית.',
      };
    }
  }

  await db.transaction(async (tx) => {
    // Drop any orphan households we found above
    for (const mem of otherMemberships) {
      if (mem.householdId === inv.householdId) continue;
      await tx.delete(households).where(eq(households.id, mem.householdId));
    }

    await tx.insert(householdMembers).values({
      householdId: inv.householdId,
      userId: session.user!.id,
      role: inv.role,
    });
    await tx
      .update(householdInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(householdInvitations.id, inv.id));
  });

  revalidatePath('/dashboard');
  return { ok: true };
}
