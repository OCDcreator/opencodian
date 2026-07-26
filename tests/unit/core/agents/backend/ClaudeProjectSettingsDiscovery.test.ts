import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
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

  it('parses official nested hook config matching setupShellHookConfig shape', async () => {
    // This is the exact shape written by SettingsCapabilityLabSection.setupShellHookConfig()
    // and verified to produce real nonce files on disk via normal Claude chat.
    await writeSettings(
      'settings.local.json',
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: "echo 'hook-proof' > /tmp/nonce.txt", timeout: 10 }],
            },
          ],
          PreToolUse: [
            {
              matcher: 'Write',
              hooks: [
                { type: 'command', command: 'pre-write.sh' },
                { type: 'command', command: 'pre-write-2.sh', timeout: 30 },
              ],
            },
          ],
        },
        enabledPlugins: ['my-plugin'],
      }),
    );

    const [, localSettings] = await discoverClaudeProjectSettings(tempRoot);

    expect(localSettings.exists).toBe(true);
    expect(localSettings.hookCount).toBe(3); // 1 SessionStart + 2 PreToolUse
    expect(Object.keys(localSettings.hooks)).toEqual(['SessionStart', 'PreToolUse']);

    // SessionStart: 1 group with 1 hook command
    expect(localSettings.hooks.SessionStart).toEqual([
      {
        matcher: '',
        hooks: [{ type: 'command', command: "echo 'hook-proof' > /tmp/nonce.txt", timeout: 10 }],
      },
    ]);

    // PreToolUse: 1 group with 2 hook commands
    expect(localSettings.hooks.PreToolUse).toEqual([
      {
        matcher: 'Write',
        hooks: [
          { type: 'command', command: 'pre-write.sh' },
          { type: 'command', command: 'pre-write-2.sh', timeout: 30 },
        ],
      },
    ]);

    // enabledPlugins still works
    expect(localSettings.enabledPlugins).toEqual(['my-plugin']);
    expect(localSettings.extraKnownMarketplaces).toEqual([]);
  });

  it('counts hook commands across multiple groups per event', async () => {
    await writeSettings(
      'settings.json',
      JSON.stringify({
        hooks: {
          PostToolUse: [
            { matcher: 'Read', hooks: [{ type: 'command', command: 'post-read.sh' }] },
            { matcher: 'Write', hooks: [{ type: 'command', command: 'post-write.sh' }, { type: 'command', command: 'post-write-2.sh' }] },
          ],
        },
      }),
    );

    const [settingsJson] = await discoverClaudeProjectSettings(tempRoot);

    expect(settingsJson.hookCount).toBe(3); // 1 + 2 across two groups
    expect(settingsJson.hooks.PostToolUse).toHaveLength(2); // 2 groups
  });

  it('falls back to lenient flat direct-entry shape', async () => {
    // Flat shape { type, command } is NOT the official path but is tolerated
    await writeSettings(
      'settings.json',
      JSON.stringify({
        hooks: {
          Stop: [{ type: 'command', command: 'stop.sh' }],
        },
      }),
    );

    const [settingsJson] = await discoverClaudeProjectSettings(tempRoot);

    expect(settingsJson.exists).toBe(true);
    expect(settingsJson.hookCount).toBe(1);
    // Flat entry promoted to a single-command group
    expect(settingsJson.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 'stop.sh' }] }]);
  });

  it('ignores entries that are neither nested groups nor flat entries', async () => {
    await writeSettings(
      'settings.json',
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: '', hooks: [{ type: 'command', command: 'valid.sh' }] },
            { type: 'command', command: 'flat.sh' }, // flat fallback
            { malformed: true }, // ignored
            'string-entry', // ignored
            { matcher: '', hooks: [{ invalid: true }] }, // hooks has no valid entries
          ],
          NotAnArray: 'wrong',
        },
      }),
    );

    const [settingsJson] = await discoverClaudeProjectSettings(tempRoot);

    expect(settingsJson.hookCount).toBe(2); // 1 nested + 1 flat
    expect(settingsJson.hooks.SessionStart).toHaveLength(2);
    expect(Object.keys(settingsJson.hooks)).toEqual(['SessionStart']); // NotAnArray skipped
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

  it('openClaudeProjectSettingsFile returns correct path without checking existence', async () => {
    await expect(openClaudeProjectSettingsFile(tempRoot, 'settings.local.json')).resolves.toBe(
      path.join(tempRoot, '.claude', 'settings.local.json'),
    );
    await expect(openClaudeProjectSettingsFile(null, 'settings.json')).resolves.toBeNull();
  });
});
