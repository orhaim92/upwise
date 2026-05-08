'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

// Thin client wrapper around next-auth's SessionProvider so we can mount it
// inside server components (layouts) without making the whole tree client.
// useSession() / update() in any descendant resolves through this.
//
// refetchInterval: poll /api/auth/session every 60s so the client notices
// JWT expiry promptly (the server only validates on each request, but the
// open dashboard tab might sit idle past the 30-min window). The poll is
// cheap (a single in-memory JWT verify on the server) and lets the
// timeout watcher fire its redirect-to-login as soon as the session is
// gone, instead of waiting for the user's next navigation.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider
      refetchInterval={60}
      refetchOnWindowFocus
    >
      {children}
    </NextAuthSessionProvider>
  );
}
