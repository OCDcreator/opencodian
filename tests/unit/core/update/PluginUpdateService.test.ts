import type { App, DataAdapter, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { PluginUpdateService } from '../../../../src/core/update/PluginUpdateService';

Object.assign(globalThis, { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder });

const encoder = new NodeTextEncoder();
const decoder = new NodeTextDecoder();
const PLUGIN_DIR = '.obsidian/plugins/opencodian';

function binary(value: string): ArrayBuffer {
  return encoder.encode(value).buffer;
}

function text(value: ArrayBuffer): string {
  return decoder.decode(value);
}

function manifest(version: string, minAppVersion = '1.4.5'): string {
  return JSON.stringify({
    id: 'opencodian',
    name: 'OpenCodian',
    version,
    minAppVersion,
  });
}

function response(
  status: number,
  body: unknown = null,
  buffer: ArrayBuffer = binary(typeof body === 'string' ? body : JSON.stringify(body)),
): RequestUrlResponse {
  return {
    status,
    headers: {},
    json: body,
    text: typeof body === 'string' ? body : JSON.stringify(body),
    arrayBuffer: buffer,
  };
}

class MemoryAdapter {
  readonly files = new Map<string, ArrayBuffer>();
  readonly folders = new Set<string>(['.obsidian', '.obsidian/plugins', PLUGIN_DIR]);
  failWritePath: string | null = null;

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const value = this.files.get(path);
    if (!value) throw new Error(`Missing ${path}`);
    return value.slice(0);
  }

  async read(path: string): Promise<string> {
    return text(await this.readBinary(path));
  }

  async writeBinary(path: string, value: ArrayBuffer): Promise<void> {
    if (this.failWritePath === path) {
      this.failWritePath = null;
      throw new Error(`Write failed for ${path}`);
    }
    this.files.set(path, value.slice(0));
  }

  async write(path: string, value: string): Promise<void> {
    await this.writeBinary(path, binary(value));
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    const prefix = `${path}/`;
    const folders = [...this.folders].filter((folder) => {
      if (!folder.startsWith(prefix)) return false;
      return !folder.slice(prefix.length).includes('/');
    });
    const files = [...this.files.keys()].filter((file) => {
      if (!file.startsWith(prefix)) return false;
      return !file.slice(prefix.length).includes('/');
    });
    return { files, folders };
  }

  async rmdir(path: string): Promise<void> {
    const prefix = `${path}/`;
    for (const file of [...this.files.keys()]) {
      if (file === path || file.startsWith(prefix)) this.files.delete(file);
    }
    for (const folder of [...this.folders]) {
      if (folder === path || folder.startsWith(prefix)) this.folders.delete(folder);
    }
  }

  seedPackage(version: string, marker: string): void {
    this.files.set(`${PLUGIN_DIR}/main.js`, binary(`main-${marker}`));
    this.files.set(`${PLUGIN_DIR}/manifest.json`, binary(manifest(version)));
    this.files.set(`${PLUGIN_DIR}/styles.css`, binary(`styles-${marker}`));
  }
}

function release(version: string, source = 'github') {
  const base = `https://downloads.example/${source}/${version}`;
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    published_at: '2026-07-27T00:00:00Z',
    html_url: `https://example.test/${source}/${version}`,
    assets: [
      { name: 'main.js', browser_download_url: `${base}/main.js` },
      { name: 'manifest.json', browser_download_url: `${base}/manifest.json` },
      { name: 'styles.css', browser_download_url: `${base}/styles.css` },
    ],
  };
}

function createService(options: {
  adapter?: MemoryAdapter;
  request: (request: RequestUrlParam | string) => Promise<RequestUrlResponse>;
  supported?: (version: string) => boolean;
  now?: () => number;
}): { service: PluginUpdateService; adapter: MemoryAdapter; persist: jest.Mock } {
  const adapter = options.adapter ?? new MemoryAdapter();
  adapter.seedPackage('1.0.0', 'old');
  const persist = jest.fn().mockResolvedValue(undefined);
  const service = new PluginUpdateService({
    app: {
      vault: {
        configDir: '.obsidian',
        adapter: adapter as unknown as DataAdapter,
      },
    } as App,
    manifest: {
      id: 'opencodian',
      version: '1.0.0',
      dir: PLUGIN_DIR,
    } as never,
    request: options.request,
    isApiVersionSupported: options.supported ?? (() => true),
    persistState: persist,
    now: options.now ?? (() => 1000),
  });
  return { service, adapter, persist };
}

function githubRequest(releases: unknown[], extra: Record<string, RequestUrlResponse> = {}) {
  return jest.fn(async (input: RequestUrlParam | string) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('api.github.com')) return response(200, releases);
    const matched = extra[url];
    if (matched) return matched;
    throw new Error(`Unexpected URL ${url}`);
  });
}

