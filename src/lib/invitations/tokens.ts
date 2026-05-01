import { randomBytes, createHash } from 'crypto';

// Phase 5: invitation tokens. The raw token is shown to the inviter once and
// shared out-of-band (copy-paste / email). Only the SHA-256 hash is persisted.
// When the recipient opens the link with ?token=<raw>, we hash it and look up.
export function generateInvitationToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashInvitationToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
