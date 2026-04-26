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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-formatter-config-'));
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

beforeEach(() => {
  testVaultPath = createTempVaultPath();
  manager = new OpencodeConfigManager(testVaultPath);
});

afterEach(() => {
  cleanupTestVault(testVaultPath);
});

describe('OpencodeConfigManager formatter config', () => {
  it('returns undefined when no formatter config exists', async () => {
    expect(await manager.getFormatterConfig()).toBeUndefined();
  });

  it('reads boolean false formatter config', async () => {
    await manager.write({ formatter: false });
    expect(await manager.getFormatterConfig()).toBe(false);
  });

  it('reads object formatter config with entries', async () => {
    await manager.write({
      formatter: {
        prettier: {
          disabled: true,
        },
        'custom-fmt': {
          command: ['deno', 'fmt', '$FILE'],
          extensions: ['.md'],
        },
      },
    });

    expect(await manager.getFormatterConfig()).toEqual({
      prettier: { disabled: true },
      'custom-fmt': { command: ['deno', 'fmt', '$FILE'], extensions: ['.md'] },
    });
  });

  it('updateFormatterConfig writes formatter: false', async () => {
    await manager.updateFormatterConfig(false);
    expect((await manager.read()).formatter).toBe(false);
  });

  it('updateFormatterConfig writes formatter object', async () => {
    await manager.updateFormatterConfig({
      prettier: { disabled: true },
      biome: { command: ['npx', '@biomejs/biome', 'format', '--write', '$FILE'] },
    });

    expect((await manager.read()).formatter).toEqual({
      prettier: { disabled: true },
      biome: { command: ['npx', '@biomejs/biome', 'format', '--write', '$FILE'] },
    });
  });

  it('updateFormatterConfig deletes formatter field when passed null', async () => {
    await manager.write({ formatter: false });
    await manager.updateFormatterConfig(null);

    expect((await manager.read()).formatter).toBeUndefined();
  });

  it('updateFormatterConfig deletes formatter field when passed undefined', async () => {
    await manager.write({ formatter: { biome: { disabled: true } } });
    await manager.updateFormatterConfig(undefined);

    expect((await manager.read()).formatter).toBeUndefined();
  });

  it('updateFormatterConfig preserves explicit empty object formatter config', async () => {
    await manager.write({ formatter: { biome: { disabled: true } } });
    await manager.updateFormatterConfig({});

    expect((await manager.read()).formatter).toEqual({});
  });

  it('updateFormatterConfig uses exact write, allowing entry deletion', async () => {
    await manager.write({
      formatter: {
        prettier: { disabled: true },
        biome: { command: ['biome', 'format', '--write', '$FILE'] },
        ruff: { disabled: true },
      },
    });

    await manager.updateFormatterConfig({
      prettier: { disabled: false },
    });

    expect((await manager.read()).formatter).toEqual({
      prettier: { disabled: false },
    });
  });

  it('formatter config preserves unrelated top-level fields', async () => {
    await manager.write({
      provider: { demo: { name: 'Demo' } },
      formatter: { biome: { disabled: true } },
      watcher: { ignore: ['dist/**'] },
    });

    await manager.updateFormatterConfig({ prettier: { disabled: true } });

    const config = await manager.read();
    expect(config.provider?.demo?.name).toBe('Demo');
    expect(config.watcher).toEqual({ ignore: ['dist/**'] });
    expect(config.formatter).toEqual({ prettier: { disabled: true } });
  });

  it('formatter config preserves unknown entry fields', async () => {
    await manager.write({
      formatter: {
        prettier: {
          disabled: true,
          futureField: 'should-be-preserved',
        },
      },
    });

    expect(await manager.getFormatterConfig()).toEqual({
      prettier: {
        disabled: true,
        futureField: 'should-be-preserved',
      },
    });
  });

  it('formatter config preserves environment variables', async () => {
    await manager.updateFormatterConfig({
      prettier: {
        command: ['npx', 'prettier', '--write', '$FILE'],
        environment: { NODE_ENV: 'development', BUN_BE_BUN: '1' },
        extensions: ['.js', '.ts'],
      },
    });

    expect(await manager.getFormatterConfig()).toEqual({
      prettier: {
        command: ['npx', 'prettier', '--write', '$FILE'],
        environment: { NODE_ENV: 'development', BUN_BE_BUN: '1' },
        extensions: ['.js', '.ts'],
      },
    });
  });

  it('formatter update preserves unknown fields round-trip through write and read', async () => {
    await manager.updateFormatterConfig({
      prettier: {
        disabled: false,
        futureField: 'keep-me',
        nestedUnknown: { deep: true },
      },
    });

    expect(await manager.getFormatterConfig()).toEqual({
      prettier: {
        disabled: false,
        futureField: 'keep-me',
        nestedUnknown: { deep: true },
      },
    });
  });

  it('formatter update exact-write removes entries not in the new value while keeping unknown fields on surviving entries', async () => {
    await manager.updateFormatterConfig({
      prettier: { disabled: true, futureField: 'keep' },
      biome: { command: ['biome', 'fmt', '$FILE'] },
    });

    await manager.updateFormatterConfig({
      prettier: { disabled: false, futureField: 'keep' },
    });

    expect(await manager.getFormatterConfig()).toEqual({
      prettier: { disabled: false, futureField: 'keep' },
    });
  });

  it('formatter update writes boolean false while preserving other top-level config', async () => {
    await manager.write({
      provider: { demo: { name: 'Demo' } },
      formatter: { prettier: { disabled: true } },
    });

    await manager.updateFormatterConfig(false);

    const config = await manager.read();
    expect(config.formatter).toBe(false);
    expect(config.provider?.demo?.name).toBe('Demo');
  });
});
