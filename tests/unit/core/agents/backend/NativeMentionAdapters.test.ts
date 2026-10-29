import path from 'node:path';

import { CodexAdapter } from '../../../../../src/core/agents/backend/codex/CodexAdapter';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import { PiAdapter } from '../../../../../src/core/agents/backend/pi/PiAdapter';
import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { NativePromptMention } from '../../../../../src/core/types/chat';
import { FakeDshClient, settings } from './DshAdapter.fixture';

describe('backend native mention boundaries', () => {
  it('admits only installed enabled Codex plugins and sends explicit native mention input', async () => {
    const adapter = new CodexAdapter({ workingDirectory: '/vault' });
    const listInstalledPlugins = jest.fn(async () => ({ marketplaces: [{ name: 'local', plugins: [
      { id: 'ready@local', name: 'Ready', installed: true, enabled: true, availability: 'AVAILABLE' },
      { id: 'disabled@local', name: 'Disabled', installed: true, enabled: false },
      { id: 'missing@local', name: 'Missing', installed: false, enabled: true },
      { id: 'policy@local', name: 'Policy', installed: true, enabled: true, disabledReason: 'disabled_by_admin' },
    ] }] }));
    Object.assign(adapter, { appServerClient: { listInstalledPlugins } });
    const candidates = await adapter.getRuntimeMentionCandidates();
    expect(candidates).toEqual([{ kind: 'plugin', backend: 'codex', id: 'ready@local', label: 'Ready',
      nativePath: 'plugin://ready@local', description: 'local' }]);
    expect(listInstalledPlugins).toHaveBeenCalledWith({ cwds: ['/vault'] });
    const build = adapter as unknown as {
      buildAppServerInput(content: string, images: undefined, mentions: NativePromptMention[]): Promise<{ payload: unknown[] }>;
    };
    await expect(build.buildAppServerInput('Use plugin', undefined, candidates)).resolves.toEqual({ payload: [
      { type: 'text', text: 'Use plugin', text_elements: [] },
      { type: 'mention', name: 'Ready', path: 'plugin://ready@local' },
    ] });
    await expect(build.buildAppServerInput('Use plugin', undefined,
      [{ ...candidates[0], backend: 'zcode' }])).rejects.toThrow('no longer available');
    listInstalledPlugins.mockResolvedValue({ marketplaces: [{ name: 'local', plugins: [] }] });
    await expect(build.buildAppServerInput('Use plugin', undefined, candidates)).rejects.toThrow('no longer available');
  });

  it('uses the ZCode session catalog and hides disabled or conflicting plugin identities', async () => {
    const adapter = new ZCodeAdapter({ workingDirectory: '/vault' });
    jest.spyOn(adapter, 'start').mockResolvedValue();
    const request = jest.fn(async () => ({ authority: 'session', plugins: [
      { pluginId: 'ready@market', name: 'Ready', enabled: true, conflictingPluginIds: [] },
      { pluginId: 'disabled@market', name: 'Disabled', enabled: false, conflictingPluginIds: [] },
      { pluginId: 'conflict@market', name: 'Conflict', enabled: true, conflictingPluginIds: ['another'] },
    ] }));
    Object.assign(adapter, { transport: { request }, ensureSessionActive: jest.fn(async () => {}) });
    await expect(adapter.getRuntimeMentionCandidates('session-a')).resolves.toEqual([
      { kind: 'plugin', backend: 'zcode', id: 'ready@market', label: 'Ready', nativePath: 'plugin://ready@market' },
    ]);
    expect(request).toHaveBeenCalledWith('plugins/referenceCatalog', {
      workspace: { workspacePath: path.resolve('/vault'), workspaceKey: path.resolve('/vault').replace(/\\/g, '/') }, sessionId: 'session-a',
    });
  });

  it('distinguishes an unavailable Codex native read from an empty source without activating it', async () => {
    const adapter = new CodexAdapter({ workingDirectory: '/vault' });
    await expect(adapter.getPromptReferenceMessages('source')).resolves.toBeNull();
    const readThread = jest.fn(async () => ({ id: 'source', turns: [] }));
    Object.assign(adapter, { appServerClient: { readThread } });
    await expect(adapter.getPromptReferenceMessages('source')).resolves.toEqual([]);
    expect(readThread).toHaveBeenCalledWith('source', true);
    readThread.mockResolvedValue({ id: 'wrong', turns: [] });
    await expect(adapter.getPromptReferenceMessages('source')).resolves.toBeNull();
    readThread.mockRejectedValue(new Error('offline'));
    await expect(adapter.getPromptReferenceMessages('source')).resolves.toBeNull();
  });

  it('reads only an already resident ZCode source without activation', async () => {
    const adapter = new ZCodeAdapter({ workingDirectory: '/vault' });
    const start = jest.spyOn(adapter, 'start');
    await expect(adapter.getPromptReferenceMessages('source')).resolves.toBeNull();
    expect(start).not.toHaveBeenCalled();
    const messages = [{ info: { role: 'user', id: 'u' }, parts: [{ type: 'text', text: 'native source' }] }];
    const request = jest.fn(async () => ({ messages }));
    Object.assign(adapter, { transport: { request } });
    await expect(adapter.getPromptReferenceMessages('source')).resolves.toEqual(messages);
    expect(request.mock.calls).toEqual([['session/messages', { sessionId: 'source' }]]);
    request.mockRejectedValue(new Error('not resident'));
    await expect(adapter.getPromptReferenceMessages('inactive')).resolves.toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it('reads Pi history from an existing connection without creating a service or switching sessions', async () => {
    const adapter = new PiAdapter({ workingDirectory: '/vault' });
    const request = jest.fn(async () => ({ entries: [{ role: 'user', content: 'native branch' }] }));
    const getExisting = jest.fn(async () => ({ request }));
    const get = jest.fn(() => { throw new Error('source activation forbidden'); });
    Object.assign(adapter, { runtime: { getExisting, get } });
    await expect(adapter.getPromptReferenceMessages('source')).resolves.toEqual([{ role: 'user', content: 'native branch' }]);
    expect(request.mock.calls).toEqual([[{ type: 'get_messages' }, 30000]]);
    expect(getExisting).toHaveBeenCalledWith('source');
    expect(get).not.toHaveBeenCalled();
    getExisting.mockResolvedValue(null as never);
    await expect(adapter.getPromptReferenceMessages('inactive')).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('accepts only an exact DSH resolver proof and never resumes the referenced session', async () => {
    const reference = `dsh-session:${Buffer.from(JSON.stringify('source')).toString('base64url')}`;
    let proof: Record<string, unknown> = { available: true, reference };
    const nativeRequest = jest.fn(async () => proof);
    let client: FakeDshClient | undefined;
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: settings,
      createClient: options => Object.assign(client = new FakeDshClient(options), { nativeRequest }) });
    try {
      await expect(adapter.prepareNativeSessionReference('source', 'target')).resolves.toBe(reference);
      expect(nativeRequest).toHaveBeenCalledWith('session/reference', {
        sourceSessionId: 'source', targetSessionId: 'target', cwd: '/vault',
      });
      expect(client?.calls.some(call => call.method === 'session/resume')).toBe(false);
      proof = { available: true, reference: 'dsh-session:wrong' };
      await expect(adapter.prepareNativeSessionReference('source', 'target')).resolves.toBeNull();
      proof = { available: false };
      await expect(adapter.prepareNativeSessionReference('source', 'target')).resolves.toBeNull();
      await expect(adapter.prepareNativeSessionReference('source')).resolves.toBeNull();
    } finally { await adapter.stop(); }
  });

  it('keeps DSH ACP on the owned-history fallback path', async () => {
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: settings,
      createClient: options => new FakeDshClient(options) });
    try { await expect(adapter.prepareNativeSessionReference('source', 'target')).resolves.toBeNull(); }
    finally { await adapter.stop(); }
  });
});
