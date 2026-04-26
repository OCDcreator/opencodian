import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { McpConfigService } from '../../../../src/core/config/McpConfigService';
import { OpencodeConfigManager } from '../../../../src/core/config/OpencodeConfigManager';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
}));

let testVaultPath: string;
let manager: OpencodeConfigManager;
let service: McpConfigService;

function createTempVaultPath(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-mcp-config-'));
}

function cleanupTestVault(targetPath: string | undefined): void {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 50,
  });
}

async function writeRawConfig(text: string): Promise<void> {
  const configDir = path.join(testVaultPath, '.opencode');
  await fs.promises.mkdir(configDir, { recursive: true });
  await fs.promises.writeFile(path.join(configDir, 'opencode.json'), text, 'utf-8');
}

beforeEach(() => {
  testVaultPath = createTempVaultPath();
  manager = new OpencodeConfigManager(testVaultPath);
  service = new McpConfigService(manager);
});

afterEach(() => {
  cleanupTestVault(testVaultPath);
});

describe('McpConfigService', () => {
  it('reads project-owned MCP entries without treating runtime-only servers as writable', async () => {
    await manager.write({
      mcp: {
        project: {
          type: 'remote',
          url: 'https://mcp.example.com/mcp',
        },
      },
    });

    const ownership = await service.resolveOwnership(['project', 'runtime-only']);

    expect(ownership.project.projectOwned).toBe(true);
    expect(ownership.project.entry?.type).toBe('remote');
    expect(ownership['runtime-only'].projectOwned).toBe(false);
    expect(ownership['runtime-only'].entry).toBeUndefined();
  });

  it('upserts an existing project entry while preserving unknown fields and unrelated config', async () => {
    await manager.write({
      provider: { demo: { name: 'Demo' } },
      mcp: {
        exa: {
          type: 'remote',
          url: 'https://old.example.com/mcp',
          futureField: { keep: true },
        },
      },
    });

    await service.upsertServer('exa', {
      type: 'remote',
      url: 'https://new.example.com/mcp',
      enabled: false,
    });

    const config = await manager.read();
    expect(config.provider?.demo?.name).toBe('Demo');
    expect(config.mcp).toEqual({
      exa: {
        type: 'remote',
        url: 'https://new.example.com/mcp',
        enabled: false,
        futureField: { keep: true },
      },
    });
  });

  it('deletes only the project-owned MCP entry instead of disabling it', async () => {
    await manager.write({
      mcp: {
        keep: { type: 'local', command: ['node', 'keep.js'] },
        remove: { type: 'local', command: ['node', 'remove.js'], enabled: false },
      },
    });

    await service.deleteServer('remove');

    expect((await manager.read()).mcp).toEqual({
      keep: { type: 'local', command: ['node', 'keep.js'] },
    });
  });

  it('replaces known fields so cleared secrets and transport switches do not leave stale config behind', async () => {
    await manager.write({
      mcp: {
        exa: {
          type: 'remote',
          url: 'https://old.example.com/mcp',
          headers: { Authorization: 'Bearer secret' },
          timeout: 5000,
          oauth: {
            clientId: 'client-1',
            clientSecret: 'secret-1',
          },
          futureField: { keep: true },
        },
      },
    });

    await service.upsertServer('exa', {
      type: 'local',
      command: ['node', 'server.js'],
      enabled: true,
    });

    expect((await manager.read()).mcp).toEqual({
      exa: {
        type: 'local',
        command: ['node', 'server.js'],
        enabled: true,
        futureField: { keep: true },
      },
    });
  });

  it('fails closed on invalid config instead of synthesizing defaults for delete', async () => {
    await writeRawConfig('{ invalid json');

    await expect(service.deleteServer('broken')).rejects.toThrow('OpenCode config could not be parsed');

    expect(await fs.promises.readFile(manager.getConfigPath(), 'utf-8')).toBe('{ invalid json');
  });
});
