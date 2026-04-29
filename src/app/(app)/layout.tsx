import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth/config';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n/he';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <Link
              href="/dashboard"
              className="text-xl font-bold bg-gradient-to-l from-blue-500 to-violet-500 bg-clip-text text-transparent"
            >
              {t.brand.name}
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link
                href="/dashboard"
                className="text-slate-700 hover:text-violet-600 transition-colors"
              >
                {t.dashboard.title}
              </Link>
              <Link
                href="/accounts"
                className="text-slate-700 hover:text-violet-600 transition-colors"
              >
                {t.accounts.title}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{session.user.name}</span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <Button variant="ghost" size="sm" type="submit">
                {t.auth.logout}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full p-6">{children}</main>
    </div>
  );
}
