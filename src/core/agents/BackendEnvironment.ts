/**
 * BackendEnvironment — advantage-parity R-F7: per-provider environment-variable
 * domains plus the environment fingerprint (invalidation signal).
 *
 * The domains model mirrors Claudian's `shared` / `provider:*` split:
 * `shared` applies to every backend, `providers[backend]` only to one backend
 * (the key is either a built-in backend kind like `claude-code` or a custom
 * provider/agent id such as an ACP agent id). Legacy per-backend settings
 * (for example `backendSettings.claudeCode.env`) keep their historical
 * override priority — the domains are merged *under* them, never replacing
 * them, so there is no second source of truth for the legacy fields.
 *
 * `computeEnvironmentFingerprint` gives the app layer a stable, order-
 * independent digest of a resolved environment so it can detect "the user
 * changed a key" between runs and surface a session-invalidation notice.
 *
 * Pure module (core.agents owner): no feature/app/i18n imports, no I/O.
 */

/** Per-backend environment-variable domains (R-F7 settings shape). */
export interface EnvironmentVariablesDomains {
  /** Applied to every backend. */
  shared: Record<string, string>;
  /** Keyed by backend kind or provider/agent id; applied only to that backend. */
  providers: Record<string, Record<string, string>>;
}

/** A single string-keyed variable map: trimmed keys/values, junk dropped. */
function sanitizeVariableMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return out;
  }
  for (const [rawKey, rawValue] of Object.entries(raw as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key || typeof rawValue !== 'string') {
      continue;
    }
    out[key] = rawValue.trim();
  }
  return out;
}

/** Normalize an unknown persisted value into clean domains; junk is dropped. */
export function normalizeEnvironmentVariablesDomains(raw: unknown): EnvironmentVariablesDomains {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as { shared?: unknown; providers?: unknown })
    : {};
  const providers: Record<string, Record<string, string>> = {};
  const rawProviders = source.providers && typeof source.providers === 'object' && !Array.isArray(source.providers)
    ? (source.providers as Record<string, unknown>)
    : {};
  for (const [rawKey, rawValue] of Object.entries(rawProviders)) {
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    providers[key] = sanitizeVariableMap(rawValue);
  }
  return {
    shared: sanitizeVariableMap(source.shared),
    providers,
  };
}

/**
 * Resolve the effective environment for one backend:
 * `shared` < `providers[backend]` < `legacyEnv` (legacy wins, so the
 * pre-R-F7 per-backend settings keep their exact override behavior).
 */
export function resolveBackendEnvironment(
  domains: EnvironmentVariablesDomains,
  backend: string,
  legacyEnv?: Record<string, string>,
): Record<string, string> {
  return {
    ...domains.shared,
    ...(domains.providers[backend] ?? {}),
    ...(legacyEnv ?? {}),
  };
}

/**
 * Stable djb2-64 fingerprint of an environment map — the repo's classic
 * `(hash * 33) ^ code` family widened to 64 bits with two 32-bit lanes
 * (classic seed 5381 plus a position-mixed lane; BigInt is unavailable at
 * this project's ES target). Key order never matters: keys are sorted before
 * digesting. Empty map is a stable value too, so "domains configured then
 * cleared" changes the fingerprint.
 */
export function computeEnvironmentFingerprint(env: Record<string, string>): string {
  let upper = 5381;
  let lower = 52711;
  const normalized = Object.keys(env)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${key}=${env[key]}`)
    .join('\n');
  for (let index = 0; index < normalized.length; index++) {
    const code = normalized.charCodeAt(index);
    upper = ((upper * 33) ^ code) >>> 0;
    lower = ((lower * 33) ^ ((code + index) & 0xffff)) >>> 0;
  }
  return upper.toString(16).padStart(8, '0') + lower.toString(16).padStart(8, '0');
}

/**
 * Backends whose resolved environment changed between runs. The backend list
 * is the current key set: a backend that disappeared from the configuration
 * no longer runs, so it is not reported; any add/modify inside a backend's
 * resolved environment (including its legacy map) flips its fingerprint.
 */
export function detectChangedBackends(
  previous: Record<string, string>,
  current: Record<string, string>,
): string[] {
  return Object.keys(current).filter((backend) => previous[backend] !== current[backend]);
}

/** Legacy-env accessor used by {@link computeBackendEnvironmentFingerprints}. */
export type LegacyEnvironmentResolver = (backend: string) => Record<string, string> | undefined;

/**
 * Fingerprint every backend's fully resolved environment in one call. The
 * caller passes the backend list (built-in kinds plus provider keys) and an
 * optional accessor for legacy per-backend env maps.
 */
export function computeBackendEnvironmentFingerprints(
  domains: EnvironmentVariablesDomains,
  backends: readonly string[],
  legacyEnvFor?: LegacyEnvironmentResolver,
): Record<string, string> {
  const fingerprints: Record<string, string> = {};
  for (const backend of backends) {
    fingerprints[backend] = computeEnvironmentFingerprint(
      resolveBackendEnvironment(domains, backend, legacyEnvFor?.(backend)),
    );
  }
  return fingerprints;
}
