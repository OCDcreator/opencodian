import type { App, DataAdapter, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { PluginUpdateService } from '../../../../src/core/update/PluginUpdateService';

Object.assign(globalThis, { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder });

const encoder = new NodeTextEncoder();
const decoder = new NodeTextDecoder();
const PLUGIN_DIR = '.obsidian/plugins/opencodian';
const GITHUB_INDEX_URL = 'https://raw.githubusercontent.com/OCDcreator/opencodian/main/versions.json';
const GITEA_INDEX_URL = 'https://gitea.ltreen.tech/OCDcreator/opencodian/raw/branch/main/versions.json';

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

function releaseAssetUrl(version: string, assetName: string, source = 'github'): string {
  const baseUrl = source === 'github'
    ? 'https://github.com/OCDcreator/opencodian'
    : 'https://gitea.ltreen.tech/OCDcreator/opencodian';
  return `${baseUrl}/releases/download/v${version}/${assetName}`;
}

function releasePackage(
  version: string,
  options: { source?: string; minAppVersion?: string; main?: RequestUrlResponse; styles?: RequestUrlResponse } = {},
): Record<string, RequestUrlResponse> {
  const source = options.source ?? 'github';
  const minimum = options.minAppVersion ?? '1.4.5';
  return {
    [releaseAssetUrl(version, 'manifest.json', source)]: response(200, manifest(version, minimum), binary(manifest(version, minimum))),
    [releaseAssetUrl(version, 'main.js', source)]: options.main ?? response(200, 'main-new', binary('main-new')),
    [releaseAssetUrl(version, 'styles.css', source)]: options.styles ?? response(200, 'styles-new', binary('styles-new')),
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

function githubRequest(index: Record<string, string>, extra: Record<string, RequestUrlResponse> = {}) {
  return jest.fn(async (input: RequestUrlParam | string) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === GITHUB_INDEX_URL) return response(200, index);
    const matched = extra[url];
    if (matched) return matched;
    throw new Error(`Unexpected URL ${url}`);
  });
}

describe('PluginUpdateService', () => {
  it('lists and sorts stable versions from one static GitHub index request', async () => {
    const request = githubRequest({ '1.1.0': '1.4.5', '1.2.0': '1.5.0' });
    const { service, persist } = createService({ request });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.status).toBe('ready');
    expect(snapshot.source).toBe('github');
    expect(snapshot.releases.map((entry) => entry.version)).toEqual(['1.2.0', '1.1.0']);
    expect(snapshot.latestRelease).toMatchObject({ version: '1.2.0', minAppVersion: '1.5.0', compatible: true, installable: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: GITHUB_INDEX_URL }));
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      lastCheckAt: 1000,
      latestStableVersion: '1.2.0',
      lastSource: 'github',
    }));
  });

  it('uses Gitea only when the GitHub version index is unavailable', async () => {
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === GITHUB_INDEX_URL) throw new Error('offline');
      if (url === GITEA_INDEX_URL) return response(200, { '1.1.0': '1.4.5' });
      throw new Error(`Unexpected URL ${url}`);
    });
    const { service } = createService({ request });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.status).toBe('ready');
    expect(snapshot.source).toBe('gitea');
    expect(snapshot.latestRelease?.version).toBe('1.1.0');
  });

  it('treats a static-index 429 response as unavailable and falls back to Gitea', async () => {
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === GITHUB_INDEX_URL) return response(429);
      if (url === GITEA_INDEX_URL) return response(200, { '1.1.0': '1.4.5' });
      throw new Error(`Unexpected URL ${url}`);
    });
    const { service } = createService({ request });

    await expect(service.checkForUpdates()).resolves.toMatchObject({ source: 'gitea', status: 'ready' });
  });

  it('does not fall back to Gitea when the reachable GitHub index returns an ordinary 404', async () => {
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === GITHUB_INDEX_URL) return response(404);
      throw new Error(`Gitea must not be requested: ${url}`);
    });
    const { service } = createService({ request });

    const snapshot = await service.checkForUpdates();

    expect(snapshot).toMatchObject({ status: 'error', error: 'github versions.json returned 404.' });
    expect(request.mock.calls.some(([input]) => (typeof input === 'string' ? input : input.url) === GITEA_INDEX_URL)).toBe(false);
  });

  it('does not fall back to Gitea when GitHub returns an invalid static index', async () => {
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === GITHUB_INDEX_URL) return response(200, { '1.1.0': 'not-a-version' });
      throw new Error(`Gitea must not be requested: ${url}`);
    });
    const { service } = createService({ request });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.status).toBe('error');
    expect(snapshot.error).toContain('versions.json has an invalid minimum version');
    expect(request.mock.calls.some(([input]) => (typeof input === 'string' ? input : input.url) === GITEA_INDEX_URL)).toBe(false);
  });

  it('shows incompatible versions from the standard index but refuses to install them', async () => {
    const request = githubRequest({ '1.1.0': '9.0.0' });
    const { service } = createService({ request, supported: () => false });

    const snapshot = await service.checkForUpdates();

    expect(snapshot.releases[0]).toMatchObject({ compatible: false, installable: false, minAppVersion: '9.0.0' });
    await expect(service.installLatestStable()).rejects.toThrow('Requires Obsidian 9.0.0');
  });

  it('stages every fixed release asset before taking a backup or touching the installed package', async () => {
    const request = githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0', {
      styles: response(503),
    }));
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installLatestStable()).rejects.toThrow('styles.css download returned 503');

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/manifest.json`)!)).toContain('"1.0.0"');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/styles.css`)!)).toBe('styles-old');
    expect(service.getSnapshot().backups).toEqual([]);
  });

  it('rejects a downloaded manifest whose minimum version conflicts with the version index', async () => {
    const request = githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0', { minAppVersion: '9.0.0' }));
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installLatestStable()).rejects.toThrow('minimum version does not match versions.json');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    expect(service.getSnapshot().backups).toEqual([]);
  });

  it('keeps Gitea as the sole asset source after an unavailable GitHub index falls back', async () => {
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === GITHUB_INDEX_URL) throw new Error('offline');
      if (url === GITEA_INDEX_URL) return response(200, { '1.1.0': '1.4.5' });
      const packageResponse = releasePackage('1.1.0', { source: 'gitea' })[url];
      if (packageResponse) return packageResponse;
      throw new Error(`Unexpected URL ${url}`);
    });
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installLatestStable()).resolves.toMatchObject({ installedVersion: '1.1.0', source: 'gitea' });

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-new');
    expect(request.mock.calls.every(([input]) => {
      const url = typeof input === 'string' ? input : input.url;
      return !url.includes('github.com/OCDcreator/opencodian/releases/download/');
    })).toBe(true);
    expect(request.mock.calls.some(([input]) => {
      const url = typeof input === 'string' ? input : input.url;
      return url === releaseAssetUrl('1.1.0', 'main.js', 'gitea');
    })).toBe(true);
  });

  it('serializes concurrent version changes', async () => {
    let resolveMainDownload: ((value: RequestUrlResponse) => void) | undefined;
    const request = jest.fn(async (input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === GITHUB_INDEX_URL) return response(200, { '1.1.0': '1.4.5' });
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
    const request = githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0'));
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
    const request = githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0'));
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
    const request = githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0'));
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();
    adapter.failWritePath = `${PLUGIN_DIR}/manifest.json`;

    await expect(service.installLatestStable()).rejects.toThrow('Write failed');

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/manifest.json`)!)).toContain('"1.0.0"');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/styles.css`)!)).toBe('styles-old');
  });
});
