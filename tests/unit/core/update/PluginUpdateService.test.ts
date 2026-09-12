import type { App, DataAdapter, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { PluginUpdateService, type PluginUpdateSnapshot } from '../../../../src/core/update/PluginUpdateService';

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
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
    const snapshots: PluginUpdateSnapshot[] = [];
    service.onProgress((snapshot) => { snapshots.push(snapshot); });

    await expect(service.installLatestStable()).rejects.toThrow('styles.css download returned 503');

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/manifest.json`)!)).toContain('"1.0.0"');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/styles.css`)!)).toBe('styles-old');
    expect(service.getSnapshot().backups).toEqual([]);
    expect(snapshots.at(-2)?.progress).toMatchObject({ assetName: 'styles.css', completedFiles: 2 });
    expect(service.getSnapshot()).toMatchObject({
      isApplying: false, error: expect.stringContaining('503'), progress: { phase: 'failed' },
    });
    expect(snapshots.some((snapshot) => snapshot.progress?.phase === 'backing-up')).toBe(false);
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

  it('skips an advertised release whose assets are missing and installs the next installable version', async () => {
    const request = githubRequest({ '1.2.0': '1.4.5', '1.1.0': '1.4.5' }, {
      ...releasePackage('1.2.0', { main: response(404, 'Not Found') }),
      ...releasePackage('1.1.0'),
    });
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installNewestInstallable()).resolves.toMatchObject({
      previousVersion: '1.0.0',
      installedVersion: '1.1.0',
    });

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-new');
    const snapshot = service.getSnapshot();
    expect(snapshot.releases.find((release) => release.version === '1.2.0')).toMatchObject({
      installable: false,
      unavailableReason: expect.stringContaining('main.js download returned 404'),
    });
    expect(snapshot.latestRelease).toMatchObject({ version: '1.1.0' });
  });

  it('marks a version with missing assets unavailable when installed explicitly', async () => {
    const request = githubRequest({ '1.2.0': '1.4.5' }, releasePackage('1.2.0', { styles: response(404) }));
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installRelease('1.2.0')).rejects.toThrow('styles.css download returned 404');

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    expect(service.getSnapshot().releases[0]).toMatchObject({
      version: '1.2.0',
      installable: false,
      unavailableReason: expect.stringContaining('Release assets are unavailable'),
    });
    expect(service.getSnapshot().backups).toEqual([]);
  });

  it('reports every skipped version when no advertised release can be downloaded', async () => {
    const request = githubRequest({ '1.2.0': '1.4.5' }, releasePackage('1.2.0', { main: response(404, 'Not Found') }));
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installNewestInstallable()).rejects.toThrow('No plugin release could be downloaded (skipped 1.2.0)');

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
  });

  it('does not retire a version when the asset host fails transiently', async () => {
    const request = githubRequest({ '1.2.0': '1.4.5' }, releasePackage('1.2.0', { styles: response(503) }));
    const { service } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installNewestInstallable()).rejects.toThrow('styles.css download returned 503');

    expect(service.getSnapshot().releases[0]).toMatchObject({ version: '1.2.0', installable: true });
  });

  it('returns null when no checked release is newer than the installed version', async () => {
    const request = githubRequest({ '1.0.0': '1.4.5' });
    const { service } = createService({ request });
    await service.checkForUpdates();

    await expect(service.installNewestInstallable()).resolves.toBeNull();
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
    const snapshots: PluginUpdateSnapshot[] = [];
    service.onProgress((snapshot) => { snapshots.push(snapshot); });

    await expect(service.restoreBackup(backup!.id)).resolves.toMatchObject({ installedVersion: '1.0.0', source: 'backup' });
    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    expect(snapshots.map((snapshot) => snapshot.progress?.phase))
      .toEqual(['preparing', 'backing-up', 'installing', 'verifying', 'complete']);
    expect(snapshots.every((snapshot) => snapshot.progress?.version === '1.0.0')).toBe(true);
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
    const snapshots: PluginUpdateSnapshot[] = [];
    service.onProgress((snapshot) => { snapshots.push(snapshot); });
    adapter.failWritePath = `${PLUGIN_DIR}/manifest.json`;

    await expect(service.installLatestStable()).rejects.toThrow('Write failed');

    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/manifest.json`)!)).toContain('"1.0.0"');
    expect(text(adapter.files.get(`${PLUGIN_DIR}/styles.css`)!)).toBe('styles-old');
    expect(snapshots.slice(-3).map((snapshot) => snapshot.progress?.phase))
      .toEqual(['installing', 'restoring-original', 'failed']);
    expect(service.getSnapshot()).toMatchObject({
      isApplying: false, currentVersion: '1.0.0', error: expect.stringContaining('Write failed'),
      progress: { phase: 'failed', version: '1.1.0' },
    });
    await service.installLatestStable();
    expect(service.getSnapshot()).toMatchObject({ error: null, progress: { phase: 'complete' } });
  });
});

describe('PluginUpdateService progress', () => {
  it('publishes preparing immediately and reports only completed downloads through final backup refresh', async () => {
    const pendingDownload = deferred<RequestUrlResponse>();
    const startedDownload = deferred<void>();
    const baseRequest = githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0'));
    const request = jest.fn((input: RequestUrlParam | string) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === releaseAssetUrl('1.1.0', 'main.js')) {
        startedDownload.resolve(undefined);
        return pendingDownload.promise;
      }
      return baseRequest(input);
    });
    const { service, adapter } = createService({ request });
    await service.checkForUpdates();
    const snapshots: PluginUpdateSnapshot[] = [];
    service.onProgress((snapshot) => { snapshots.push(snapshot); });

    const installation = service.installLatestStable();
    expect(service.getSnapshot()).toMatchObject({
      isApplying: true, error: null, progress: { phase: 'preparing', version: '1.1.0' },
    });
    await startedDownload.promise;
    expect(service.getSnapshot().progress).toEqual({
      phase: 'downloading', version: '1.1.0', assetName: 'main.js', completedFiles: 0, totalFiles: 3,
    });
    expect(text(adapter.files.get(`${PLUGIN_DIR}/main.js`)!)).toBe('main-old');
    pendingDownload.resolve(response(200, 'main-new', binary('main-new')));
    await installation;

    expect(snapshots.map((snapshot) => snapshot.progress?.phase)).toEqual([
      'preparing', 'downloading', 'downloading', 'downloading', 'downloading',
      'downloading', 'downloading', 'backing-up', 'installing', 'verifying', 'complete',
    ]);
    expect(snapshots.filter((snapshot) => snapshot.progress?.phase === 'downloading')
      .map((snapshot) => [snapshot.progress?.assetName, snapshot.progress?.completedFiles])).toEqual([
      ['main.js', 0], ['main.js', 1], ['manifest.json', 1], ['manifest.json', 2], ['styles.css', 2], ['styles.css', 3],
    ]);
    expect(service.getSnapshot()).toMatchObject({
      isApplying: false, currentVersion: '1.1.0', progress: { phase: 'complete', version: '1.1.0' },
      backups: [expect.objectContaining({ version: '1.0.0' })],
    });
    expect(snapshots[0]?.progress?.phase).toBe('preparing');
    await service.checkForUpdates();
    expect(service.getSnapshot().progress).toBeUndefined();
    expect(service.getSnapshot().currentVersion).toBe('1.1.0');
  });

  it('isolates throwing listeners and stops notifying disposed subscriptions', async () => {
    const { service } = createService({ request: githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0')) });
    await service.checkForUpdates();
    const throwing = jest.fn(() => { throw new Error('UI failed'); });
    const disposed = jest.fn();
    const healthy = jest.fn();
    service.onProgress(throwing);
    const subscription = service.onProgress(disposed);
    service.onProgress(healthy);
    subscription.dispose();
    subscription.dispose();

    await expect(service.installLatestStable()).resolves.toMatchObject({ installedVersion: '1.1.0' });

    expect(throwing).toHaveBeenCalled();
    expect(healthy).toHaveBeenLastCalledWith(expect.objectContaining({ progress: { phase: 'complete', version: '1.1.0' } }));
    expect(disposed).not.toHaveBeenCalled();
  });

  it('locks before preparing listeners can reenter installation or checking', async () => {
    const request = githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0'));
    const { service } = createService({ request });
    await service.checkForUpdates();
    const reentrant: Array<Promise<unknown>> = [];
    service.onProgress((snapshot) => {
      if (snapshot.progress?.phase === 'preparing') {
        reentrant.push(service.installRelease('1.1.0').catch((error: unknown) => error));
        reentrant.push(service.checkForUpdates().catch((error: unknown) => error));
      }
    });

    await service.installLatestStable();

    expect(await Promise.all(reentrant)).toEqual([
      expect.objectContaining({ message: expect.stringContaining('already in progress') }),
      expect.objectContaining({ message: expect.stringContaining('already in progress') }),
    ]);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('rejects install and restore while a repeated check is pending and preserves installed version', async () => {
    const request = githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0'));
    const { service } = createService({ request });
    await service.checkForUpdates();
    await service.installLatestStable();
    const backupId = service.getSnapshot().backups[0]!.id;
    const reentrant: Array<Promise<unknown>> = [];
    const statuses: string[] = [];
    service.onProgress((snapshot) => {
      statuses.push(snapshot.status);
      reentrant.push(service.installRelease('1.1.0').catch((error: unknown) => error));
    });
    const pendingCheck = deferred<RequestUrlResponse>();
    request.mockReturnValueOnce(pendingCheck.promise);
    const check = service.checkForUpdates();

    await expect(service.installLatestStable()).rejects.toThrow('check');
    await expect(service.restoreBackup(backupId)).rejects.toThrow('check');
    expect(service.getSnapshot().status).toBe('checking');
    expect(service.getSnapshot().isApplying).toBe(false);
    pendingCheck.resolve(response(200, { '1.1.0': '1.4.5' }));
    await check;

    expect(service.getSnapshot()).toMatchObject({ status: 'ready', currentVersion: '1.1.0', isApplying: false });
    expect(statuses).toEqual(['checking', 'ready']);
    expect(await Promise.all(reentrant)).toEqual([
      expect.objectContaining({ message: expect.stringContaining('check') }),
      expect.objectContaining({ message: expect.stringContaining('check') }),
    ]);
  });

  it('keeps verifying and the operation lock until the final backup refresh completes', async () => {
    const { service, adapter } = createService({ request: githubRequest({ '1.1.0': '1.4.5' }, releasePackage('1.1.0')) });
    await service.checkForUpdates();
    const finishRefresh = deferred<void>();
    const startedRefresh = deferred<void>();
    const list = adapter.list.bind(adapter);
    let listings = 0;
    jest.spyOn(adapter, 'list').mockImplementation(async (path) => {
      listings += 1;
      if (listings === 2) {
        startedRefresh.resolve(undefined);
        await finishRefresh.promise;
      }
      return list(path);
    });

    const installation = service.installLatestStable();
    await startedRefresh.promise;
    expect(service.getSnapshot()).toMatchObject({ isApplying: true, progress: { phase: 'verifying' } });
    await expect(service.installLatestStable()).rejects.toThrow('already in progress');
    finishRefresh.resolve(undefined);
    await installation;
    expect(service.getSnapshot()).toMatchObject({ isApplying: false, progress: { phase: 'complete' } });
  });
});
