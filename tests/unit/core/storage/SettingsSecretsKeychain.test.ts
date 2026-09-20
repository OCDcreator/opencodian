/**
 * SettingsSecretsKeychain unit tests (advantage-parity R-D2).
 *
 * Covers the requirement's acceptance matrix:
 * - scrub: real secrets become SecretStorage entries + placeholders in the
 *   persisted form; the live object is never mutated; disabled/unavailable
 *   keeps plaintext; failures keep plaintext (persistence never blocked)
 * - load: placeholders resolve back; plaintext is migrated one-time
 *   (secret-storage write + placeholder in the snapshot); missing entries and
 *   missing storage degrade honestly through the load report
 * - settings.core.json never carries secret bytes after a save with the
 *   secret storage available — verified through the StorageService path
 * - rollback: secretsKeychainEnabled=false persists real values again
 * - ids are SecretStorage-compliant (lowercase/dash, ≤64) and vault-scoped
 */

import {
  buildSecretId,
  buildSecretPlaceholder,
  parseSecretPlaceholder,
  SettingsSecretsKeychain,
} from '../../../../src/core/storage/SettingsSecretsKeychain';
import { StorageService } from '../../../../src/core/storage/StorageService';

const VAULT = '/test/vault';

/** Mirror of the module's internal djb2 hash so tests can predict ids. */
function hashOf(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

class FakeSecretStorage {
  readonly store = new Map<string, string>();
  writeFails = false;

  async setSecret(id: string, value: string): Promise<void> {
    if (this.writeFails) {
      throw new Error('secret storage locked');
    }
    this.store.set(id, value);
  }

  async getSecret(id: string): Promise<string | null> {
    return this.store.get(id) ?? null;
  }
}

function coreWithSecrets(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    server: { mode: 'remote', auth: { password: 'server-password-1', token: '' } },
    backendSettings: {
      codex: { apiKey: 'codex-key-123456' },
      pi: { apiKey: 'pi-key-654321' },
    },
    remoteControlToken: 'remote-token-abcdef',
    providers: [
      { id: 'prov-a', name: 'A', apiKey: 'provider-key-a', enabled: true },
      { id: 'prov-b', name: 'B', apiKey: '', enabled: true },
    ],
    imageGenerationModels: [
      { id: 'img-1', apiKey: 'image-key-1', model: 'gpt-image-1' },
    ],
    secretsKeychainEnabled: true,
    ...overrides,
  };
}

function keychain(): { seam: FakeSecretStorage; svc: SettingsSecretsKeychain } {
  const seam = new FakeSecretStorage();
  return { seam, svc: new SettingsSecretsKeychain(seam, VAULT) };
}

describe('placeholder and id helpers', () => {
  it('round-trips a keychain key through the placeholder form', () => {
    const placeholder = buildSecretPlaceholder('backendSettings.codex.apiKey');
    expect(placeholder).toBe('opencodian-keychain:v1:backendSettings.codex.apiKey');
    expect(parseSecretPlaceholder(placeholder)).toBe('backendSettings.codex.apiKey');
    expect(parseSecretPlaceholder('sk-not-a-placeholder')).toBeNull();
    expect(parseSecretPlaceholder('opencodian-keychain:v1:')).toBeNull();
    expect(parseSecretPlaceholder(undefined)).toBeNull();
  });

  it('builds SecretStorage-compliant, vault-scoped ids', () => {
    const id = buildSecretId('1a2b3c4d', 'backendSettings.codex.apiKey');
    expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id.startsWith('oc1a2b3c4d-')).toBe(true);
    // Same logical key in another vault gets another id.
    expect(buildSecretId('ffffffff', 'backendSettings.codex.apiKey')).not.toBe(id);
    // Over-long keys truncate with a disambiguating hash tail, still compliant.
    const long = buildSecretId('1a2b3c4d', 'x'.repeat(200));
    expect(long).toMatch(/^[a-z0-9-]+$/);
    expect(long.length).toBeLessThanOrEqual(64);
  });
});

