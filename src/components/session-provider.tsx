'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

// Thin client wrapper around next-auth's SessionProvider so we can mount it
// inside server components (layouts) without making the whole tree client.
// useSession() / update() in any descendant resolves through this.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
