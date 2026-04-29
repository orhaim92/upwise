import { auth } from '@/lib/auth/config';
import { Card } from '@/components/ui/card';
import { t } from '@/lib/i18n/he';

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t.dashboard.title}</h1>
        <p className="text-slate-600 mt-1">
          {t.dashboard.welcome}, {session?.user.name}
        </p>
      </div>

      <Card className="p-12 text-center bg-white">
        <p className="text-slate-500">{t.dashboard.placeholder}</p>
      </Card>
    </div>
  );
}
