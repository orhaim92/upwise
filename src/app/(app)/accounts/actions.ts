'use server';

import { and, eq, sql } from 'drizzle-orm';
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
      currentBalance: accounts.currentBalance,
      balanceUpdatedAt: accounts.balanceUpdatedAt,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.householdId, householdId))
    .orderBy(accounts.createdAt);
}

export async function listBankAccountsLight() {
  const session = await auth();
  if (!session?.user?.id) return [];
  const householdId = await getUserHouseholdId(session.user.id);

  return db
    .select({
      id: accounts.id,
      displayName: accounts.displayName,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, householdId),
        eq(accounts.type, 'bank'),
        eq(accounts.isActive, true),
      ),
    )
    .orderBy(accounts.displayName);
}

export async function listCreditCardAccountsLight() {
  const session = await auth();
  if (!session?.user?.id) return [];
  const householdId = await getUserHouseholdId(session.user.id);

  return db
    .select({
      id: accounts.id,
      displayName: accounts.displayName,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.householdId, householdId),
        eq(accounts.type, 'credit_card'),
        eq(accounts.isActive, true),
      ),
    )
    .orderBy(accounts.displayName);
}

// Phase 4.8: returns distinct (account, card_last_four) pairs from existing
// transactions — i.e. each physical card we've actually scraped, not just the
// CC account login. Used by the mark-as-card-statement dialog.
export async function listCardsForHousehold(): Promise<
  Array<{ accountId: string; accountDisplayName: string; cardLastFour: string }>
> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const householdId = await getUserHouseholdId(session.user.id);

  const rows = await db.execute<{
    account_id: string;
    display_name: string;
    card_last_four: string;
  }>(sql`
    SELECT DISTINCT
      t.account_id,
      a.display_name,
      t.card_last_four
    FROM transactions t
    INNER JOIN accounts a ON a.id = t.account_id
    WHERE t.household_id = ${householdId}
      AND a.type = 'credit_card'
      AND t.card_last_four IS NOT NULL
    ORDER BY a.display_name, t.card_last_four
  `);

  const list: Array<{
    account_id: string;
    display_name: string;
    card_last_four: string;
  }> =
    (rows as unknown as {
      rows?: Array<{
        account_id: string;
        display_name: string;
        card_last_four: string;
      }>;
    })?.rows ??
    (rows as unknown as Array<{
      account_id: string;
      display_name: string;
      card_last_four: string;
    }>);

  return list.map((r) => ({
    accountId: r.account_id,
    accountDisplayName: r.display_name,
    cardLastFour: r.card_last_four,
  }));
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
  revalidatePath('/transactions');
  revalidatePath('/dashboard');
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
