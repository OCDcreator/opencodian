import {
  createService,
  GITEA_INDEX_URL,
  GITHUB_INDEX_URL,
  githubRequest,
  PLUGIN_DIR,
  releaseAssetUrl,
  releasePackage,
  response,
  text,
} from './pluginUpdateTestUtils';

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

});
