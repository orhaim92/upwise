import { NextResponse } from 'next/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users,
  households,
  householdMembers,
  householdInvitations,
} from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { signupSchema } from '@/lib/validations/auth';
import { hashInvitationToken } from '@/lib/invitations/tokens';

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, password, name, inviteToken } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: 'אימייל זה כבר רשום' },
      { status: 409 },
    );
  }

  // Phase 5: if a valid invite token is provided AND it matches a pending
  // invitation for THIS email, skip auto-creating a household. The user will
  // join via /invite/accept and end up only in the inviter's household.
  let skipHouseholdCreation = false;
  if (inviteToken) {
    const tokenHash = hashInvitationToken(inviteToken);
    const [inv] = await db
      .select({ invitedEmail: householdInvitations.invitedEmail })
      .from(householdInvitations)
      .where(
        and(
          eq(householdInvitations.tokenHash, tokenHash),
          isNull(householdInvitations.acceptedAt),
          gt(householdInvitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (inv && inv.invitedEmail === normalizedEmail) {
      skipHouseholdCreation = true;
    }
  }

  const passwordHash = await hashPassword(password);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: normalizedEmail, passwordHash, name })
      .returning();

    if (skipHouseholdCreation) return { user };

    const [household] = await tx
      .insert(households)
      .values({ name: `משק הבית של ${name}` })
      .returning();

    await tx.insert(householdMembers).values({
      householdId: household.id,
      userId: user.id,
      role: 'admin',
    });

    return { user, household };
  });

  return NextResponse.json({ ok: true, userId: result.user.id });
}
