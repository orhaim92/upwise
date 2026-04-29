import Link from 'next/link';
import Image from 'next/image';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n/he';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <Image
          src="/logo-icon.svg"
          alt={t.brand.name}
          width={120}
          height={120}
          priority
          className="mx-auto"
        />
        <h1 className="text-5xl font-bold bg-gradient-to-l from-blue-500 to-violet-500 bg-clip-text text-transparent">
          {t.brand.name}
        </h1>
        <p className="text-lg text-slate-600">{t.brand.tagline}</p>
        <div className="flex gap-3 justify-center pt-4">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ size: 'lg' }),
              'bg-violet-600 text-white hover:bg-violet-700',
            )}
          >
            {t.auth.loginButton}
          </Link>
          <Link
            href="/signup"
            className={cn(buttonVariants({ size: 'lg', variant: 'outline' }))}
          >
            {t.auth.signupButton}
          </Link>
        </div>
      </div>
    </main>
  );
}