describe('PluginUpdateService', () => {
  it('lists only stable releases from GitHub, validates manifests, and persists check metadata', async () => {
    const stable = release('1.2.0');
    const prerelease = { ...release('1.3.0'), prerelease: true };
    const request = githubRequest([stable, prerelease], {
      'https://downloads.example/github/1.2.0/manifest.json': response(200, manifest('1.2.0'), binary(manifest('1.2.0'))),
    });
    const { service, persist } = createService({ request });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.status).toBe('ready');
    expect(snapshot.source).toBe('github');
    expect(snapshot.releases.map((entry) => entry.version)).toEqual(['1.2.0']);
    expect(snapshot.latestRelease).toMatchObject({ version: '1.2.0', compatible: true, installable: true });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      lastCheckAt: 1000,
      latestStableVersion: '1.2.0',
      lastSource: 'github',
    }));
  });

  it('uses Gitea only when the GitHub release service is unavailable', async () => {
    const gitea = release('1.1.0', 'gitea');
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('api.github.com')) throw new Error('offline');
      if (url.includes('gitea.ltreen.tech/api')) return response(200, [gitea]);
      if (url.endsWith('/manifest.json')) return response(200, manifest('1.1.0'), binary(manifest('1.1.0')));
      throw new Error(`Unexpected URL ${url}`);
    });
    let clock = 1000;
    const { service } = createService({ request, now: () => clock++ });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.status).toBe('ready');
    expect(snapshot.source).toBe('gitea');
    expect(snapshot.latestRelease?.version).toBe('1.1.0');
  });

  it('paginates the complete stable release history before sorting it', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...release(`0.0.${index}`),
      prerelease: true,
    }));
    const latest = release('2.0.0');
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('api.github.com') && url.endsWith('page=1')) return response(200, firstPage);
      if (url.includes('api.github.com') && url.endsWith('page=2')) return response(200, [latest]);
      if (url.endsWith('/manifest.json')) return response(200, manifest('2.0.0'), binary(manifest('2.0.0')));
      throw new Error(`Unexpected URL ${url}`);
    });
    const { service } = createService({ request });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.releases.map((entry) => entry.version)).toEqual(['2.0.0']);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('page=2') }));
  });

  it('treats a GitHub rate-limit response as unavailable and falls back to Gitea', async () => {
    const gitea = release('1.1.0', 'gitea');
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('api.github.com')) return { ...response(403), headers: { 'x-ratelimit-remaining': '0' } };
      if (url.includes('gitea.ltreen.tech/api')) return response(200, [gitea]);
      if (url.endsWith('/manifest.json')) return response(200, manifest('1.1.0'), binary(manifest('1.1.0')));
      throw new Error(`Unexpected URL ${url}`);
    });
    const { service } = createService({ request });

    await expect(service.checkForUpdates()).resolves.toMatchObject({ source: 'gitea', status: 'ready' });
  });

  it('does not fall back to Gitea when GitHub responds with an integrity failure', async () => {
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('api.github.com')) return response(403, { message: 'forbidden' });
      throw new Error(`Gitea must not be requested: ${url}`);
    });
    const { service } = createService({ request });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.status).toBe('error');
    expect(snapshot.error).toContain('github release service returned 403');
    expect(request.mock.calls.some(([input]) => (typeof input === 'string' ? input : input.url).includes('gitea'))).toBe(false);
  });

  it('shows incompatible versions but refuses to install them', async () => {
    const stable = release('1.1.0');
    const request = githubRequest([stable], {
      'https://downloads.example/github/1.1.0/manifest.json': response(200, manifest('1.1.0', '9.0.0'), binary(manifest('1.1.0', '9.0.0'))),
    });
    const { service } = createService({ request, supported: () => false });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.releases[0]).toMatchObject({ compatible: false, installable: false, minAppVersion: '9.0.0' });
    await expect(service.installLatestStable()).rejects.toThrow('Requires Obsidian 9.0.0');
  });

  it('shows malformed or incomplete releases as unavailable without switching sources', async () => {
    const malformed = release('1.2.0');
    malformed.assets = malformed.assets.filter((asset) => asset.name !== 'styles.css');
    const invalidMinimum = release('1.1.0');
    const request = githubRequest([malformed, invalidMinimum], {
      'https://downloads.example/github/1.1.0/manifest.json': response(
        200,
        manifest('1.1.0', 'not-a-version'),
        binary(manifest('1.1.0', 'not-a-version')),
      ),
    });
    const { service } = createService({ request });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.source).toBe('github');
    expect(snapshot.releases).toEqual(expect.arrayContaining([
      expect.objectContaining({ version: '1.2.0', installable: false }),
      expect.objectContaining({ version: '1.1.0', installable: false }),
    ]));
    await expect(service.installRelease('1.2.0')).rejects.toThrow('missing one or more required plugin assets');
  });

  it('stages every release asset before taking a backup or touching the installed package', async () => {
    const stable = release('1.1.0');
    const request = githubRequest([stable], {
      'https://downloads.example/github/1.1.0/manifest.json': response(200, manifest('1.1.0'), binary(manifest('1.1.0'))),
      'https://downloads.example/github/1.1.0/main.js': response(200, 'main-new', binary('main-new')),
      'https://downloads.example/github/1.1.0/styles.css': response(503),
    });
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installLatestStable()).rejects.toThrow('styles.css download returned 503');

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/manifest.json`)!)).toContain('"1.0.0"');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/styles.css`)!)).toBe('styles-old');
    expect(service.getSnapshot().backups).toEqual([]);
  });

  it('serializes concurrent version changes', async () => {
    const stable = release('1.1.0');
    let resolveMainDownload: ((value: RequestUrlResponse) => void) | undefined;
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('api.github.com')) return response(200, [stable]);
      if (url.endsWith('/manifest.json')) return response(200, manifest('1.1.0'), binary(manifest('1.1.0')));
      if (url.endsWith('/main.js')) {
        return new Promise<RequestUrlResponse>((resolve) => { resolveMainDownload = resolve; });
      }
      if (url.endsWith('/styles.css')) return response(200, 'styles-new', binary('styles-new'));
      throw new Error(`Unexpected URL ${url}`);
    });
    const { service } = createService({ request });
    await service.checkForUpdates();

    const firstInstall = service.installLatestStable();
    await Promise.resolve();
    await expect(service.installRelease('1.1.0')).rejects.toThrow('already in progress');

    resolveMainDownload?.(response(200, 'main-new', binary('main-new')));
    await expect(firstInstall).resolves.toMatchObject({ installedVersion: '1.1.0' });
  });

  it('backs up the current package before install, retains a restorable local backup, and restores it', async () => {
    const stable = release('1.1.0');
    const request = githubRequest([stable], {
      'https://downloads.example/github/1.1.0/manifest.json': response(200, manifest('1.1.0'), binary(manifest('1.1.0'))),
      'https://downloads.example/github/1.1.0/main.js': response(200, 'main-new', binary('main-new')),
      'https://downloads.example/github/1.1.0/styles.css': response(200, 'styles-new', binary('styles-new')),
    });
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installLatestStable()).resolves.toMatchObject({ previousVersion: '1.0.0', installedVersion: '1.1.0' });
    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-new');
    const backup = service.getSnapshot().backups[0];
    expect(backup).toMatchObject({ version: '1.0.0', installable: true });

    await expect(service.restoreBackup(backup!.id)).resolves.toMatchObject({ installedVersion: '1.0.0', source: 'backup' });
    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
  });

  it('keeps only the three newest complete local backups', async () => {
    const stable = release('1.1.0');
    const request = githubRequest([stable], {
      'https://downloads.example/github/1.1.0/manifest.json': response(200, manifest('1.1.0'), binary(manifest('1.1.0'))),
      'https://downloads.example/github/1.1.0/main.js': response(200, 'main-new', binary('main-new')),
      'https://downloads.example/github/1.1.0/styles.css': response(200, 'styles-new', binary('styles-new')),
    });
    let clock = 1000;
    const { service } = createService({ request, now: () => clock++ });
    await service.checkForUpdates();

    await service.installLatestStable();
    await service.restoreBackup(service.getSnapshot().backups[0]!.id);
    await service.installLatestStable();
    await service.restoreBackup(service.getSnapshot().backups[0]!.id);

    expect(service.getSnapshot().backups).toHaveLength(3);
  });

  it('restores the original package when a target write fails', async () => {
    const stable = release('1.1.0');
    const request = githubRequest([stable], {
      'https://downloads.example/github/1.1.0/manifest.json': response(200, manifest('1.1.0'), binary(manifest('1.1.0'))),
      'https://downloads.example/github/1.1.0/main.js': response(200, 'main-new', binary('main-new')),
      'https://downloads.example/github/1.1.0/styles.css': response(200, 'styles-new', binary('styles-new')),
    });
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();
    adapter.failWritePath = `${PLUGIN_DIR}/manifest.json`;

    await expect(service.installLatestStable()).rejects.toThrow('Write failed');

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/manifest.json`)!)).toContain('"1.0.0"');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/styles.css`)!)).toBe('styles-old');
  });
});
