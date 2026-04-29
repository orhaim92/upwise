import type { Metadata } from 'next';
import { Rubik } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { t } from '@/lib/i18n/he';
import './globals.css';

const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${t.brand.name} — ${t.brand.tagline}`,
  description: 'אפליקציית ניהול תזרים מזומנים אישי',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full antialiased`}>
      <body className="font-sans bg-slate-50 text-indigo-950 min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
