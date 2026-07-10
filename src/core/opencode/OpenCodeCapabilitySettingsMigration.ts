/**
 * Versioned settings envelope for OpenCode SDK capability preferences and
 * experimental gates (Task 3 of the SDK productization plan).
 *
 * This module owns the *shape* of capability preferences, not their runtime
 * interpretation. The registry (Task 2) declares which capabilities exist and
 * their default gates; this envelope records the user's overrides and any
 * legacy preferences that migrated forward.
 *
 * Design rules (enforced by the test suite):
 *   - The envelope is keyed by stable capability ids (dotted strings).
 *   - `experimentalGates` is a `string -> boolean` map. Legacy string-encoded
 *     booleans (`'true'` / `'false'`) are auto-migrated because the mapping is
 *     behaviorally equivalent. Any other legacy shape is `impossible`: the raw
 *     value is never reinterpreted and never persisted into the report.
 *   - The migration report MUST NEVER contain raw secret values. Any field that
 *     looks like a credential/key/token is stripped and recorded as `impossible`
 *     with a generic reason.
 *   - Migration is idempotent: re-running it on an already-normalized envelope
 *     produces no `migrated` entries and `requiresBackup: false`.
 *
 * Persistence of the raw unmodified envelope (when `requiresBackup === true`)
 * is handled by `StorageService`, which snapshots it into the backup path before
 * the normalized value is written.
 */

/** Current schema version for the capability settings envelope. */
export const OPENCODE_CAPABILITY_SETTINGS_SCHEMA_VERSION = 1;

/**
 * Normalized, immutable capability settings envelope.
 *
 * All maps are keyed by stable capability ids (e.g. `'v2.pty.create'`).
 */
export interface OpenCodeCapabilitySettings {
  /** Envelope schema version. Currently always `1`. */
  readonly schemaVersion: number;
  /** User overrides for experimental capability opt-in gates. */
  readonly experimentalGates: Readonly<Record<string, boolean>>;
  /** Free-form string capability preferences (e.g. event stream modes). */
  readonly preferences: Readonly<Record<string, string>>;
  /** Optional migration report persisted alongside the envelope. */
  readonly migrationReport?: OpenCodeCapabilityMigrationReport;
}

/** Outcome classification for a single migrated field. */
export type OpenCodeCapabilityMigrationOutcome = 'migrated' | 'retained' | 'impossible' | 'skipped';

/** One entry in the capability settings migration report. */
export interface OpenCodeCapabilityMigrationReportEntry {
  /** Dotted field path, e.g. `experimentalGates.v2.pty.create`. */
  readonly field: string;
  readonly outcome: OpenCodeCapabilityMigrationOutcome;
  /** Human-readable reason; never contains raw secret values. */
  readonly reason: string;
}

/** Full migration report for one normalization pass. */
export interface OpenCodeCapabilityMigrationReport {
  readonly entries: ReadonlyArray<OpenCodeCapabilityMigrationReportEntry>;
  /** Epoch millis at which the report was generated (`now` input). */
  readonly generatedAt: number;
}

/** Result of migrating a raw capability settings value. */
export interface OpenCodeCapabilityMigrationResult {
  readonly normalized: OpenCodeCapabilitySettings;
  readonly report: OpenCodeCapabilityMigrationReport;
  /**
   * Whether the caller should snapshot the unmodified raw value into a backup
   * path before persisting the normalized envelope. `true` when at least one
   * field could not be safely migrated (`impossible` outcome) or when a secret
   * was stripped.
   */
  readonly requiresBackup: boolean;
}

const EMPTY_GATES: Readonly<Record<string, boolean>> = Object.freeze({});
const EMPTY_PREFERENCES: Readonly<Record<string, string>> = Object.freeze({});

/**
 * Field-name substrings that indicate a credential/secret. Matching is
 * case-insensitive against the leaf key. Used only to decide whether to refuse
 * a value; we never echo the matched value into the report.
 */
const SECRET_KEY_HINTS = [
  'apikey',
  'api-key',
  'apisecret',
  'api-secret',
  'secret',
  'token',
  'password',
  'passwd',
  'credential',
  'privatekey',
  'private-key',
  'authtoken',
  'auth-token',
  'accesstoken',
  'access-token',
  'refreshtoken',
  'refresh-token',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeSecretKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return SECRET_KEY_HINTS.some((hint) => lowered.includes(hint));
}

