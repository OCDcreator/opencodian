/**
 * Platform acceptance — default managed settings discovery must follow the
 * exact Claude Code policy-file location for the selected runtime platform.
 * Discovery stays read-only, and unsupported platforms do not inherit another
 * operating system's policy root.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

type PlatformFixtureOptions = {
  home: string;
  username: string;
  archiveRootPath: string;
  platform: NodeJS.Platform;
};

describe('ClaudeSettingsSourceService platform managed settings', () => {
  it.each([
    {
      platform: 'darwin' as const,
      managedFile: '/Library/Application Support/ClaudeCode/managed-settings.json',
      plistPaths: [
        '/Library/Managed Preferences/com.anthropic.claudecode.plist',
        '/Library/Managed Preferences/test-platform-user/com.anthropic.claudecode.plist',
      ],
    },
    {
      platform: 'linux' as const,
      managedFile: '/etc/claude-code/managed-settings.json',
      plistPaths: [],
    },
    {
      platform: 'win32' as const,
      managedFile: 'C:\\Program Files\\ClaudeCode\\managed-settings.json',
      plistPaths: [],
    },
  ])('discovers the exact read-only $platform policy file', async ({ platform, managedFile, plistPaths }) => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-platform-managed-'));
    try {
      const home = path.join(sandbox, 'home');
      const vault = path.join(sandbox, 'vault');
      await fs.mkdir(home, { recursive: true });
      await fs.mkdir(vault, { recursive: true });
      const options: PlatformFixtureOptions = {
        home,
        username: 'test-platform-user',
        archiveRootPath: path.join(sandbox, 'archive'),
        platform,
      };
      const service = new ClaudeSettingsSourceService(vault, options);

      const inventory = await service.inventory();
      const managed = inventory.find((candidate) => candidate.origin === 'managed-file');
      expect(managed).toMatchObject({
        path: managedFile,
        scope: 'managed',
        format: 'json',
        editable: false,
      });
      expect(inventory
        .filter((candidate) => candidate.origin.startsWith('managed-plist-'))
        .map((candidate) => candidate.path))
        .toEqual(plistPaths);

      const write = await service.write({
        targetPath: managedFile,
        content: 'not-json',
        expectedRevision: null,
      });
      expect(write.result.status).toBe('read-only');
      await expect(fs.stat(options.archiveRootPath)).rejects.toThrow();
    } finally {
      await fs.rm(sandbox, { recursive: true, force: true });
    }
  });

  it('does not invent a managed policy file root for an unsupported platform', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-platform-unsupported-'));
    try {
      const home = path.join(sandbox, 'home');
      const vault = path.join(sandbox, 'vault');
      await fs.mkdir(home, { recursive: true });
      await fs.mkdir(vault, { recursive: true });
      const options: PlatformFixtureOptions = {
        home,
        username: 'test-platform-user',
        archiveRootPath: path.join(sandbox, 'archive'),
        platform: 'freebsd',
      };

      const inventory = await new ClaudeSettingsSourceService(vault, options).inventory();

      expect(inventory.some((candidate) => candidate.origin === 'managed-file')).toBe(false);
      expect(inventory.some((candidate) => candidate.origin.startsWith('managed-plist-'))).toBe(false);
      await expect(fs.stat(options.archiveRootPath)).rejects.toThrow();
    } finally {
      await fs.rm(sandbox, { recursive: true, force: true });
    }
  });
});
