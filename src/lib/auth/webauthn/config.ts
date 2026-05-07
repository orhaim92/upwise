// WebAuthn relying-party (RP) configuration. The RP id MUST match the
// effective domain the user is browsing — passkeys are scoped per-origin,
// and the browser refuses to register/use a credential whose RP id doesn't
// match the page origin's host.
//
// In dev that's `localhost`. In prod it's the bare host (no scheme, no port,
// no trailing slash). We derive both from AUTH_URL so a single env var
// drives Auth.js and WebAuthn — keeps misconfig less likely.

function readBaseUrl(): URL {
  const raw = process.env.AUTH_URL ?? 'http://localhost:3000';
  return new URL(raw);
}

export function getRpId(): string {
  return readBaseUrl().hostname;
}

export function getRpName(): string {
  return 'UpWise';
}

// Browsers verify clientDataJSON.origin against this exact string. Include
// scheme + host + port (when non-default), no trailing slash.
export function getExpectedOrigin(): string {
  const u = readBaseUrl();
  return u.origin;
}
