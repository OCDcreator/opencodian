import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  createClaudeProjectSettingsFile,
  discoverClaudeProjectSettings,
  openClaudeProjectSettingsFile,
} from '../../../../../src/core/agents/backend/ClaudeProjectSettingsDiscovery';

describe('ClaudeProjectSettingsDiscovery', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-settings-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function writeSettings(fileName: 'settings.json' | 'settings.local.json', content: string): Promise<void> {
    const settingsDir = path.join(tempRoot, '.claude');
    await fs.mkdir(settingsDir, { recursive: true });
    await fs.writeFile(path.join(settingsDir, fileName), content, 'utf-8');
  }

  it('returns two missing entries when vaultPath is null or empty', async () => {
    await expect(discoverClaudeProjectSettings(null)).resolves.toEqual([
      {
        relativePath: path.join('.claude', 'settings.json'),
        filePath: '',
        exists: false,
        hooks: {},
        enabledPlugins: [],
        extraKnownMarketplaces: [],
        hookCount: 0,
      },
      {
        relativePath: path.join('.claude', 'settings.local.json'),
        filePath: '',
        exists: false,
        hooks: {},
        enabledPlugins: [],
        extraKnownMarketplaces: [],
        hookCount: 0,
      },
    ]);
    await expect(discoverClaudeProjectSettings('')).resolves.toHaveLength(2);
  });

  it("returns two missing entries when .claude doesn't exist", async () => {
    const settings = await discoverClaudeProjectSettings(tempRoot);

    expect(settings).toEqual([
      {
        relativePath: path.join('.claude', 'settings.json'),
        filePath: path.join(tempRoot, '.claude', 'settings.json'),
        exists: false,
        hooks: {},
        enabledPlugins: [],
        extraKnownMarketplaces: [],
        hookCount: 0,
      },
      {
        relativePath: path.join('.claude', 'settings.local.json'),
        filePath: path.join(tempRoot, '.claude', 'settings.local.json'),
        exists: false,
        hooks: {},
        enabledPlugins: [],
        extraKnownMarketplaces: [],
        hookCount: 0,
      },
    ]);
  });

  it('discovers hooks and plugins from an existing settings.json', async () => {
    await writeSettings(
      'settings.json',
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { type: 'command', command: 'pre-tool.sh', timeout: 30, matcher: 'Write' },
          ],
          PostToolUse: [{ type: 'command', command: 'post-tool.sh' }],
          Stop: [{ type: 'command', command: 'stop.sh' }],
        },
        enabledPlugins: ['plugin-one', 'plugin-two', 42],
      }),
    );

    const [settingsJson, localSettings] = await discoverClaudeProjectSettings(tempRoot);

    expect(settingsJson).toEqual({
      relativePath: path.join('.claude', 'settings.json'),
      filePath: path.join(tempRoot, '.claude', 'settings.json'),
      exists: true,
      hooks: {
        PreToolUse: [{ type: 'command', command: 'pre-tool.sh', timeout: 30, matcher: 'Write' }],
        PostToolUse: [{ type: 'command', command: 'post-tool.sh' }],
        Stop: [{ type: 'command', command: 'stop.sh' }],
      },
      enabledPlugins: ['plugin-one', 'plugin-two'],
      extraKnownMarketplaces: [],
      hookCount: 3,
    });
    expect(localSettings.exists).toBe(false);
  });

  it('parses extraKnownMarketplaces from settings file', async () => {
    await writeSettings(
      'settings.local.json',
      JSON.stringify({
        extraKnownMarketplaces: ['https://example.com/marketplace', 'https://other.com/plugins', 123, true],
      }),
    );

    const [, localSettings] = await discoverClaudeProjectSettings(tempRoot);

    expect(localSettings.exists).toBe(true);
    expect(localSettings.extraKnownMarketplaces).toEqual([
      'https://example.com/marketplace',
      'https://other.com/plugins',
    ]);
  });

  it('returns empty hooks and plugins for an empty JSON file', async () => {
    await writeSettings('settings.json', '{}');

    const [settingsJson] = await discoverClaudeProjectSettings(tempRoot);

    expect(settingsJson.exists).toBe(true);
    expect(settingsJson.hooks).toEqual({});
    expect(settingsJson.enabledPlugins).toEqual([]);
    expect(settingsJson.extraKnownMarketplaces).toEqual([]);
    expect(settingsJson.hookCount).toBe(0);
  });

  it('handles malformed JSON gracefully', async () => {
    await writeSettings('settings.local.json', '{not-json');

    const [, localSettings] = await discoverClaudeProjectSettings(tempRoot);

    expect(localSettings.exists).toBe(true);
    expect(localSettings.hooks).toEqual({});
    expect(localSettings.enabledPlugins).toEqual([]);
    expect(localSettings.extraKnownMarketplaces).toEqual([]);
    expect(localSettings.hookCount).toBe(0);
    expect(localSettings.parseError).toEqual(expect.any(String));
  });

  it('creates settings.json with default empty content', async () => {
    const filePath = await createClaudeProjectSettingsFile(tempRoot, 'settings.json');

    expect(filePath).toBe(path.join(tempRoot, '.claude', 'settings.json'));
    await expect(fs.readFile(filePath ?? '', 'utf-8')).resolves.toBe('{}');
  });

  it('returns null when creating and file already exists', async () => {
    await writeSettings('settings.json', '{}');

    await expect(createClaudeProjectSettingsFile(tempRoot, 'settings.json')).resolves.toBeNull();
  });

  it('returns null when creating with null vaultPath', async () => {
    await expect(createClaudeProjectSettingsFile(null, 'settings.json')).resolves.toBeNull();
  });

  it('openClaudeProjectSettingsFile returns correct path without checking existence', async () => {
    await expect(openClaudeProjectSettingsFile(tempRoot, 'settings.local.json')).resolves.toBe(
      path.join(tempRoot, '.claude', 'settings.local.json'),
    );
    await expect(openClaudeProjectSettingsFile(null, 'settings.json')).resolves.toBeNull();
  });
});
