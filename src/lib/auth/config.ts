import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { verifyPassword } from './password';
import { loginSchema } from '@/lib/validations/auth';
import { verifyAuthentication } from './webauthn/server';
import { readAndClearChallenge } from './webauthn/challenge';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 30-minute idle expiry. The client mounts a watcher that prompts the
  // user to extend ~2 min before this elapses; on confirm it calls
  // update() which re-mints the JWT with a fresh exp. updateAge stays at
  // the default (24h), so the session does NOT silently extend on every
  // server request — the popup is the only way to keep going past 30 min.
  session: { strategy: 'jwt', maxAge: 30 * 60 },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email.toLowerCase()))
          .limit(1);

        if (!user) return null;

        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        };
      },
    }),
    // Passkey / WebAuthn login. The client first calls
    // getPasskeyAuthenticationOptions() to seed the challenge cookie, then
    // navigator.credentials.get() produces an assertion which we serialize
    // and POST through this provider. authorize() reads the same challenge
    // cookie, hands the assertion + cookie to the verifier, and on success
    // returns the matching user — Auth.js then mints its JWT session as
    // usual.
    Credentials({
      id: 'passkey',
      credentials: {
        // The full PublicKeyCredential JSON returned by startAuthentication.
        response: {},
      },
      authorize: async (credentials) => {
        const raw = credentials?.response;
        if (typeof raw !== 'string' || raw.length === 0) return null;

        let response: Parameters<typeof verifyAuthentication>[0]['response'];
        try {
          response = JSON.parse(raw);
        } catch {
          return null;
        }

        const challenge = await readAndClearChallenge('authentication');
        if (!challenge) return null;

        const result = await verifyAuthentication({
          expectedChallenge: challenge,
          response,
        });
        if (!result.ok) return null;

        return {
          id: result.userId,
          email: result.userEmail,
          name: result.userName ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
