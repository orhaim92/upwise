import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { householdMembers } from '@/lib/db/schema';

export async function getUserHouseholdId(userId: string): Promise<string> {
  const [member] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  if (!member) throw new Error('User has no household');
  return member.householdId;
}

export async function verifyHouseholdAccess(
  userId: string,
  householdId: string,
): Promise<void> {
  const [member] = await db
    .select()
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, userId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1);
  if (!member) throw new Error('Forbidden: not a member of this household');
}
