import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, households, householdMembers } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { signupSchema } from '@/lib/validations/auth';

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, password, name } = parsed.data;
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

  const passwordHash = await hashPassword(password);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: normalizedEmail, passwordHash, name })
      .returning();

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
