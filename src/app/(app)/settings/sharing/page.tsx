import { auth } from '@/lib/auth/config';
import { listMembers, listPendingInvitations } from './actions';
import { MembersList } from './_components/members-list';
import { InvitationsList } from './_components/invitations-list';
import { InviteDialog } from './_components/invite-dialog';
import { t } from '@/lib/i18n/he';

export default async function SharingPage() {
  const session = await auth();
  const [members, invitations] = await Promise.all([
    listMembers(),
    listPendingInvitations(),
  ]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.sharing.title}</h1>
          <p className="text-slate-600 mt-1">{t.sharing.subtitle}</p>
        </div>
        <InviteDialog />
      </div>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          {t.sharing.members}
        </h2>
        <MembersList members={members} currentUserId={session!.user.id} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          {t.sharing.pendingInvitations}
        </h2>
        <InvitationsList invitations={invitations} />
      </section>
    </div>
  );
}
