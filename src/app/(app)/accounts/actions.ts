'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { encryptJSON } from '@/lib/crypto';
import {
  getUserHouseholdId,
  verifyHouseholdAccess,
} from '@/lib/auth/household';
import {
  addAccountSchema,
  updateAccountSchema,
  deleteAccountSchema,
} from '@/lib/validations/accounts';
import { getProvider } from '@/lib/providers';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function listAccounts() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const householdId = await getUserHouseholdId(session.user.id);

  return db
    .select({
      id: accounts.id,
      type: accounts.type,
      provider: accounts.provider,
      displayName: accounts.displayName,
      accountNumberMasked: accounts.accountNumberMasked,
      lastScrapedAt: accounts.lastScrapedAt,
      scrapeStatus: accounts.scrapeStatus,
      scrapeError: accounts.scrapeError,
      isActive: accounts.isActive,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.householdId, householdId))
    .orderBy(accounts.createdAt);
}

export async function addAccount(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = addAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const { providerId, displayName, credentials } = parsed.data;
  const provider = getProvider(providerId);
  if (!provider) return { ok: false, error: 'ספק לא נתמך' };

  for (const field of provider.fields) {
    const value = credentials[field.key];
    if (!value || value.trim().length === 0) {
      return { ok: false, error: `חסר השדה: ${field.label}` };
    }
  }

  const householdId = await getUserHouseholdId(session.user.id);
  const encrypted = encryptJSON(credentials);

  await db.insert(accounts).values({
    householdId,
    type: provider.type,
    provider: provider.id,
    displayName: displayName.trim(),
    encryptedCredentials: encrypted,
  });

  revalidatePath('/accounts');
  return { ok: true };
}

export async function updateAccount(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' };

  const { id, displayName, isActive } = parsed.data;

  const [acc] = await db
    .select({ householdId: accounts.householdId })
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  if (!acc) return { ok: false, error: 'חשבון לא נמצא' };

  await verifyHouseholdAccess(session.user.id, acc.householdId);

  await db
    .update(accounts)
    .set({
      displayName: displayName.trim(),
      ...(typeof isActive === 'boolean' ? { isActive } : {}),
    })
    .where(eq(accounts.id, id));

  revalidatePath('/accounts');
  return { ok: true };
}

export async function deleteAccount(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'לא מחובר' };

  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'מזהה לא תקין' };

  const [acc] = await db
    .select({ householdId: accounts.householdId })
    .from(accounts)
    .where(eq(accounts.id, parsed.data.id))
    .limit(1);
  if (!acc) return { ok: false, error: 'חשבון לא נמצא' };

  await verifyHouseholdAccess(session.user.id, acc.householdId);

  await db.delete(accounts).where(eq(accounts.id, parsed.data.id));

  revalidatePath('/accounts');
  return { ok: true };
}
