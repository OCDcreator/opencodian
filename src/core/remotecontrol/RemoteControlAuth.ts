import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * R-C6 remote control token primitives (core.remotecontrol owner).
 *
 * Pure, side-effect-free helpers so the security-critical surface stays unit
 * testable: generation (256-bit, base64url), fingerprint derivation, constant
 * time digest comparison, Bearer header extraction and loopback bind-address
 * classification. Nothing here ever logs or returns the token itself.
 */

/** 32 random bytes → 256-bit entropy → ~43 base64url characters. */
export const REMOTE_CONTROL_TOKEN_BYTES = 32;

/** Audit/UX never sees the token, only the first 12 hex of its sha256. */
export const REMOTE_CONTROL_FINGERPRINT_HEX_CHARS = 12;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Generate a fresh access token: `crypto.randomBytes(32)` → base64url.
 * Called only when the user explicitly enables the feature (or rotates the
 * token from settings). Mirrors the repo's existing `randomBytes` usage.
 */
export function generateRemoteControlToken(): string {
  return randomBytes(REMOTE_CONTROL_TOKEN_BYTES).toString('base64url');
}

/** Stable fingerprint of a token (sha256, first 12 hex) for audit records. */
export function deriveTokenFingerprint(token: string): string {
  return sha256Hex(token).slice(0, REMOTE_CONTROL_FINGERPRINT_HEX_CHARS);
}

/**
 * Extract the credential from an `Authorization: Bearer <token>` header.
 * Returns null for missing headers, wrong schemes or empty credentials —
 * the caller answers every null with the same fixed 401 body so a missing
 * and a malformed header stay indistinguishable.
 */
export function extractBearerToken(headerValue: string | undefined): string | null {
  if (typeof headerValue !== 'string') return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}

/**
 * Constant-time token comparison. Both sides are normalized to equal-length
 * sha256 digests before `timingSafeEqual`, so neither the raw token length
 * nor a length mismatch can leak through an exception or timing. A null
 * (missing/malformed header) and an empty stored token (feature enabled but
 * never issued) both fail closed.
 */
export function tokensMatch(provided: string | null, stored: string): boolean {
  if (!provided || !stored) return false;
  const providedDigest = Buffer.from(sha256Hex(provided), 'hex');
  const storedDigest = Buffer.from(sha256Hex(stored), 'hex');
  return timingSafeEqual(providedDigest, storedDigest);
}

/**
 * Loopback classification for the configured bind address. `localhost` is
 * treated as loopback (it is normalized to `127.0.0.1` at the settings
 * layer); every other value — including `0.0.0.0`, `::` and hostnames — is
 * non-loopback and requires the explicit second confirmation.
 */
export function isLoopbackBindAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}