/**
 * Normalize a raw capability settings value into the immutable envelope shape.
 *
 * Pure: no I/O, no logging, no mutation of the input. Unknown shapes collapse
 * to safe defaults (empty maps, schemaVersion 1). This is the canonical
 * post-migration shape and the function is idempotent.
 */
export function normalizeOpenCodeCapabilitySettings(value: unknown): OpenCodeCapabilitySettings {
  if (!isObject(value)) {
    return {
      schemaVersion: OPENCODE_CAPABILITY_SETTINGS_SCHEMA_VERSION,
      experimentalGates: EMPTY_GATES,
      preferences: EMPTY_PREFERENCES,
    };
  }

  // Only schema version 1 is recognized; any other value collapses to 1.
  const experimentalGates = normalizeBooleanMap((value as { experimentalGates?: unknown }).experimentalGates);
  const preferences = normalizeStringMap((value as { preferences?: unknown }).preferences);

  return {
    schemaVersion: OPENCODE_CAPABILITY_SETTINGS_SCHEMA_VERSION,
    experimentalGates,
    preferences,
  };
}

function normalizeBooleanMap(value: unknown): Record<string, boolean> {
  if (!isObject(value)) {
    return {};
  }
  const result: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'boolean') {
      result[key] = entry;
    }
  }
  return result;
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!isObject(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return result;
}

/**
 * Migrate a raw capability settings value into a normalized envelope, producing
 * a report describing every field-level decision.
 *
 * Security: the report never contains raw secret values. Fields whose key looks
 * like a credential are stripped and recorded as `impossible` with a generic
 * reason; their raw value is never serialized into the report.
 *
 * Idempotency: passing an already-normalized envelope yields no `migrated`
 * entries and `requiresBackup: false`.
 */
export function migrateOpenCodeCapabilitySettings(
  raw: unknown,
  now: number,
): OpenCodeCapabilityMigrationResult {
  const entries: OpenCodeCapabilityMigrationReportEntry[] = [];
  let requiresBackup = false;

  if (!isObject(raw)) {
    // Nothing recognizable to migrate; fall back to defaults with no report noise.
    return {
      normalized: normalizeOpenCodeCapabilitySettings(raw),
      report: { entries, generatedAt: now },
      requiresBackup: false,
    };
  }

  const source = raw as Record<string, unknown>;
  const rawGates = source.experimentalGates;
  const rawPreferences = source.preferences;

  const normalizedGates: Record<string, boolean> = {};
  const normalizedPreferences: Record<string, string> = {};

  // --- experimentalGates ---
  if (isObject(rawGates)) {
    for (const [key, value] of Object.entries(rawGates)) {
      const resolved = resolveGateEntry(key, value);
      entries.push(resolved.entry);
      if (resolved.normalizedValue !== undefined) {
        normalizedGates[key] = resolved.normalizedValue;
      }
      requiresBackup = requiresBackup || resolved.entry.outcome === 'impossible';
    }
  } else if (rawGates !== undefined) {
    entries.push({
      field: 'experimentalGates',
      outcome: 'impossible',
      reason: 'experimentalGates is not an object map and was dropped; raw value preserved in backup.',
    });
    requiresBackup = true;
  }

  // --- preferences ---
  if (isObject(rawPreferences)) {
    for (const [key, value] of Object.entries(rawPreferences)) {
      const resolved = resolvePreferenceEntry(key, value);
      entries.push(resolved.entry);
      if (resolved.normalizedValue !== undefined) {
        normalizedPreferences[key] = resolved.normalizedValue;
      }
      requiresBackup = requiresBackup || resolved.entry.outcome === 'impossible';
    }
  } else if (rawPreferences !== undefined) {
    entries.push({
      field: 'preferences',
      outcome: 'impossible',
      reason: 'preferences is not an object map and was dropped; raw value preserved in backup.',
    });
    requiresBackup = true;
  }

  // --- unknown top-level fields: scan for leaked secrets, refuse to persist ---
  for (const key of Object.keys(source)) {
    if (key === 'experimentalGates' || key === 'preferences' || key === 'schemaVersion' || key === 'migrationReport') {
      continue;
    }
    const isSecret = looksLikeSecretKey(key) || containsSecretValue(source[key]);
    entries.push(isSecret
      ? {
          field: key,
          outcome: 'impossible',
          reason: 'Unrecognized field resembles a credential or carries a secret-shaped value; value was stripped and not persisted.',
        }
      : {
          field: key,
          outcome: 'skipped',
          reason: 'Unrecognized field was not carried forward into the capability envelope.',
        });
    requiresBackup = requiresBackup || isSecret;
  }

  const normalized: OpenCodeCapabilitySettings = {
    schemaVersion: OPENCODE_CAPABILITY_SETTINGS_SCHEMA_VERSION,
    experimentalGates: normalizedGates,
    preferences: normalizedPreferences,
  };

  return {
    normalized,
    report: { entries, generatedAt: now },
    requiresBackup,
  };
}

