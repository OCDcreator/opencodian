import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  applyClaudeProviderPreset,
  maskClaudeProviderConfigSnapshot,
  maskClaudeProviderValue,
  migrateClaudeProviderModels,
  readClaudeProviderConfigSnapshot,
  resolveClaudeProviderGlobalEffectiveValue,
  validateClaudeProviderPreset,
} from '../../../../../src/core/agents/backend/ClaudeProjectProviderConfig';
import {
  listConfigurationArchiveHistory,
  ProjectResourceError,
  readAllowlistedFileSnapshot,
} from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';
import * as projectResourceSecureWrite from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';
import type { ClaudeProviderPreset } from '../../../../../src/core/types/settings';

describe('ClaudeProjectProviderConfig', () => {
  let tempRoot: string;

  const preset = (overrides: Partial<ClaudeProviderPreset> = {}): ClaudeProviderPreset => ({
    id: 'gateway',
    name: 'Gateway',
    baseUrl: 'https://gateway.example.com',
    authToken: 'token-123456789',
    model: 'claude-sonnet-4-5',
    fallbackModel: 'claude-haiku-4-5',
    haikuModel: 'claude-haiku-4-5',
    extraEnv: { FOO: '1' },
    ...overrides,
  });

  const localSettingsPath = (): string => path.join(tempRoot, '.claude', 'settings.local.json');
  const archiveRootPath = (): string => path.join(tempRoot, 'archive');

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-provider-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function writeLocalSettings(content: string): Promise<void> {
    await fs.mkdir(path.dirname(localSettingsPath()), { recursive: true });
    await fs.writeFile(localSettingsPath(), content, 'utf-8');
  }

  async function readLocalSettings(): Promise<Record<string, unknown>> {
    return JSON.parse(await fs.readFile(localSettingsPath(), 'utf-8')) as Record<string, unknown>;
  }

  it('merge-writes only managed keys and removes stale extra env keys on restore', async () => {
    await writeLocalSettings(JSON.stringify({
      permissions: { allow: ['Read'] },
      env: { MY_FLAG: '1', OLD_USER_VALUE: 'keep' },
    }));

    const applied = await applyClaudeProviderPreset(tempRoot, preset(), [], { archiveRootPath: archiveRootPath() });
    expect(applied.lastAppliedManagedEnvKeys).toEqual(['FOO']);
    expect(applied.evidence).toMatchObject({
      persistence: 'verified',
      application: 'pending',
      runtime: 'unavailable',
    });
    const history = await listConfigurationArchiveHistory({
      targetPath: localSettingsPath(),
      allowlist: [{ scope: 'local', rootPath: path.dirname(localSettingsPath()) }],
      archive: {
        archiveRootPath: archiveRootPath(),
        backend: 'claude',
        kind: 'provider-settings',
        format: 'json',
      },
    });
    expect(history.status).toBe('success');
    if (history.status !== 'success') return;
    expect(history.targets[0]?.entries.some((entry) => entry.archiveKind === 'overwrite')).toBe(true);
    expect(await readLocalSettings()).toEqual({
      permissions: { allow: ['Read'] },
      model: 'claude-sonnet-4-5',
      fallbackModel: ['claude-haiku-4-5'],
      env: {
        MY_FLAG: '1',
        OLD_USER_VALUE: 'keep',
        ANTHROPIC_BASE_URL: 'https://gateway.example.com',
        ANTHROPIC_AUTH_TOKEN: 'token-123456789',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5',
        FOO: '1',
      },
    });

    await applyClaudeProviderPreset(
      tempRoot,
      preset({ id: 'official', name: 'Anthropic Official', baseUrl: '', authToken: '', model: '', fallbackModel: '', haikuModel: '', extraEnv: {} }),
      applied.lastAppliedManagedEnvKeys,
      { expectedRevision: applied.revision, archiveRootPath: archiveRootPath() },
    );
    expect(await readLocalSettings()).toEqual({
      permissions: { allow: ['Read'] },
      env: { MY_FLAG: '1', OLD_USER_VALUE: 'keep' },
    });
  });

  it('fails closed on malformed strict JSON without creating a backup or overwriting bytes', async () => {
    await writeLocalSettings('{ malformed');

    await expect(applyClaudeProviderPreset(
      tempRoot,
      preset({ extraEnv: {} }),
      [],
      { archiveRootPath: archiveRootPath() },
    )).rejects.toThrow('strict JSON');
    await expect(fs.readFile(localSettingsPath(), 'utf-8')).resolves.toBe('{ malformed');
    await expect(fs.access(`${localSettingsPath()}.bak`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a settings.local.json symlink outside the narrow .claude root before preset persistence', async () => {
    const outsidePath = path.join(tempRoot, 'outside-settings.json');
    const outsideContent = '{\n  "outsideSecret": "must-not-be-read"\n}\n';
    await fs.writeFile(outsidePath, outsideContent, 'utf8');
    await fs.mkdir(path.dirname(localSettingsPath()), { recursive: true });
    await fs.symlink(outsidePath, localSettingsPath());

    await expect(applyClaudeProviderPreset(
      tempRoot,
      preset({ extraEnv: {} }),
      [],
      { archiveRootPath: archiveRootPath() },
    )).rejects.toEqual(expect.objectContaining({
      name: ProjectResourceError.name,
      code: expect.stringMatching(/outside-allowlist|path-traversal/),
    }));
    await expect(fs.readFile(outsidePath, 'utf8')).resolves.toBe(outsideContent);
  });

  it('fails closed during legacy migration when the existing local settings are malformed', async () => {
    await writeLocalSettings('{ malformed');

    await expect(migrateClaudeProviderModels(
      tempRoot,
      'legacy-model',
      'legacy-fallback',
      { archiveRootPath: archiveRootPath() },
    )).rejects.toThrow('strict JSON');
    await expect(fs.readFile(localSettingsPath(), 'utf-8')).resolves.toBe('{ malformed');
  });

  it('surfaces an expected-revision conflict without replacing an external edit', async () => {
    await writeLocalSettings(JSON.stringify({ permissions: { allow: ['Read'] } }));
    const applied = await applyClaudeProviderPreset(
      tempRoot,
      preset({ extraEnv: {} }),
      [],
      { archiveRootPath: archiveRootPath() },
    );
    const external = '{\n  "external": true\n}\n';
    await writeLocalSettings(external);

    await expect(applyClaudeProviderPreset(
      tempRoot,
      preset({ model: 'new-model', extraEnv: {} }),
      [],
      { expectedRevision: applied.revision, archiveRootPath: archiveRootPath() },
    )).rejects.toEqual(expect.objectContaining({
      name: 'ClaudeProviderConfigMutationError',
      result: expect.objectContaining({ status: 'conflict' }),
    }));
    await expect(fs.readFile(localSettingsPath(), 'utf-8')).resolves.toBe(external);
  });

});

describe('ClaudeProjectProviderConfig mutation safety and validation', () => {
  let tempRoot: string;

  const preset = (overrides: Partial<ClaudeProviderPreset> = {}): ClaudeProviderPreset => ({
    id: 'gateway',
    name: 'Gateway',
    baseUrl: 'https://gateway.example.com',
    authToken: 'token-123456789',
    model: 'claude-sonnet-4-5',
    fallbackModel: 'claude-haiku-4-5',
    haikuModel: 'claude-haiku-4-5',
    extraEnv: { FOO: '1' },
    ...overrides,
  });

  const localSettingsPath = (): string => path.join(tempRoot, '.claude', 'settings.local.json');
  const archiveRootPath = (): string => path.join(tempRoot, 'archive');

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-provider-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function writeLocalSettings(content: string): Promise<void> {
    await fs.mkdir(path.dirname(localSettingsPath()), { recursive: true });
    await fs.writeFile(localSettingsPath(), content, 'utf-8');
  }

  it('rejects an escaping Claude parent symlink planted after the initial preset-write guard', async () => {
    const claudeRoot = path.dirname(localSettingsPath());
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-outside-'));
    let planted = false;
    let claudeRootGuardCalls = 0;
    const secureWriteModule = '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';
    const providerConfigModule = '../../../../../src/core/agents/backend/ClaudeProjectProviderConfig';

    // Reload only this public mutation seam with a guard wrapper. The wrapper
    // plants the symlink after writeLocalSettings' first proof (call 2: call 1
    // belongs to the initial read), making the actual mkdir/recheck sequence
    // deterministic without replacing the filesystem mutation itself.
    jest.resetModules();
    jest.doMock(secureWriteModule, () => {
      const actual = jest.requireActual(secureWriteModule) as typeof import('../../../../../src/core/agents/backend/ProjectResourceSecureWrite');
      return {
        ...actual,
        assertWithinRoot: async (basePath: string, targetPath: string): Promise<void> => {
          await actual.assertWithinRoot(basePath, targetPath);
          if (targetPath === claudeRoot) {
            claudeRootGuardCalls += 1;
            if (claudeRootGuardCalls === 2) {
              planted = true;
              await fs.symlink(outsideRoot, claudeRoot);
            }
          }
        },
      };
    });

    try {
      const { applyClaudeProviderPreset: applyWithRace } = await import(providerConfigModule) as typeof import('../../../../../src/core/agents/backend/ClaudeProjectProviderConfig');
      await expect(applyWithRace(
        tempRoot,
        preset({ extraEnv: {} }),
        [],
        { archiveRootPath: archiveRootPath() },
      )).rejects.toEqual(expect.objectContaining({ name: ProjectResourceError.name }));
      expect(planted).toBe(true);
      expect(claudeRootGuardCalls).toBe(2);
      await expect(fs.access(path.join(outsideRoot, 'settings.local.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      jest.dontMock(secureWriteModule);
      jest.resetModules();
      await fs.rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it('fails closed without merging bytes when the shared descriptor snapshot detects a read race', async () => {
    const external = '{\n  "external": true\n}\n';
    await writeLocalSettings(external);
    const actualSnapshot = readAllowlistedFileSnapshot;
    const snapshotSpy = jest.spyOn(projectResourceSecureWrite, 'readAllowlistedFileSnapshot')
      .mockImplementation(async (options) => (
        options.targetPath === localSettingsPath()
          ? { status: 'conflict', expected: null, current: null }
          : actualSnapshot(options)
      ));

    await expect(applyClaudeProviderPreset(
      tempRoot,
      preset({ extraEnv: {} }),
      [],
      { archiveRootPath: archiveRootPath() },
    )).rejects.toThrow(/changed while reading|snapshot|conflict/i);
    expect(snapshotSpy).toHaveBeenCalledWith(expect.objectContaining({ targetPath: localSettingsPath() }));
    await expect(fs.readFile(localSettingsPath(), 'utf-8')).resolves.toBe(external);
    snapshotSpy.mockRestore();
  });
});

describe('ClaudeProjectProviderConfig migration, validation, and snapshots', () => {
  let tempRoot: string;

  const preset = (overrides: Partial<ClaudeProviderPreset> = {}): ClaudeProviderPreset => ({
    id: 'gateway',
    name: 'Gateway',
    baseUrl: 'https://gateway.example.com',
    authToken: 'token-123456789',
    model: 'claude-sonnet-4-5',
    fallbackModel: 'claude-haiku-4-5',
    haikuModel: 'claude-haiku-4-5',
    extraEnv: { FOO: '1' },
    ...overrides,
  });

  const localSettingsPath = (): string => path.join(tempRoot, '.claude', 'settings.local.json');
  const archiveRootPath = (): string => path.join(tempRoot, 'archive');

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-provider-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function writeLocalSettings(content: string): Promise<void> {
    await fs.mkdir(path.dirname(localSettingsPath()), { recursive: true });
    await fs.writeFile(localSettingsPath(), content, 'utf-8');
  }

  async function readLocalSettings(): Promise<Record<string, unknown>> {
    return JSON.parse(await fs.readFile(localSettingsPath(), 'utf-8')) as Record<string, unknown>;
  }

  it('preserves an existing file model during one-time legacy migration', async () => {
    await writeLocalSettings(JSON.stringify({ model: 'user-model', permissions: { allow: ['Read'] } }));

    const result = await migrateClaudeProviderModels(
      tempRoot,
      'legacy-model',
      'legacy-fallback',
      { archiveRootPath: archiveRootPath() },
    );
    expect(result.migrated).toBe(true);
    expect(await readLocalSettings()).toEqual({
      model: 'user-model',
      fallbackModel: ['legacy-fallback'],
      permissions: { allow: ['Read'] },
    });
  });

  it('does not write a local file for an empty legacy migration', async () => {
    const result = await migrateClaudeProviderModels(tempRoot, '', '', { archiveRootPath: archiveRootPath() });

    expect(result.migrated).toBe(false);
    await expect(fs.access(localSettingsPath())).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an empty vault path instead of constructing a global write target', async () => {
    await expect(applyClaudeProviderPreset('', preset(), [])).rejects.toThrow('empty-vault');
  });

  it('rejects provider values that would produce an ambiguous or invalid file configuration', () => {
    expect(validateClaudeProviderPreset(preset({ baseUrl: 'https://gateway.example.com/v1' })).baseUrlEndsWithV1).toBe(true);
    expect(validateClaudeProviderPreset(preset({ authToken: 'Bearer abc' })).authTokenHasBearerPrefix).toBe(true);
    expect(validateClaudeProviderPreset(preset({ fallbackModel: 'claude-sonnet-4-5' })).fallbackMatchesModel).toBe(true);
    expect(validateClaudeProviderPreset(preset({ extraEnv: { ANTHROPIC_AUTH_TOKEN: 'duplicate' } })).hasReservedExtraEnv).toBe(true);
  });

  it('masks token-shaped values recursively', () => {
    expect(maskClaudeProviderValue('ANTHROPIC_AUTH_TOKEN', 'token-123456789')).toBe('toke…789');
    expect(maskClaudeProviderValue('env', { ANTHROPIC_AUTH_TOKEN: 'token-123456789', MODEL: 'x' })).toEqual({
      ANTHROPIC_AUTH_TOKEN: 'toke…789',
      MODEL: 'x',
    });
  });

  it('keeps global layers read-only and resolves their known precedence without exposing tokens', () => {
    const snapshot = {
      layers: [
        { id: 'user' as const, filePath: '/home/user/.claude/settings.json', exists: true, content: { model: 'user-model', env: { ANTHROPIC_AUTH_TOKEN: 'user-token-123' } } },
        { id: 'project' as const, filePath: '/vault/.claude/settings.json', exists: true, content: { model: 'project-model', env: { ANTHROPIC_AUTH_TOKEN: 'project-token-456' } } },
        { id: 'local' as const, filePath: '/vault/.claude/settings.local.json', exists: true, content: { model: 'local-model' } },
      ],
      shellEnv: { ANTHROPIC_AUTH_TOKEN: 'shell-token-789' },
    };

    expect(resolveClaudeProviderGlobalEffectiveValue(snapshot, 'model')).toBe('project-model');
    expect(resolveClaudeProviderGlobalEffectiveValue(snapshot, 'ANTHROPIC_AUTH_TOKEN')).toBe('project-token-456');
    expect(maskClaudeProviderConfigSnapshot(snapshot).layers[0]?.content).toEqual({
      model: 'user-model',
      env: { ANTHROPIC_AUTH_TOKEN: 'user…123' },
    });
  });

  it('returns the exact local revision in the masked read-only snapshot without exposing its token', async () => {
    await writeLocalSettings(JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: 'token-123456789' }, unknownTopLevel: { preserved: true } }));

    const snapshot = await readClaudeProviderConfigSnapshot(tempRoot);
    const local = snapshot.layers.find((layer) => layer.id === 'local');

    expect(local?.filePath).toBe(localSettingsPath());
    expect(local?.revision).toEqual(expect.objectContaining({ canonicalPath: expect.any(String), sha256: expect.any(String) }));
    expect(JSON.stringify(maskClaudeProviderConfigSnapshot(snapshot))).not.toContain('token-123456789');
  });

  it('uses the allowlisted descriptor snapshot as the single source for local content and revision', async () => {
    await writeLocalSettings(JSON.stringify({ fromDisk: 'must-not-win' }));
    const stableRevision = {
      canonicalPath: localSettingsPath(), mtimeMs: 123, size: 42, sha256: 'stable-snapshot-revision',
    };
    const actualSnapshot = readAllowlistedFileSnapshot;
    const snapshotSpy = jest.spyOn(projectResourceSecureWrite, 'readAllowlistedFileSnapshot')
      .mockImplementation(async (options) => (
        options.targetPath === localSettingsPath()
          ? { status: 'success', content: JSON.stringify({ fromSnapshot: true }), revision: stableRevision }
          : actualSnapshot(options)
      ));

    try {
      const snapshot = await readClaudeProviderConfigSnapshot(tempRoot);
      const local = snapshot.layers.find((layer) => layer.id === 'local');
      expect(snapshotSpy).toHaveBeenCalledWith(expect.objectContaining({
        targetPath: localSettingsPath(),
        allowlist: [{ scope: 'local', rootPath: path.dirname(localSettingsPath()) }],
      }));
      expect(local?.content).toEqual({ fromSnapshot: true });
      expect(local?.revision).toEqual(stableRevision);
    } finally {
      snapshotSpy.mockRestore();
    }
  });

  it('binds legacy migration to the captured revision and requires a fresh revision after conflict', async () => {
    await writeLocalSettings(JSON.stringify({ permissions: { allow: ['Read'] } }));
    const captured = (await readClaudeProviderConfigSnapshot(tempRoot)).layers.find((layer) => layer.id === 'local')?.revision;
    expect(captured).not.toBeNull();
    const external = '{\n  "external": true\n}\n';
    await writeLocalSettings(external);

    await expect(migrateClaudeProviderModels(
      tempRoot,
      'legacy-model',
      'legacy-fallback',
      { expectedRevision: captured, archiveRootPath: archiveRootPath() },
    )).rejects.toEqual(expect.objectContaining({
      name: 'ClaudeProviderConfigMutationError',
      result: expect.objectContaining({ status: 'conflict' }),
    }));
    await expect(fs.readFile(localSettingsPath(), 'utf-8')).resolves.toBe(external);

    const freshRevision = (await readClaudeProviderConfigSnapshot(tempRoot)).layers.find((layer) => layer.id === 'local')?.revision;
    const retried = await migrateClaudeProviderModels(
      tempRoot,
      'legacy-model',
      'legacy-fallback',
      { expectedRevision: freshRevision, archiveRootPath: archiveRootPath() },
    );
    expect(retried.migrated).toBe(true);
    expect(retried.revision).toEqual(expect.objectContaining({ sha256: expect.any(String) }));
    expect(await readLocalSettings()).toEqual({
      external: true,
      model: 'legacy-model',
      fallbackModel: ['legacy-fallback'],
    });
  });
});
