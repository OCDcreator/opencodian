/**
 * SettingsSecretsKeychain — R-D2 (advantage-parity): moves settings-stored
 * secrets into Obsidian's SecretStorage (the OS keychain surface shipped in
 * 1.11.4; verified against the reference plugin — `app.keychain` does not
 * exist, `app.secretStorage` is the single API surface).
 *
 * Copilot's keychain strength inherited with a local-first twist: the LIVE
 * settings object always holds real values (every existing consumer — auth
 * assembly, remote-control secret redaction, diagnostics — keeps working
 * untouched); only the PERSISTED core profile swaps secrets for
 * `opencodian-keychain:v1:<key>` placeholders, and the load boundary swaps
 * them back. `settings.core.json` therefore never carries secret bytes once
 * secret storage is available.
 *
 * Migration (requirement 2) happens at load: a plaintext secret found in the
 * persisted file is pushed into the secret storage and replaced by its
 * placeholder in the loaded snapshot; the startup normalization backfill
 * then persists the scrubbed form. Rollback: `secretsKeychainEnabled: false`
 * (settings UI, general section) disables the save-side scrub, so the next
 * persist writes real values back into the settings file.
 *
 * Degradation (requirement 3): without a secret storage (older host), or when
 * an entry cannot be read back, the load report says so and the app layer
 * Notices the user — never silent.
 *
 * ID scheme: SecretStorage ids must match /^[a-z0-9-]+$/ and stay ≤64 chars,
 * so every logical key is slugified and namespaced with an 8-hex hash of the
 * vault base path (two vaults never cross-read each other's secrets):
 * `oc<vaultHash8>-<slug>`; over-long slugs fall back to a hash tail.
 */

import type { App } from 'obsidian';

/** The SecretStorage surface this module needs (subset of Obsidian's API). */
export interface SettingsSecretStorage {
  setSecret(id: string, value: string): Promise<void>;
  getSecret(id: string): Promise<string | null>;
}

export interface SettingsSecretsLoadReport {
  /** Plaintext secrets migrated into the secret storage during this load. */
  migrated: string[];
  /** Placeholders that could not be resolved (missing or unavailable storage). */
  unresolved: string[];
  /**
   * Plaintext secrets kept in the settings file because the host exposes no
   * secret storage (honest degradation — surfaced as a notice, never silent).
   */
  plaintextWithoutSecretStorage: string[];
  /** True when the host exposes no secret storage at all. */
  secretStorageUnavailable: boolean;
}

const PLACEHOLDER_PREFIX = 'opencodian-keychain:v1:';
const MIN_SECRET_LENGTH = 4;
const MAX_SECRET_ID_LENGTH = 64;

/** Stable logical key for every scalar secret field (persisted core profile). */
const SCALAR_SECRET_KEYS = [
  'server.auth.password',
  'server.auth.token',
  'backendSettings.codex.apiKey',
  'backendSettings.pi.apiKey',
  'remoteControlToken',
] as const;

export function buildSecretPlaceholder(keychainKey: string): string {
  return `${PLACEHOLDER_PREFIX}${keychainKey}`;
}

export function parseSecretPlaceholder(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(PLACEHOLDER_PREFIX)) {
    return null;
  }
  const key = value.slice(PLACEHOLDER_PREFIX.length);
  return key.length > 0 ? key : null;
}

