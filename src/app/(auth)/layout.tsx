import Link from 'next/link';
import { t } from '@/lib/i18n/he';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
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
