import type { RequestUrlResponse } from 'obsidian';

import {
  binary,
  createService,
  GITHUB_INDEX_URL,
  githubRequest,
  manifest,
  PLUGIN_DIR,
  releasePackage,
  response,
  text,
} from './pluginUpdateTestUtils';

describe('PluginUpdateService install', () => {
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
