/**
 * Tests for OpencodeConfigManager subagent_depth read/write helpers
 * (OpenCode 1.18.3 schema addition).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { OpencodeConfigManager } from '../../../../src/core/config/OpencodeConfigManager';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
}));

let testVaultPath: string;
let manager: OpencodeConfigManager;

function createTempVaultPath(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-subagent-depth-'));
}

function cleanupTestVault(targetPath: string | undefined): void {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
}

beforeEach(() => {
  testVaultPath = createTempVaultPath();
  manager = new OpencodeConfigManager(testVaultPath, {
    archiveRootPath: path.join(testVaultPath, '.opencodian-test-archive'),
  });
});

afterEach(() => {
  cleanupTestVault(testVaultPath);
});

describe('OpencodeConfigManager subagent_depth', () => {
  describe('getSubagentDepth', () => {
    it('returns undefined when the field is absent', async () => {
      expect(await manager.getSubagentDepth()).toBeUndefined();
    });

    it('returns the configured integer value', async () => {
      await manager.write({
        ...({ $schema: 'https://opencode.ai/config.json' } as Record<string, unknown>),
        subagent_depth: 2,
      } as never);
      expect(await manager.getSubagentDepth()).toBe(2);
    });

    it('floors fractional values to the nearest integer', async () => {
      await manager.write({
        ...({ $schema: 'https://opencode.ai/config.json' } as Record<string, unknown>),
        subagent_depth: 2.9,
      } as never);
      expect(await manager.getSubagentDepth()).toBe(2);
    });

    it('rejects negative numbers as undefined', async () => {
      await manager.write({
        ...({ $schema: 'https://opencode.ai/config.json' } as Record<string, unknown>),
        subagent_depth: -1,
      } as never);
      expect(await manager.getSubagentDepth()).toBeUndefined();
    });
  });

  describe('updateSubagentDepth', () => {
    it('writes a non-negative integer', async () => {
      await manager.updateSubagentDepth(3);
      const config = await manager.read();
      expect(config.subagent_depth).toBe(3);
    });

    it('floors fractional values before writing', async () => {
      await manager.updateSubagentDepth(2.7);
      const config = await manager.read();
      expect(config.subagent_depth).toBe(2);
    });

    it('allows zero (disables all subagents)', async () => {
      await manager.updateSubagentDepth(0);
      const config = await manager.read();
      expect(config.subagent_depth).toBe(0);
    });

    it('removes the field when passed undefined', async () => {
      await manager.updateSubagentDepth(2);
      await manager.updateSubagentDepth(undefined);
      const config = await manager.read();
      expect(config.subagent_depth).toBeUndefined();
    });

    it('removes the field when passed null', async () => {
      await manager.updateSubagentDepth(2);
      await manager.updateSubagentDepth(null);
      const config = await manager.read();
      expect(config.subagent_depth).toBeUndefined();
    });

    it('removes the field when passed a negative number', async () => {
      await manager.updateSubagentDepth(2);
      await manager.updateSubagentDepth(-5);
      const config = await manager.read();
      expect(config.subagent_depth).toBeUndefined();
    });

    it('removes the field when passed NaN', async () => {
      await manager.updateSubagentDepth(2);
      await manager.updateSubagentDepth(Number.NaN);
      const config = await manager.read();
      expect(config.subagent_depth).toBeUndefined();
    });

    it('round-trips through getSubagentDepth', async () => {
      await manager.updateSubagentDepth(4);
      expect(await manager.getSubagentDepth()).toBe(4);
    });
  });
});