describe('scrubForPersistence', () => {
  it('replaces every real secret with a placeholder and pushes values into the secret storage', async () => {
    const { seam, svc } = keychain();
    const core = coreWithSecrets();

    const scrubbed = await svc.scrubForPersistence(core, { enabled: true }) as Record<string, unknown>;

    expect((scrubbed.server as { auth: { password: string } }).auth.password)
      .toBe('opencodian-keychain:v1:server.auth.password');
    expect((scrubbed.backendSettings as { codex: { apiKey: string } }).codex.apiKey)
      .toBe('opencodian-keychain:v1:backendSettings.codex.apiKey');
    expect((scrubbed.remoteControlToken as string))
      .toBe('opencodian-keychain:v1:remoteControlToken');
    const providers = scrubbed.providers as Array<{ id: string; apiKey: string }>;
    expect(providers[0].apiKey).toBe('opencodian-keychain:v1:providers.prov-a.apiKey');
    // Empty values stay empty; no placeholder, no storage entry.
    expect(providers[1].apiKey).toBe('');

    // The input (live settings shape) keeps the real values.
    expect((core.server as { auth: { password: string } }).auth.password).toBe('server-password-1');
    expect((core.remoteControlToken as string)).toBe('remote-token-abcdef');

    // The secret storage holds every real value under vault-scoped ids.
    expect(seam.store.get(buildSecretId(hashOf(VAULT), 'server.auth.password'))).toBe('server-password-1');
    expect(seam.store.get(buildSecretId(hashOf(VAULT), 'providers.prov-a.apiKey'))).toBe('provider-key-a');
    expect(seam.store.get(buildSecretId(hashOf(VAULT), 'imageGenerationModels.img-1.apiKey'))).toBe('image-key-1');
  });

  it('keeps plaintext when disabled (rollback) or when the secret storage is unavailable', async () => {
    const disabled = await keychain().svc.scrubForPersistence(coreWithSecrets(), { enabled: false });
    expect((disabled.server as { auth: { password: string } }).auth.password).toBe('server-password-1');

    const unavailable = new SettingsSecretsKeychain(null, VAULT);
    const kept = await unavailable.scrubForPersistence(coreWithSecrets(), { enabled: true });
    expect((kept.backendSettings as { codex: { apiKey: string } }).codex.apiKey).toBe('codex-key-123456');
  });

  it('keeps plaintext when a secret-storage write fails (persistence is never blocked)', async () => {
    const { seam, svc } = keychain();
    seam.writeFails = true;
    const scrubbed = await svc.scrubForPersistence(coreWithSecrets(), { enabled: true }) as Record<string, unknown>;
    expect((scrubbed.remoteControlToken as string)).toBe('remote-token-abcdef');
  });

  it('skips redundant secret writes for unchanged values', async () => {
    const { seam, svc } = keychain();
    const core = coreWithSecrets();
    await svc.scrubForPersistence(core, { enabled: true });
    const writesBefore = seam.store.size;
    await svc.scrubForPersistence(core, { enabled: true });
    expect(seam.store.size).toBe(writesBefore);
  });
});

