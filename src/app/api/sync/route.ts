import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { getUserHouseholdId } from '@/lib/auth/household';
import { syncAccount, syncAllAccounts } from '@/lib/scrapers/sync';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  accountId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const householdId = await getUserHouseholdId(session.user.id);

  try {
    if (parsed.data.accountId) {
      const result = await syncAccount(parsed.data.accountId, householdId);
      return NextResponse.json({ ok: true, results: [result] });
    }
    const results = await syncAllAccounts(householdId);
    return NextResponse.json({ ok: true, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
