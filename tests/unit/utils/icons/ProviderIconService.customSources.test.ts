/**
 * ProviderIconService custom source unit tests
 */

import * as fs from 'fs';

jest.mock('obsidian');
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn(),
  },
}));

type MockAdapter = {
  exists: jest.Mock<Promise<boolean>, [string]>;
  readBinary: jest.Mock<Promise<ArrayBuffer>, [string]>;
  writeBinary: jest.Mock<Promise<void>, [string, ArrayBuffer]>;
  mkdir: jest.Mock<Promise<void>, [string]>;
  list: jest.Mock<Promise<{ files: string[]; folders: string[] }>, [string]>;
  remove: jest.Mock<Promise<void>, [string]>;
  getResourcePath: jest.Mock<string, [string]>;
};

function createMockApp(adapter: MockAdapter) {
  return {
    vault: {
      adapter,
      configDir: '.obsidian',
    },
  };
}

function createMockAdapter(): MockAdapter {
  return {
    exists: jest.fn().mockResolvedValue(false),
    readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    writeBinary: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
    remove: jest.fn().mockResolvedValue(undefined),
    getResourcePath: jest.fn((targetPath: string) => `app://${targetPath}`),
  };
}

function registerCustomSourceTests(): void {
  it('uses custom preview fallback during cache inspection without refetching', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const { requestUrl } = jest.requireMock('obsidian') as { requestUrl: jest.Mock };
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const state = await ProviderIconService.getProviderCacheState(app as never, ['proxy-provider'], {
      'proxy-provider': [
        {
          id: 'custom-1',
          type: 'url',
          source: 'https://example.com/proxy.svg',
          mimeType: 'image/svg+xml',
          addedAt: 1,
        },
      ],
    });

    expect(requestUrl).not.toHaveBeenCalled();
    expect(adapter.writeBinary).not.toHaveBeenCalled();
    expect(state.providers[0].entries[0]).toMatchObject({
      cachePath: null,
      cached: false,
      iconUrl: 'https://example.com/proxy.svg',
      resolvedFormat: 'svg',
    });
  });

  it('adds a custom URL icon source and caches it', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const { requestUrl } = jest.requireMock('obsidian') as { requestUrl: jest.Mock };
    requestUrl.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/png' },
      arrayBuffer: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer,
    });
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const nextLibrary = await ProviderIconService.addCustomIconSource(
      app as never,
      'proxy-provider',
      'https://example.com/proxy.png',
      {},
    );

    expect(requestUrl).toHaveBeenCalledWith({
      method: 'GET',
      throw: false,
      url: 'https://example.com/proxy.png',
    });
    expect(nextLibrary['proxy-provider']).toHaveLength(1);
    expect(nextLibrary['proxy-provider'][0]).toMatchObject({
      type: 'url',
      source: 'https://example.com/proxy.png',
      mimeType: 'image/png',
    });
    expect(adapter.writeBinary).toHaveBeenCalledWith(
      expect.stringContaining('.opencodian/provider-icons/proxy-provider-'),
      expect.anything(),
    );
  });

  it('supports quoted Windows local paths for custom icons', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const { promises } = jest.requireMock('fs') as {
      promises: { stat: jest.Mock; readFile: jest.Mock };
    };
    promises.stat.mockResolvedValue({
      isFile: () => true,
      size: 128,
    } as fs.Stats);
    promises.readFile.mockResolvedValue(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf-8'));
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const nextLibrary = await ProviderIconService.addCustomIconSource(
      app as never,
      'codexzh',
      '"C:\\Users\\lt\\Downloads\\codex.svg"',
      {},
    );

    expect(promises.stat).toHaveBeenCalledWith('C:\\Users\\lt\\Downloads\\codex.svg');
    expect(promises.readFile).toHaveBeenCalledWith('C:\\Users\\lt\\Downloads\\codex.svg');
    expect(nextLibrary.codexzh?.[0]).toMatchObject({
      type: 'file',
      source: 'C:\\Users\\lt\\Downloads\\codex.svg',
      mimeType: 'image/svg+xml',
    });
  });

  it('splits batch custom icon input across spaces commas and new lines', async () => {
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const sources = ProviderIconService.splitCustomIconSourcesInput(
      'https://example.com/a.png https://example.com/b.png,\nhttps://example.com/c.png',
    );

    expect(sources).toEqual([
      'https://example.com/a.png',
      'https://example.com/b.png',
      'https://example.com/c.png',
    ]);
  });

  it('keeps local paths with spaces intact when splitting batch input', async () => {
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const sources = ProviderIconService.splitCustomIconSourcesInput(
      'C:\\Users\\lt\\My Icons\\codex.svg, C:\\Users\\lt\\More Icons\\openai.svg',
    );

    expect(sources).toEqual([
      'C:\\Users\\lt\\My Icons\\codex.svg',
      'C:\\Users\\lt\\More Icons\\openai.svg',
    ]);
  });

  it('does not split a single URL just because it contains commas', async () => {
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const sources = ProviderIconService.splitCustomIconSourcesInput(
      'https://example.com/icons/a,b.svg',
    );

    expect(sources).toEqual(['https://example.com/icons/a,b.svg']);
  });

  it('validates local file custom sources defensively', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const { promises } = jest.requireMock('fs') as {
      promises: { stat: jest.Mock; readFile: jest.Mock };
    };
    promises.stat.mockResolvedValue({
      isFile: () => true,
      size: 2 * 1024 * 1024,
    } as fs.Stats);
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    await expect(
      ProviderIconService.addCustomIconSource(
        app as never,
        'proxy-provider',
        'C:\\icons\\too-large.png',
        {},
      ),
    ).rejects.toThrow('The icon file is too large');
  });
}

describe('ProviderIconService custom sources', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  registerCustomSourceTests();
});
