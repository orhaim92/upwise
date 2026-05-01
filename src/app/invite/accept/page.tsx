import Link from 'next/link';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db';
import {
  accounts,
  householdInvitations,
  households,
  householdMembers,
  users,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { hashInvitationToken } from '@/lib/invitations/tokens';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AcceptForm } from './_accept-form';
import { t } from '@/lib/i18n/he';

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function AcceptInvitePage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <Layout>
        <p className="text-rose-600">{t.sharing.acceptInviteInvalid}</p>
      </Layout>
    );
  }

  const tokenHash = hashInvitationToken(token);

  const [inv] = await db
    .select({
      id: householdInvitations.id,
      householdId: householdInvitations.householdId,
      invitedEmail: householdInvitations.invitedEmail,
      role: householdInvitations.role,
      expiresAt: householdInvitations.expiresAt,
      acceptedAt: householdInvitations.acceptedAt,
      householdName: households.name,
    })
    .from(householdInvitations)
    .innerJoin(
      households,
      eq(households.id, householdInvitations.householdId),
    )
    .where(eq(householdInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!inv) {
    return (
      <Layout>
        <p className="text-rose-600">{t.sharing.acceptInviteInvalid}</p>
      </Layout>
    );
  }

  if (inv.acceptedAt) {
    return (
      <Layout>
        <p className="text-emerald-600">{t.sharing.acceptInviteAccepted}</p>
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: 'default' }),
            'mt-4 bg-violet-600 text-white hover:bg-violet-700 w-full',
          )}
        >
          {t.dashboard.title}
        </Link>
      </Layout>
    );
  }

  if (inv.expiresAt < new Date()) {
    return (
      <Layout>
        <p className="text-rose-600">{t.sharing.acceptInviteExpired}</p>
      </Layout>
    );
  }

  const session = await auth();

  if (!session?.user?.id) {
    const redirectTo = `/invite/accept?token=${encodeURIComponent(token)}`;
    return (
      <Layout>
        <p className="text-slate-700 mb-2">{t.sharing.acceptInviteBody}</p>
        <p className="text-slate-600 text-sm mb-4">
          {t.sharing.acceptInviteSignedOut}
        </p>
        <div className="flex gap-3">
          <Link
            href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
            className={cn(
              buttonVariants({ variant: 'default' }),
              'bg-violet-600 text-white hover:bg-violet-700',
            )}
          >
            {t.auth.loginButton}
          </Link>
          <Link
            href={`/signup?redirect=${encodeURIComponent(redirectTo)}`}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            {t.auth.signupButton}
          </Link>
        </div>
      </Layout>
    );
  }

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (user && user.email !== inv.invitedEmail) {
    return (
      <Layout>
        <p className="text-rose-600">
          {t.sharing.acceptInviteWrongEmail.replace(
            '{email}',
            inv.invitedEmail,
          )}
        </p>
      </Layout>
    );
  }

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
    return (
      <Layout>
        <p className="text-amber-700">
          {t.sharing.acceptInviteAlreadyMember}
        </p>
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: 'default' }),
            'mt-4 bg-violet-600 text-white hover:bg-violet-700 w-full',
          )}
        >
          {t.dashboard.title}
        </Link>
      </Layout>
    );
  }

  // Block only if the user belongs to a non-orphan household elsewhere.
  // Orphan households (auto-created at signup, no accounts, no co-members)
  // are silently cleaned up by the accept action when the user clicks Accept.
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
      return (
        <Layout>
          <p className="text-rose-600">
            {t.sharing.acceptInviteAlreadyInOther}
          </p>
        </Layout>
      );
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-2">
        {t.sharing.acceptInviteTitle}
      </h1>
      <p className="text-slate-700 mb-4">
        {t.sharing.acceptInviteBody}{' '}
        <strong>{inv.householdName}</strong>
      </p>
      <AcceptForm token={token} />
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
      <Link
        href="/"
        className="text-3xl font-bold mb-8 bg-gradient-to-l from-blue-500 to-violet-500 bg-clip-text text-transparent"
      >
        {t.brand.name}
      </Link>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-8">
        {children}
      </div>
    </div>
  );
}
