import { cookies } from 'next/headers';

// WebAuthn requires the server to verify that the assertion's challenge
// matches one we issued. We park the challenge in an httpOnly cookie keyed
// by ceremony — registration and authentication use distinct keys so a
// stale registration challenge can't satisfy a login flow.
//
// Cookie storage (rather than a DB row) means no extra writes per ceremony
// and trivial cleanup; the cookie is single-use (cleared on read) and
// short-lived (5 min).

const TTL_SECONDS = 5 * 60;

type Ceremony = 'registration' | 'authentication';

function cookieName(ceremony: Ceremony): string {
  return `webauthn_${ceremony}_challenge`;
}

export async function setChallenge(
  ceremony: Ceremony,
  challenge: string,
): Promise<void> {
  const c = await cookies();
  c.set(cookieName(ceremony), challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export async function readAndClearChallenge(
  ceremony: Ceremony,
): Promise<string | null> {
  const c = await cookies();
  const name = cookieName(ceremony);
  const v = c.get(name)?.value ?? null;
  if (v) c.delete(name);
  return v;
}