describe('resolveAfterLoad', () => {
  it('resolves placeholders back into real values and reports the load', async () => {
    const { seam, svc } = keychain();
    seam.store.set(buildSecretId(hashOf(VAULT), 'backendSettings.codex.apiKey'), 'codex-key-123456');
    const core = {
      backendSettings: { codex: { apiKey: buildSecretPlaceholder('backendSettings.codex.apiKey') } },
    };

    const resolved = await svc.resolveAfterLoad(core) as Record<string, unknown>;
    expect((resolved.backendSettings as { codex: { apiKey: string } }).codex.apiKey)
      .toBe('codex-key-123456');

    const report = svc.takePendingLoadReport();
    expect(report?.migrated).toEqual([]);
    expect(report?.unresolved).toEqual([]);
  });

  it('migrates plaintext one-time: storage write + placeholder + migrated report', async () => {
    const { seam, svc } = keychain();
    const resolved = await svc.resolveAfterLoad(coreWithSecrets()) as Record<string, unknown>;

    expect((resolved.remoteControlToken as string))
      .toBe('opencodian-keychain:v1:remoteControlToken');
    expect(seam.store.get(buildSecretId(hashOf(VAULT), 'remoteControlToken'))).toBe('remote-token-abcdef');
    expect(svc.takePendingLoadReport()?.migrated).toContain('remoteControlToken');

    // Second load sees only placeholders: no re-migration.
    await svc.resolveAfterLoad(resolved);
    expect(svc.takePendingLoadReport()?.migrated).toEqual([]);
  });

  it('degrades honestly when entries are missing or the storage is unavailable', async () => {
    const { svc } = keychain();
    const missingEntry = {
      server: { auth: { password: buildSecretPlaceholder('server.auth.password') } },
    };
    let resolved = await svc.resolveAfterLoad(missingEntry) as Record<string, unknown>;
    expect((resolved.server as { auth: { password: string } }).auth.password).toBe('');
    expect(svc.takePendingLoadReport()?.unresolved).toEqual(['server.auth.password']);

    const unavailable = new SettingsSecretsKeychain(null, VAULT);
    resolved = await unavailable.resolveAfterLoad(coreWithSecrets()) as Record<string, unknown>;
    const report = unavailable.takePendingLoadReport();
    expect(report?.secretStorageUnavailable).toBe(true);
    expect(report?.plaintextWithoutSecretStorage.length).toBeGreaterThan(0);
    // Plaintext kept as-is (current-state storage), nothing silently cleared.
    expect((resolved.server as { auth: { password: string } }).auth.password).toBe('server-password-1');

    const placeholderOnly = {
      server: { auth: { password: buildSecretPlaceholder('server.auth.password') } },
    };
    resolved = await unavailable.resolveAfterLoad(placeholderOnly) as Record<string, unknown>;
    expect((resolved.server as { auth: { password: string } }).auth.password).toBe('');
    expect(unavailable.takePendingLoadReport()?.unresolved).toEqual(['server.auth.password']);
  });
});

describe('StorageService integration (settings.core.json)', () => {
  const mockAdapter = {
    basePath: '/test/vault',
    exists: jest.fn().mockResolvedValue(false),
    mkdir: jest.fn().mockResolvedValue(undefined),
    write: jest.fn().mockResolvedValue(undefined),
    writeBinary: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue('{}'),
    readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    remove: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
  };
  const fakeStorage = new FakeSecretStorage();
  const mockApp = {
    vault: { adapter: mockAdapter },
    secretStorage: fakeStorage,
  };
  let storage: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    fakeStorage.store.clear();
    mockAdapter.exists.mockResolvedValue(false);
    mockAdapter.read.mockResolvedValue('{}');
    storage = new StorageService({ app: mockApp } as never);
  });

  it('never writes secret bytes into the persisted core profile (storage available)', async () => {
    await storage.saveCoreSettings(coreWithSecrets() as never);

    const written = mockAdapter.write.mock.calls
      .map((call) => call[1] as string)
      .filter((body) => body.includes('opencodian-keychain:v1:'))
      .join('\n');
    expect(written).toContain('opencodian-keychain:v1:remoteControlToken');
    expect(written).not.toContain('remote-token-abcdef');
    expect(written).not.toContain('codex-key-123456');
    expect(written).not.toContain('provider-key-a');
  });

  it('writes plaintext back when the keychain toggle is off (rollback)', async () => {
    await storage.saveCoreSettings(coreWithSecrets(), { secretsKeychainEnabled: false });

    const written = mockAdapter.write.mock.calls
      .map((call) => call[1] as string)
      .join('\n');
    expect(written).toContain('remote-token-abcdef');
  });

  it('round-trips: scrub on save, resolve on load', async () => {
    await storage.saveCoreSettings(coreWithSecrets() as never);
    const persisted = mockAdapter.write.mock.calls
      .map((call) => call[1] as string)
      .find((body) => body.includes('opencodian-keychain:v1:')) ?? '{}';
    mockAdapter.exists.mockResolvedValue(true);
    mockAdapter.read.mockResolvedValue(persisted);

    const loaded = await storage.loadPersistedSettings();
    const data = (loaded.core.data ?? {}) as Record<string, unknown>;
    expect((data.remoteControlToken as string)).toBe('remote-token-abcdef');
    const providers = data.providers as Array<{ apiKey: string }>;
    expect(providers[0].apiKey).toBe('provider-key-a');
    expect(storage.takeSettingsSecretsLoadReport()?.unresolved).toEqual([]);
  });
});
