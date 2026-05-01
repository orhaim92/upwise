'use client';

import { useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { removeMember } from '../actions';
import { t } from '@/lib/i18n/he';

type Member = {
  userId: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  name: string | null;
  email: string;
};

type Props = {
  members: Member[];
  currentUserId: string;
};

export function MembersList({ members, currentUserId }: Props) {
  const [pending, startTransition] = useTransition();

  if (members.length === 0) {
    return (
      <Card className="p-5 text-center text-sm text-slate-500">
        {t.sharing.aloneInHousehold}
      </Card>
    );
  }

  const me = members.find((m) => m.userId === currentUserId);
  const iAmAdmin = me?.role === 'admin';

  function handleRemove(member: Member) {
    const name = member.name?.trim() || member.email;
    if (
      !confirm(t.sharing.removeMemberConfirm.replace('{name}', name))
    ) {
      return;
    }
    startTransition(async () => {
      const r = await removeMember(member.userId);
      if (!r.ok) toast.error(r.error);
      else toast.success(t.sharing.memberRemoved);
    });
  }

  return (
    <ul className="space-y-2">
      {members.map((m) => {
        const initial = (m.name?.trim()?.[0] || m.email[0] || '?').toUpperCase();
        const isSelf = m.userId === currentUserId;
        const canRemove = iAmAdmin && !isSelf;
        return (
          <li key={m.userId}>
            <Card className="p-4 flex items-center gap-3">
              <div className="size-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-semibold shrink-0">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">
                    {m.name?.trim() || m.email}
                  </span>
                  <span
                    className={
                      m.role === 'admin'
                        ? 'text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700'
                        : 'text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600'
                    }
                  >
                    {m.role === 'admin'
                      ? t.sharing.rolesAdmin
                      : t.sharing.rolesMember}
                  </span>
                </div>
                <p className="text-xs text-slate-500" dir="ltr">
                  {m.email}
                </p>
              </div>
              {canRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(m)}
                  disabled={pending}
                  aria-label={t.sharing.removeMember}
                >
                  <Trash2 className="size-4 text-rose-600" />
                </Button>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
