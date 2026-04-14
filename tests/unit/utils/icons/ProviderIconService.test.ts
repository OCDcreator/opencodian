/**
 * ProviderIconService unit tests
 */

import * as fs from 'fs';

import { normalizeProviderIconLibrary, type ProviderIconLibrary } from '../../../../src/core/types';

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

function toArrayBuffer(text: string): ArrayBuffer {
  const buffer = Buffer.from(text, 'utf-8');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe('ProviderIconService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('reads a mapped icon from the local cache before hitting the network', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockResolvedValue(true);
    adapter.readBinary.mockResolvedValue(toArrayBuffer('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    const app = createMockApp(adapter);
    const { requestUrl } = jest.requireMock('obsidian') as { requestUrl: jest.Mock };
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const url = await ProviderIconService.resolveIconUrl(app as never, 'deepseek', {});

    expect(adapter.exists).toHaveBeenCalledWith('.opencodian/provider-icons/lobehub-deepseek-auto-mono-light-svg.svg');
    expect(adapter.readBinary).toHaveBeenCalledWith('.opencodian/provider-icons/lobehub-deepseek-auto-mono-light-svg.svg');
    expect(requestUrl).not.toHaveBeenCalled();
    expect(url).toContain('data:image/svg+xml');
  });

  it('fetches and caches a mapped icon when it is missing locally', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const { requestUrl } = jest.requireMock('obsidian') as { requestUrl: jest.Mock };
    requestUrl.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
      arrayBuffer: toArrayBuffer('<svg xmlns="http://www.w3.org/2000/svg"><path /></svg>'),
    });
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const url = await ProviderIconService.resolveIconUrl(app as never, 'moonshot', {});

    expect(requestUrl).toHaveBeenCalledWith({
      method: 'GET',
      throw: false,
      url: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/moonshot.svg',
    });
    expect(adapter.mkdir).toHaveBeenCalledWith('.opencodian/provider-icons');
    expect(adapter.writeBinary).toHaveBeenCalledWith(
      '.opencodian/provider-icons/lobehub-moonshot-auto-mono-light-svg.svg',
      expect.anything(),
    );
    expect(url).toContain('data:image/svg+xml');
  });

  it('uses explicit LobeHub color variants when available', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const { requestUrl } = jest.requireMock('obsidian') as { requestUrl: jest.Mock };
    requestUrl.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
      arrayBuffer: toArrayBuffer('<svg xmlns="http://www.w3.org/2000/svg"><path /></svg>'),
    });
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const url = await ProviderIconService.resolveIconUrl(app as never, 'adobe', {
      adobe: [
        {
          id: 'builtin:lobehub:adobe',
          type: 'builtin',
          source: 'lobehub:adobe',
          variant: 'color',
          addedAt: 1,
        },
      ],
    });

    expect(requestUrl).toHaveBeenCalledWith({
      method: 'GET',
      throw: false,
      url: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/adobe-color.svg',
    });
    expect(adapter.writeBinary).toHaveBeenCalledWith(
      '.opencodian/provider-icons/lobehub-adobe-color-color-light-svg.svg',
      expect.anything(),
    );
    expect(url).toContain('data:image/svg+xml');
  });

  it('falls explicit color back to mono when the manifest has no color asset', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const { requestUrl } = jest.requireMock('obsidian') as { requestUrl: jest.Mock };
    requestUrl.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
      arrayBuffer: toArrayBuffer('<svg xmlns="http://www.w3.org/2000/svg"><path /></svg>'),
    });
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    await ProviderIconService.resolveIconUrl(app as never, 'opencode', {
      opencode: [
        {
          id: 'builtin:lobehub:opencode',
          type: 'builtin',
          source: 'lobehub:opencode',
          variant: 'color',
          addedAt: 1,
        },
      ],
    });

    expect(requestUrl).toHaveBeenCalledWith({
      method: 'GET',
      throw: false,
      url: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/opencode.svg',
    });
    expect(adapter.writeBinary).toHaveBeenCalledWith(
      '.opencodian/provider-icons/lobehub-opencode-color-mono-light-svg.svg',
      expect.anything(),
    );
  });

  it('does not retry the same failed mapped fetch repeatedly in one session', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const { requestUrl } = jest.requireMock('obsidian') as { requestUrl: jest.Mock };
    requestUrl.mockRejectedValue(new Error('net::ERR_CONNECTION_CLOSED'));
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const firstAttempt = await ProviderIconService.resolveIconUrl(app as never, 'deepseek', {});
    const secondAttempt = await ProviderIconService.resolveIconUrl(app as never, 'deepseek', {});

    expect(firstAttempt).toBeNull();
    expect(secondAttempt).toBeNull();
    expect(requestUrl).toHaveBeenCalledTimes(4);
  });

  it('allows warm-up to retry a previously failed mapped icon fetch', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const { requestUrl } = jest.requireMock('obsidian') as { requestUrl: jest.Mock };
    requestUrl
      .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_CLOSED'))
      .mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
        arrayBuffer: toArrayBuffer('<svg xmlns="http://www.w3.org/2000/svg"><path /></svg>'),
      });
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    await ProviderIconService.resolveIconUrl(app as never, 'deepseek', {});
    const summary = await ProviderIconService.warmProviderIcons(app as never, ['deepseek'], {});

    expect(requestUrl).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({
      total: 1,
      supported: 1,
      cached: 1,
      failed: 0,
    });
  });

  it('persists default mapped entries for current providers', async () => {
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const nextLibrary = ProviderIconService.persistDefaultEntries(['deepseek', 'unknown-provider'], {});

    expect(nextLibrary).toEqual({
      deepseek: [
        expect.objectContaining({
          type: 'mapped',
          source: 'deepseek',
        }),
      ],
    });
  });

  it('accepts builtin provider icon entries during normalization', () => {
    const normalized = normalizeProviderIconLibrary({
      requesty: [
        {
          id: 'builtin:opencode:requesty',
          type: 'builtin',
          source: 'opencode:requesty',
          addedAt: 1,
        },
      ],
      invalid: [
        {
          id: 'bad',
          type: 'builtin',
          source: 'bad-source',
          addedAt: 1,
        },
      ],
    });

    expect(normalized.requesty?.[0]).toMatchObject({
      type: 'builtin',
      source: 'opencode:requesty',
      variant: 'auto',
    });
    expect(normalized.invalid).toBeUndefined();
  });

  it('adds a custom URL icon source and caches it', async () => {
    const adapter = createMockAdapter();
    const app = createMockApp(adapter);
    const library: ProviderIconLibrary = {};
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
      library,
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

  it('reads local cache state for current and saved-only providers', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockImplementation(async (targetPath: string) =>
      targetPath === '.opencodian/provider-icons/lobehub-deepseek-auto-mono-light-svg.svg',
    );
    adapter.readBinary.mockResolvedValue(toArrayBuffer('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    const app = createMockApp(adapter);
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const library: ProviderIconLibrary = {
      savedProvider: [
        {
          id: 'custom-1',
          type: 'url',
          source: 'https://example.com/icon.svg',
          mimeType: 'image/svg+xml',
          cacheFileName: 'savedProvider-custom.svg',
          addedAt: 1,
        },
      ],
    };

    const state = await ProviderIconService.getProviderCacheState(
      app as never,
      ['deepseek', 'unknown-provider'],
      library,
    );

    expect(state.summary.totalProviders).toBe(3);
    expect(state.providers[0].providerId).toBe('deepseek');
    expect(state.providers.find((provider) => provider.providerId === 'savedProvider')?.isCurrentProvider).toBe(false);
  });

  it('reuses cached custom icons when provider names differ only by spacing', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockResolvedValue(true);
    adapter.readBinary.mockResolvedValue(toArrayBuffer('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    const app = createMockApp(adapter);
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const library: ProviderIconLibrary = {
      codexzh: [
        {
          id: 'custom-1',
          type: 'file',
          source: 'C:\\Users\\lt\\Downloads\\codex.svg',
          mimeType: 'image/svg+xml',
          cacheFileName: 'codexzh-custom.svg',
          addedAt: 1,
        },
      ],
    };

    const iconUrl = await ProviderIconService.resolveIconUrl(app as never, 'code xzh', library);
    const state = await ProviderIconService.getProviderCacheState(app as never, ['code xzh'], library);

    expect(iconUrl).toContain('data:image/svg+xml');
    expect(adapter.exists).toHaveBeenCalledWith('.opencodian/provider-icons/codexzh-custom.svg');
    expect(state.providers).toHaveLength(1);
    expect(state.providers[0].providerId).toBe('code xzh');
    expect(state.providers[0].entries[0].cached).toBe(true);
  });

  it('loads a bundled OpenCode builtin icon and caches it locally', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockImplementation(async (targetPath: string) =>
      targetPath === '.obsidian/plugins/opencodian/assets/provider-icons/opencode/requesty.svg',
    );
    adapter.readBinary.mockResolvedValue(toArrayBuffer('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>'));
    const app = createMockApp(adapter);
    const { requestUrl } = jest.requireMock('obsidian') as { requestUrl: jest.Mock };
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const url = await ProviderIconService.resolveIconUrl(app as never, 'requesty', {});

    expect(adapter.readBinary).toHaveBeenCalledWith(
      '.obsidian/plugins/opencodian/assets/provider-icons/opencode/requesty.svg',
    );
    expect(adapter.writeBinary).toHaveBeenCalledWith(
      '.opencodian/provider-icons/builtin-opencode-requesty.svg',
      expect.anything(),
    );
    expect(requestUrl).not.toHaveBeenCalled();
    expect(url).toContain('data:image/svg+xml');
  });

  it('deduplicates builtin selections when the same icon is chosen repeatedly', async () => {
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const once = ProviderIconService.selectBuiltinIcon({
      providerId: 'deepseek',
      libraryId: 'lobehub',
      iconId: 'deepseek',
      library: {},
    });
    const twice = ProviderIconService.selectBuiltinIcon({
      providerId: 'deepseek',
      libraryId: 'lobehub',
      iconId: 'deepseek',
      library: once,
    });

    expect(once.deepseek).toHaveLength(1);
    expect(once.deepseek?.[0]).toMatchObject({
      type: 'builtin',
      source: 'lobehub:deepseek',
    });
    expect(twice.deepseek).toHaveLength(1);
  });

  it('clears cached files without deleting provider library metadata', async () => {
    const adapter = createMockAdapter();
    adapter.exists.mockResolvedValue(true);
    adapter.list.mockResolvedValue({
      files: [
        '.opencodian/provider-icons/deepseek.svg',
        '.opencodian/provider-icons/custom.png',
      ],
      folders: [],
    });
    const app = createMockApp(adapter);
    const { ProviderIconService } = await import('../../../../src/utils/icons/ProviderIconService');

    const removedCount = await ProviderIconService.clearCache(app as never);

    expect(adapter.remove).toHaveBeenCalledTimes(2);
    expect(removedCount).toBe(2);
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
});
