import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type GenerateAuthenticationOptionsOpts,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { authenticators, users } from '@/lib/db/schema';
import { getExpectedOrigin, getRpId, getRpName } from './config';

// Server-side WebAuthn helpers. Wraps @simplewebauthn/server with the
// app's RP config + DB shape so server actions stay declarative.
//
// Storage format note: credentialID and publicKey are stored as
// base64url strings. The library hands us Uint8Array on registration
// and expects Uint8Array on verification — we convert at the boundary.

export type StoredAuthenticator = typeof authenticators.$inferSelect;

export async function buildRegistrationOptions(opts: {
  userId: string;
  userName: string;
  userDisplayName?: string | null;
}) {
  // Tell the browser to skip authenticators the user has already enrolled,
  // so the OS doesn't offer to overwrite an existing credential.
  const existing = await db
    .select({
      credentialId: authenticators.credentialId,
      transports: authenticators.transports,
    })
    .from(authenticators)
    .where(eq(authenticators.userId, opts.userId));

  const excludeCredentials: GenerateRegistrationOptionsOpts['excludeCredentials'] =
    existing.map((a) => ({
      id: isoBase64URL.toBuffer(a.credentialId),
      type: 'public-key',
      transports: a.transports
        ? (a.transports.split(',').filter(Boolean) as AuthenticatorTransport[])
        : undefined,
    }));

  return generateRegistrationOptions({
    rpName: getRpName(),
    rpID: getRpId(),
    // userID must be a stable per-user opaque identifier. We use the user
    // UUID directly so the value is reproducible and never collides.
    // (SimpleWebAuthn v9 takes a string; v10+ switched to Uint8Array.)
    userID: opts.userId,
    userName: opts.userName,
    userDisplayName: opts.userDisplayName ?? opts.userName,
    attestationType: 'none',
    // Encourage platform authenticators (Face/Touch ID, Windows Hello) and
    // ensure the credential is discoverable so login flow can omit email.
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
    excludeCredentials,
  });
}

export async function verifyAndSaveRegistration(opts: {
  userId: string;
  expectedChallenge: string;
  // The JSON the browser returned from startRegistration().
  response: Parameters<typeof verifyRegistrationResponse>[0]['response'];
  label?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: opts.response,
      expectedChallenge: opts.expectedChallenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      requireUserVerification: false,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'verification_failed',
    };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: 'not_verified' };
  }

  const info = verification.registrationInfo;
  await db.insert(authenticators).values({
    userId: opts.userId,
    credentialId: isoBase64URL.fromBuffer(info.credentialID),
    publicKey: isoBase64URL.fromBuffer(info.credentialPublicKey),
    counter: info.counter,
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    transports: opts.response.response.transports?.join(',') ?? null,
    label: opts.label ?? null,
  });

  return { ok: true };
}

export async function buildAuthenticationOptions(): Promise<
  Awaited<ReturnType<typeof generateAuthenticationOptions>>
> {
  // Empty allowCredentials => discoverable-credential flow ("passkeys").
  // The browser picks the credential without us knowing the user beforehand.
  const opts: GenerateAuthenticationOptionsOpts = {
    rpID: getRpId(),
    userVerification: 'preferred',
    allowCredentials: [],
  };
  return generateAuthenticationOptions(opts);
}

// Verifies the assertion against the stored authenticator and bumps its
// signature counter. Returns the userId on success so the caller can mint
// a session.
export async function verifyAuthentication(opts: {
  expectedChallenge: string;
  response: Parameters<typeof verifyAuthenticationResponse>[0]['response'];
}): Promise<
  | { ok: true; userId: string; userEmail: string; userName: string | null }
  | { ok: false; error: string }
> {
  // The browser puts the credential id in `id` (base64url already).
  const credentialId = opts.response.id;

  const [auth] = await db
    .select()
    .from(authenticators)
    .where(eq(authenticators.credentialId, credentialId))
    .limit(1);

  if (!auth) return { ok: false, error: 'unknown_credential' };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: opts.response,
      expectedChallenge: opts.expectedChallenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpId(),
      authenticator: {
        credentialID: isoBase64URL.toBuffer(auth.credentialId),
        credentialPublicKey: isoBase64URL.toBuffer(auth.publicKey),
        counter: auth.counter,
        transports: auth.transports
          ? (auth.transports
              .split(',')
              .filter(Boolean) as AuthenticatorTransport[])
          : undefined,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'verification_failed',
    };
  }

  if (!verification.verified) return { ok: false, error: 'not_verified' };

  // Bump the signature counter; some authenticators don't increment (return 0
  // forever), but we still update lastUsedAt so the settings UI stays useful.
  await db
    .update(authenticators)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(authenticators.id, auth.id));

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  if (!user) return { ok: false, error: 'user_gone' };

  return {
    ok: true,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
  };
}
