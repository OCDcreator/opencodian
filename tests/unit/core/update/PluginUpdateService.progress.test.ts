import type { RequestUrlResponse } from 'obsidian';

import {
  binary,
  createService,
  deferred,
  githubRequest,
  PLUGIN_DIR,
  releaseAssetUrl,
  releasePackage,
  response,
  text,
} from './pluginUpdateTestUtils';

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