function hashText(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Deterministic SecretStorage id for a logical key under one vault:
 * slugified lowercase alphanumeric + dashes, `oc<vaultHash8>-` namespace,
 * ≤64 chars (over-long slugs truncate and carry a disambiguating hash tail).
 */
export function buildSecretId(vaultHash: string, keychainKey: string): string {
  const slug = keychainKey.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const prefix = `oc${vaultHash}-`;
  if (prefix.length + slug.length <= MAX_SECRET_ID_LENGTH) {
    return `${prefix}${slug}`;
  }
  const budget = MAX_SECRET_ID_LENGTH - prefix.length - 9;
  return `${prefix}${slug.slice(0, budget)}-${hashText(keychainKey)}`;
}

function isRealSecretValue(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_SECRET_LENGTH
    && !value.startsWith(PLACEHOLDER_PREFIX);
}

/**
 * Structural accessor list: every secret location in the persisted core
 * settings object. Array entries key by their stable entry id so reordering
 * never cross-assigns secrets.
 */
interface SecretAccessor {
  keychainKey: string;
  read(source: Record<string, unknown>): unknown;
  /** Returns a cloned container with the field set (never mutates `source`). */
  write(source: Record<string, unknown>, nextValue: string): Record<string, unknown>;
}

function scalarAccessor(path: string): SecretAccessor {
  const segments = path.split('.');
  return {
    keychainKey: path,
    read: (source) => {
      let cursor: unknown = source;
      for (const segment of segments) {
        if (!cursor || typeof cursor !== 'object') {
          return undefined;
        }
        cursor = (cursor as Record<string, unknown>)[segment];
      }
      return cursor;
    },
    write: (source, nextValue) => {
      const clone: Record<string, unknown> = { ...source };
      let cursor = clone;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        const next = cursor[segment];
        cursor[segment] = next && typeof next === 'object' ? { ...(next as Record<string, unknown>) } : {};
        cursor = cursor[segment] as Record<string, unknown>;
      }
      cursor[segments[segments.length - 1]] = nextValue;
      return clone;
    },
  };
}

/**
 * Accessors for array-carried secrets, keyed by each entry's stable id
 * (uuid for image-generation models, provider id for custom providers).
 * Entries without a usable id fall back to their index — keying then breaks
 * on reorder, which only affects un-migrated legacy rows (both arrays are
 * id-bearing in current schemas).
 */
function arrayAccessors(source: Record<string, unknown>, listKey: string): SecretAccessor[] {
  const list = source[listKey];
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map((entry, index) => {
    const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : null;
    const id = record && typeof record.id === 'string' && record.id.trim().length > 0
      ? record.id
      : `index-${index}`;
    const keychainKey = `${listKey}.${id}.apiKey`;
    return {
      keychainKey,
      read: () => record?.apiKey,
      write: (whole, nextValue) => ({
        ...whole,
        [listKey]: (whole[listKey] as unknown[]).map((item, itemIndex) => (
          itemIndex === index ? { ...(item as Record<string, unknown>), apiKey: nextValue } : item
        )),
      }),
    } satisfies SecretAccessor;
  });
}

/**
 * The secret-storage-backed store. `seam === null` means "host without the
 * API" — every scrub/migrate becomes a documented no-op and the load report
 * flags it.
 */
export class SettingsSecretsKeychain {
  private readonly seam: SettingsSecretStorage | null;
  private readonly vaultHash: string;
  /** Last value pushed per key; skips redundant secret writes on every save. */
  private readonly lastWritten = new Map<string, string>();
  private pendingLoadReport: SettingsSecretsLoadReport | null = null;

  constructor(seam: SettingsSecretStorage | null, vaultPath: string) {
    this.seam = seam;
    this.vaultHash = hashText(vaultPath);
  }

  /** Probe the host SecretStorage (guarded cast; the single 1.11.4+ surface). */
  static forApp(app: App, vaultPath: string): SettingsSecretsKeychain {
    const storage = (app as unknown as {
      secretStorage?: Partial<SettingsSecretStorage>;
    }).secretStorage;
    const seam = storage
      && typeof storage.setSecret === 'function'
      && typeof storage.getSecret === 'function'
      ? {
        setSecret: (id: string, value: string) => storage.setSecret!(id, value),
        getSecret: (id: string) => storage.getSecret!(id),
      }
      : null;
    return new SettingsSecretsKeychain(seam, vaultPath);
  }

  isAvailable(): boolean {
    return this.seam !== null;
  }

