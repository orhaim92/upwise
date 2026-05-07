import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { Bell, Users, MessageCircle, ChevronLeft, Fingerprint } from 'lucide-react';
import { auth } from '@/lib/auth/config';
import { getUserHouseholdId } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { households } from '@/lib/db/schema';
import { Card } from '@/components/ui/card';
import { CycleSettingsForm } from './_components/cycle-settings-form';
import { t } from '@/lib/i18n/he';

export default async function SettingsPage() {
  const session = await auth();
  const householdId = await getUserHouseholdId(session!.user.id);

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">{t.settings.title}</h1>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">{t.settings.profile}</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-slate-600 w-20">{t.settings.profileName}:</dt>
            <dd className="font-medium">{session?.user.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-600 w-20">{t.settings.profileEmail}:</dt>
            <dd className="font-medium" dir="ltr">
              {session?.user.email}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold">{t.cycleSettings.title}</h2>
          <p className="text-sm text-slate-600 mt-1">
            {t.cycleSettings.startDayHint}
          </p>
        </div>
        <CycleSettingsForm
          initialDay={household.billingCycleStartDay}
        />
      </Card>

      <Link
        href="/settings/sharing"
        className="block group"
      >
        <Card className="p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
          <div className="size-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
            <Users className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t.sharing.title}</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              {t.sharing.subtitle}
            </p>
          </div>
          <ChevronLeft className="size-5 text-slate-400 group-hover:text-slate-600 shrink-0" />
        </Card>
      </Link>

      <Link
        href="/settings/whatsapp"
        className="block group"
      >
        <Card className="p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
          <div className="size-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <MessageCircle className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t.whatsapp.title}</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              {t.whatsapp.subtitle}
            </p>
          </div>
          <ChevronLeft className="size-5 text-slate-400 group-hover:text-slate-600 shrink-0" />
        </Card>
      </Link>

      <Link href="/settings/passkeys" className="block group">
        <Card className="p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
          <div className="size-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
            <Fingerprint className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t.passkeys.title}</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              {t.passkeys.subtitle}
            </p>
          </div>
          <ChevronLeft className="size-5 text-slate-400 group-hover:text-slate-600 shrink-0" />
        </Card>
      </Link>

      <Link href="/settings/push" className="block group">
        <Card className="p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
          <div className="size-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
            <Bell className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t.push.title}</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              {t.push.subtitle}
            </p>
          </div>
          <ChevronLeft className="size-5 text-slate-400 group-hover:text-slate-600 shrink-0" />
        </Card>
      </Link>
    </div>
  );
}
