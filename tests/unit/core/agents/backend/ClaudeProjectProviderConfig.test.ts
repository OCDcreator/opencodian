import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  applyClaudeProviderPreset,
  maskClaudeProviderConfigSnapshot,
  maskClaudeProviderValue,
  migrateClaudeProviderModels,
  resolveClaudeProviderGlobalEffectiveValue,
  validateClaudeProviderPreset,
} from '../../../../../src/core/agents/backend/ClaudeProjectProviderConfig';
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

    const applied = await applyClaudeProviderPreset(tempRoot, preset(), []);
    expect(applied.lastAppliedManagedEnvKeys).toEqual(['FOO']);
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
    );
    expect(await readLocalSettings()).toEqual({
      permissions: { allow: ['Read'] },
      env: { MY_FLAG: '1', OLD_USER_VALUE: 'keep' },
    });
  });

  it('backs up malformed JSON before applying a preset', async () => {
    await writeLocalSettings('{ malformed');

    const result = await applyClaudeProviderPreset(tempRoot, preset({ extraEnv: {} }), []);
    expect(result.backupPath).toBe(`${localSettingsPath()}.bak`);
    await expect(fs.readFile(`${localSettingsPath()}.bak`, 'utf-8')).resolves.toBe('{ malformed');
    expect(await readLocalSettings()).toMatchObject({
      model: 'claude-sonnet-4-5',
      env: expect.objectContaining({ ANTHROPIC_AUTH_TOKEN: 'token-123456789' }),
    });
  });

  it('uses a timestamped backup name without overwriting an existing backup', async () => {
    await writeLocalSettings('{ malformed');
    await fs.writeFile(`${localSettingsPath()}.bak`, 'older backup', 'utf-8');

    const result = await applyClaudeProviderPreset(tempRoot, preset({ extraEnv: {} }), []);

    expect(result.backupPath).toMatch(new RegExp(`^${localSettingsPath().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.bak\\.`));
    await expect(fs.readFile(`${localSettingsPath()}.bak`, 'utf-8')).resolves.toBe('older backup');
    await expect(fs.readFile(result.backupPath!, 'utf-8')).resolves.toBe('{ malformed');
  });

  it('preserves an existing file model during one-time legacy migration', async () => {
    await writeLocalSettings(JSON.stringify({ model: 'user-model', permissions: { allow: ['Read'] } }));

    const result = await migrateClaudeProviderModels(tempRoot, 'legacy-model', 'legacy-fallback');
    expect(result.migrated).toBe(true);
    expect(await readLocalSettings()).toEqual({
      model: 'user-model',
      fallbackModel: ['legacy-fallback'],
      permissions: { allow: ['Read'] },
    });
  });

  it('does not write a local file for an empty legacy migration', async () => {
    const result = await migrateClaudeProviderModels(tempRoot, '', '');

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
});
