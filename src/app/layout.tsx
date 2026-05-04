import type { Metadata, Viewport } from 'next';
import { Rubik } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { ServiceWorkerRegister } from '@/components/pwa/sw-register';
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
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: t.brand.name,
    startupImage: [{ url: '/icons/apple-touch-icon-180.png' }],
  },
  icons: {
    icon: '/favicon.png',
    apple: '/icons/apple-touch-icon-180.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#7C3AED',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full antialiased`}>
      <body
        className="font-sans bg-slate-50 text-indigo-950 min-h-full flex flex-col"
        suppressHydrationWarning
      >
        {children}
        <Toaster position="top-center" richColors />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
