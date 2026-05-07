'use server';

import { buildAuthenticationOptions } from '@/lib/auth/webauthn/server';
import { setChallenge } from '@/lib/auth/webauthn/challenge';

// Public action — no auth required because this is the pre-login step.
// Sets the challenge cookie and returns options for navigator.credentials.get.
// The matching verify happens inside the 'passkey' Credentials provider's
// authorize() so the cookie is read in the same request flow that mints
// the session.
export async function getPasskeyAuthenticationOptions(): Promise<
  Awaited<ReturnType<typeof buildAuthenticationOptions>>
> {
  const options = await buildAuthenticationOptions();
  await setChallenge('authentication', options.challenge);
  return options;
}
