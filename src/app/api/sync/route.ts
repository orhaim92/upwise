import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { getUserHouseholdId } from '@/lib/auth/household';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  accountId: z.string().uuid().optional(),
});

// Sync runs in GitHub Actions (Vercel serverless can't run Puppeteer/Chrome).
// This endpoint just dispatches the workflow and returns immediately.
const GH_OWNER = process.env.GITHUB_REPO_OWNER ?? 'orhaim92';
const GH_REPO = process.env.GITHUB_REPO_NAME ?? 'upwise';
const GH_WORKFLOW = process.env.GITHUB_SYNC_WORKFLOW ?? 'sync.yml';
const GH_REF = process.env.GITHUB_SYNC_REF ?? 'main';

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

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'סנכרון לא מוגדר במערכת (חסר GITHUB_DISPATCH_TOKEN). פנה לאדמין.',
      },
      { status: 500 },
    );
  }

  // workflow_dispatch inputs are scoped to the user's household so a user can
  // never trigger a sync for someone else's data — the workflow runs the same
  // sync code with --household-id=<theirs>.
  const inputs: Record<string, string> = { household_id: householdId };
  if (parsed.data.accountId) {
    inputs.account_id = parsed.data.accountId;
  }

  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`;
  const ghRes = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: GH_REF, inputs }),
  });

  if (!ghRes.ok) {
    const text = await ghRes.text().catch(() => '');
    console.error('GitHub dispatch failed:', ghRes.status, text);
    return NextResponse.json(
      {
        ok: false,
        error: `GitHub dispatch error: ${ghRes.status}`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    dispatched: true,
  });
}
