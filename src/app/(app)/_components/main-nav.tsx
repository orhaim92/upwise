'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n/he';

type NavLink = { href: string; label: string; ai?: boolean };

type Props = {
  userName: string | null | undefined;
  signOutForm: React.ReactNode;
  advisorEnabled: boolean;
};

export function MainNav({ userName, signOutForm, advisorEnabled }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links: NavLink[] = [
    { href: '/dashboard', label: t.dashboard.title },
    { href: '/transactions', label: t.transactions.title },
    { href: '/recurring', label: t.recurring.title },
    { href: '/goals', label: t.goals.title },
    { href: '/accounts', label: t.accounts.title },
    ...(advisorEnabled
      ? [{ href: '/advisor', label: t.advisor.title, ai: true }]
      : []),
    { href: '/settings', label: t.settings.title },
  ];

  return (
    <>
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8 min-w-0">
            <Link
              href="/dashboard"
              className="text-xl font-bold bg-gradient-to-l from-blue-500 to-violet-500 bg-clip-text text-transparent shrink-0"
            >
              {t.brand.name}
            </Link>
            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-5 text-sm">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    'inline-flex items-center gap-1 transition-colors',
                    pathname === l.href
                      ? 'text-violet-600 font-medium'
                      : 'text-slate-700 hover:text-violet-600',
                  )}
                >
                  {l.ai && <Sparkles className="size-3.5" />}
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-4 shrink-0">
            {userName && (
              <span className="text-sm text-slate-600 truncate max-w-[12rem]">
                {userName}
              </span>
            )}
            {signOutForm}
          </div>

          {/* Hamburger toggle (mobile only) */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="פתח תפריט"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <nav className="px-4 py-3 flex flex-col gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors',
                    pathname === l.href
                      ? 'bg-violet-50 text-violet-700 font-medium'
                      : 'text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {l.ai && <Sparkles className="size-3.5" />}
                  {l.label}
                </Link>
              ))}
              <div className="border-t border-slate-100 mt-2 pt-2 flex items-center justify-between gap-3">
                {userName && (
                  <span className="text-sm text-slate-600 truncate">
                    {userName}
                  </span>
                )}
                {signOutForm}
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