interface ResolvedEntry<T> {
  readonly entry: OpenCodeCapabilityMigrationReportEntry;
  readonly normalizedValue: T | undefined;
}

/**
 * Resolve one `experimentalGates` entry into a report entry plus the migrated
 * boolean value (if any). Secret-shaped keys and non-coercible values never
 * produce a normalized value and yield an `impossible` outcome.
 */
function resolveGateEntry(key: string, value: unknown): ResolvedEntry<boolean> {
  const field = `experimentalGates.${key}`;
  if (looksLikeSecretKey(key)) {
    return {
      entry: {
        field,
        outcome: 'impossible',
        reason: 'Field name resembles a credential; value was stripped and not persisted.',
      },
      normalizedValue: undefined,
    };
  }
  if (typeof value === 'boolean') {
    return {
      entry: { field, outcome: 'retained', reason: 'Gate value is already a boolean and was retained as-is.' },
      normalizedValue: value,
    };
  }
  const coerced = coerceStringBoolean(value);
  if (coerced !== undefined) {
    return {
      entry: { field, outcome: 'migrated', reason: 'Legacy string-encoded boolean gate was migrated to a boolean value.' },
      normalizedValue: coerced,
    };
  }
  return {
    entry: {
      field,
      outcome: 'impossible',
      reason: 'Gate value cannot be safely coerced to a boolean; raw value preserved in backup.',
    },
    normalizedValue: undefined,
  };
}

/**
 * Resolve one `preferences` entry into a report entry plus the migrated string
 * value (if any). Secret-shaped keys and non-coercible values never produce a
 * normalized value and yield an `impossible` outcome.
 */
function resolvePreferenceEntry(key: string, value: unknown): ResolvedEntry<string> {
  const field = `preferences.${key}`;
  if (looksLikeSecretKey(key)) {
    return {
      entry: {
        field,
        outcome: 'impossible',
        reason: 'Field name resembles a credential; value was stripped and not persisted.',
      },
      normalizedValue: undefined,
    };
  }
  if (typeof value === 'string') {
    return {
      entry: { field, outcome: 'retained', reason: 'Preference value is already a string and was retained as-is.' },
      normalizedValue: value,
    };
  }
  const coerced = coercePreferenceString(value);
  if (coerced !== undefined) {
    return {
      entry: { field, outcome: 'migrated', reason: 'Legacy preference value was migrated to a string.' },
      normalizedValue: coerced,
    };
  }
  return {
    entry: {
      field,
      outcome: 'impossible',
      reason: 'Preference value cannot be safely coerced to a string; raw value preserved in backup.',
    },
    normalizedValue: undefined,
  };
}

/**
 * Coerce a legacy string-encoded boolean into a real boolean. Returns
 * `undefined` when the value cannot be mapped without behavior change.
 *
 * Accepted (case-insensitive): `'true'`, `'false'`.
 */
function coerceStringBoolean(value: unknown): boolean | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const lowered = value.trim().toLowerCase();
  if (lowered === 'true') {
    return true;
  }
  if (lowered === 'false') {
    return false;
  }
  return undefined;
}

/**
 * Coerce a legacy preference value into a string. Numbers and booleans are
 * safe to stringify; everything else returns `undefined`.
 */
function coercePreferenceString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return undefined;
}

/**
 * Best-effort detection of a secret-shaped value: a string that looks like a
 * long opaque token, or a nested object containing a secret-looking key.
 */
function containsSecretValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return looksLikeSecretValue(value);
  }
  if (isObject(value)) {
    return Object.entries(value).some(
      ([k, v]) => looksLikeSecretKey(k) || containsSecretValue(v),
    );
  }
  return false;
}

function looksLikeSecretValue(value: string): boolean {
  // Long, mostly-alphanumeric tokens with a typical key prefix. Conservative:
  // only flag strings that strongly resemble opaque credentials.
  return /^(sk-|sk_|api[_-]?key|token|bearer|oauth)[\w.-]{8,}$/i.test(value)
    || (value.length >= 24 && /^[\w.-]+$/.test(value) && /[0-9]/.test(value) && /[a-zA-Z]/.test(value));
}
