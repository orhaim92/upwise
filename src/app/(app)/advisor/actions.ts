'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import {
  advisorConversations,
  advisorMessages,
} from '@/lib/db/schema';
import { getUserHouseholdId } from '@/lib/auth/household';

const createConvoSchema = z.object({
  title: z.string().min(1).max(100).optional(),
});

const saveMessageSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export async function listConversations() {
  const session = await auth();
  if (!session?.user?.id) return [];
  const householdId = await getUserHouseholdId(session.user.id);

  return db
    .select({
      id: advisorConversations.id,
      title: advisorConversations.title,
      lastMessageAt: advisorConversations.lastMessageAt,
      createdAt: advisorConversations.createdAt,
    })
    .from(advisorConversations)
    .where(
      and(
        eq(advisorConversations.householdId, householdId),
        eq(advisorConversations.userId, session.user.id),
      ),
    )
    .orderBy(desc(advisorConversations.lastMessageAt))
    .limit(30);
}

export async function getConversation(id: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const householdId = await getUserHouseholdId(session.user.id);

  const [convo] = await db
    .select()
    .from(advisorConversations)
    .where(
      and(
        eq(advisorConversations.id, id),
        eq(advisorConversations.householdId, householdId),
        eq(advisorConversations.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!convo) return null;

  const messages = await db
    .select({
      id: advisorMessages.id,
      role: advisorMessages.role,
      content: advisorMessages.content,
      createdAt: advisorMessages.createdAt,
    })
    .from(advisorMessages)
    .where(eq(advisorMessages.conversationId, id))
    .orderBy(advisorMessages.createdAt);

  return { ...convo, messages };
}

export async function createConversation(
  input: unknown,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = createConvoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  const [convo] = await db
    .insert(advisorConversations)
    .values({
      householdId,
      userId: session.user.id,
      title: parsed.data.title ?? null,
    })
    .returning({ id: advisorConversations.id });

  revalidatePath('/advisor');
  return { ok: true, id: convo.id };
}

export async function saveMessage(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = saveMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const householdId = await getUserHouseholdId(session.user.id);

  // Verify the conversation belongs to this user/household before writing.
  const [convo] = await db
    .select({
      householdId: advisorConversations.householdId,
      title: advisorConversations.title,
    })
    .from(advisorConversations)
    .where(eq(advisorConversations.id, parsed.data.conversationId))
    .limit(1);
  if (!convo || convo.householdId !== householdId) {
    return { ok: false, error: 'שיחה לא נמצאה' };
  }

  await db.transaction(async (tx) => {
    await tx.insert(advisorMessages).values({
      conversationId: parsed.data.conversationId,
      role: parsed.data.role,
      content: parsed.data.content,
    });

    // First user message also seeds the conversation title (truncated).
    const updates: { lastMessageAt: Date; title?: string } = {
      lastMessageAt: new Date(),
    };
    if (parsed.data.role === 'user' && !convo.title) {
      updates.title = parsed.data.content.slice(0, 60);
    }
    await tx
      .update(advisorConversations)
      .set(updates)
      .where(eq(advisorConversations.id, parsed.data.conversationId));
  });

  return { ok: true };
}

export async function deleteConversation(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const householdId = await getUserHouseholdId(session.user.id);

  await db
    .delete(advisorConversations)
    .where(
      and(
        eq(advisorConversations.id, id),
        eq(advisorConversations.householdId, householdId),
        eq(advisorConversations.userId, session.user.id),
      ),
    );

  revalidatePath('/advisor');
  return { ok: true };
}