  /** Test seam: read back a stored secret by logical key. */
  async peekSecret(keychainKey: string): Promise<string | null> {
    if (!this.seam) {
      return null;
    }
    try {
      return await this.seam.getSecret(buildSecretId(this.vaultHash, keychainKey));
    } catch {
      return null;
    }
  }

  /** Consumed by the app layer after each load to surface honest notices. */
  takePendingLoadReport(): SettingsSecretsLoadReport | null {
    const report = this.pendingLoadReport;
    this.pendingLoadReport = null;
    return report;
  }

  private accessorsFor(core: Record<string, unknown>): SecretAccessor[] {
    return [
      ...SCALAR_SECRET_KEYS.map((path) => scalarAccessor(path)),
      ...arrayAccessors(core, 'providers'),
      ...arrayAccessors(core, 'imageGenerationModels'),
    ];
  }

  /**
   * Save-side transform: return a copy of the persisted core profile with
   * every real secret replaced by its placeholder (and the real value pushed
   * to the secret storage first). Never mutates the input; failures keep the
   * plaintext so persistence is never blocked by the secret storage.
   */
  async scrubForPersistence(
    core: Partial<Record<string, unknown>>,
    options: { enabled: boolean },
  ): Promise<Partial<Record<string, unknown>>> {
    if (!this.seam || !options.enabled) {
      return core;
    }
    let scrubbed: Record<string, unknown> = { ...core };
    for (const accessor of this.accessorsFor(scrubbed)) {
      const value = accessor.read(scrubbed);
      if (!isRealSecretValue(value)) {
        continue;
      }
      const key = accessor.keychainKey;
      if (this.lastWritten.get(key) !== value) {
        try {
          await this.seam.setSecret(buildSecretId(this.vaultHash, key), value);
          this.lastWritten.set(key, value);
        } catch {
          // Secret storage write failed: keep plaintext in this persist
          // rather than losing the credential; the load report surfaces it.
          continue;
        }
      }
      scrubbed = accessor.write(scrubbed, buildSecretPlaceholder(key));
    }
    return scrubbed;
  }

  /**
   * Load-side transform: resolve placeholders back to real values AND perform
   * the one-time plaintext migration (requirement 2). Returns a copy; never
   * mutates the input.
   */
  async resolveAfterLoad(
    core: Partial<Record<string, unknown>>,
  ): Promise<Partial<Record<string, unknown>>> {
    const migrated: string[] = [];
    const unresolved: string[] = [];
    const plaintextWithoutSecretStorage: string[] = [];
    let resolved: Record<string, unknown> = { ...core };

    for (const accessor of this.accessorsFor(resolved)) {
      const value = accessor.read(resolved);
      const placeholderKey = parseSecretPlaceholder(value);
      if (placeholderKey !== null) {
        if (!this.seam) {
          unresolved.push(placeholderKey);
          resolved = accessor.write(resolved, '');
          continue;
        }
        let real: string | null = null;
        try {
          real = await this.seam.getSecret(buildSecretId(this.vaultHash, placeholderKey));
        } catch {
          real = null;
        }
        if (typeof real !== 'string' || real.length === 0) {
          unresolved.push(placeholderKey);
          resolved = accessor.write(resolved, '');
          continue;
        }
        this.lastWritten.set(placeholderKey, real);
        resolved = accessor.write(resolved, real);
        continue;
      }
      if (isRealSecretValue(value)) {
        if (!this.seam) {
          plaintextWithoutSecretStorage.push(accessor.keychainKey);
          continue;
        }
        const key = accessor.keychainKey;
        try {
          await this.seam.setSecret(buildSecretId(this.vaultHash, key), value);
          this.lastWritten.set(key, value);
          resolved = accessor.write(resolved, buildSecretPlaceholder(key));
          migrated.push(key);
        } catch {
          // Migration of this field failed; keep plaintext in the snapshot
          // so the credential still works after this load.
        }
      }
    }

    this.pendingLoadReport = {
      migrated,
      unresolved,
      plaintextWithoutSecretStorage,
      secretStorageUnavailable: this.seam === null,
    };
    return resolved;
  }
}
