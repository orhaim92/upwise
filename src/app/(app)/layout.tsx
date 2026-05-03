import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth/config';
import { Button } from '@/components/ui/button';
import { MainNav } from './_components/main-nav';
import { advisorEnabled } from '@/lib/features';
import { t } from '@/lib/i18n/he';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // The signOut form is a server action so it has to be rendered server-side.
  // We pass it as a child to the client nav so the nav can decide where to
  // place it (header on desktop, drawer on mobile).
  const signOutForm = (
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
  );

  return (
    <div className="min-h-screen flex flex-col">
      <MainNav
        userName={session.user.name}
        signOutForm={signOutForm}
        advisorEnabled={advisorEnabled()}
      />
      <main className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
