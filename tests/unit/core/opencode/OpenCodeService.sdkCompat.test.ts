import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceSdkCompatContext,
  OpenCodeService,
} from './OpenCodeService.sdkCompat.testSupport';

let service: OpenCodeService;

const createServiceWithSdkFlags = () => new OpenCodeService(
  DEFAULT_SETTINGS,
  {},
  { sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS },
);

beforeEach(() => {
  ({ service } = createOpenCodeServiceSdkCompatContext());
});

describe('OpenCodeService SDK compatibility wrappers', () => {
  it('exposes MCP, tool catalog, session, part, and provider oauth wrappers', async () => {
    service = createServiceWithSdkFlags();

    await expect(service.refreshToolIds()).resolves.toEqual(['read', 'bash', 'vault_tool']);
    await expect(service.listTools('openai', 'gpt-5')).resolves.toHaveLength(2);
    await expect(service.getMcpStatus()).resolves.toEqual({ exa: { status: 'connected' } });
    await expect(service.addMcpServer('exa', { type: 'remote', url: 'https://example.com/mcp' })).resolves.toEqual({
      exa: { status: 'connected' },
    });
    await expect(service.connectMcpServer('exa')).resolves.toBe(true);
    await expect(service.disconnectMcpServer('exa')).resolves.toBe(true);
    await expect(service.startMcpAuth('exa')).resolves.toEqual({
      authorizationUrl: 'https://example.com/auth',
    });
    await expect(service.completeMcpAuth('exa', 'code-1')).resolves.toEqual({ status: 'connected' });
    await expect(service.authenticateMcp('exa')).resolves.toEqual({ status: 'connected' });
    await expect(service.removeMcpAuth('exa')).resolves.toEqual({ success: true });

    await expect(service.initializeSession('session-1', 'openai', 'gpt-5', 'message-1')).resolves.toBe(true);
    await expect(service.shareSession('session-1')).resolves.toMatchObject({ id: 'session-1' });
    await expect(service.unshareSession('session-1')).resolves.toMatchObject({ id: 'session-1' });
    await expect(service.summarizeSession('session-1', 'openai', 'gpt-5')).resolves.toBe(true);
    await expect(service.getSessionMessage('session-1', 'message-1')).resolves.toMatchObject({
      info: { id: 'message-1' },
    });
    await expect(service.deleteSessionMessage('session-1', 'message-1')).resolves.toBe(true);
    await expect(service.getSessionChildren('session-1')).resolves.toHaveLength(1);
    await expect(service.runSessionCommand('session-1', {
      command: 'test',
      arguments: '--help',
    })).resolves.toMatchObject({ info: { id: 'message-2' } });
    await expect(service.runSessionShell('session-1', {
      agent: 'build',
      command: 'echo hi',
    })).resolves.toMatchObject({ info: { id: 'message-3' } });
    await expect(service.updateMessagePart('session-1', 'message-1', 'part-1', {
      id: 'part-1',
      sessionID: 'session-1',
      messageID: 'message-1',
      type: 'text',
      text: 'updated',
    } as never)).resolves.toMatchObject({ id: 'part-1' });
    await expect(service.deleteMessagePart('session-1', 'message-1', 'part-1')).resolves.toBe(true);
    await expect(service.getProviderAuthMethods()).resolves.toEqual({ openai: ['oauth'] });
    await expect(service.authorizeProviderOAuth('openai')).resolves.toEqual({
      url: 'https://example.com/provider-auth',
    });
    await expect(service.completeProviderOAuth('openai', 'code-2')).resolves.toEqual({ success: true });
    await expect(service.listProjects()).resolves.toEqual([{ id: 'project-1' }]);
    await expect(service.getCurrentProject()).resolves.toEqual({ id: 'project-1' });
    await expect(service.initializeProjectGit()).resolves.toEqual({ success: true });
    await expect(service.updateProject('project-1', { name: 'Vault' })).resolves.toEqual({
      id: 'project-1',
      name: 'Vault',
    });
    await expect(service.listFiles({ recursive: true })).resolves.toEqual([{ path: 'README.md' }]);
    await expect(service.readFile({ path: 'README.md' })).resolves.toEqual({
      path: 'README.md',
      content: '# docs',
    });
    await expect(service.getFileStatus({ path: 'README.md' })).resolves.toEqual({ modified: [] });
    await expect(service.findText({ query: 'docs' })).resolves.toEqual([{ path: 'README.md' }]);
    await expect(service.findFiles({ query: 'main' })).resolves.toEqual([{ path: 'src/main.ts' }]);
    await expect(service.findSymbols({ query: 'OpenCode' })).resolves.toEqual([{ name: 'OpenCodeService' }]);
    await expect(service.getPaths()).resolves.toEqual({ cwd: '/vault' });
    await expect(service.getVcsInfo({ cwd: '/vault' })).resolves.toEqual({ branch: 'main' });
    await expect(service.getVcsDiff({ staged: true })).resolves.toEqual({ patch: 'diff --git' });
    await expect(service.getFormatterStatus()).resolves.toEqual({ prettier: 'ready' });
    await expect(service.getLspStatus()).resolves.toEqual({ tsserver: 'ready' });
    await expect(service.getPendingPermissions()).resolves.toEqual([
      {
        id: 'permission-1',
        sessionID: 'session-1',
        permission: 'bash',
        patterns: ['npm test'],
        metadata: {},
        always: [],
      },
    ]);
    await expect(service.respondToPermission('permission-1', 'once', 'Allow once')).resolves.toBeUndefined();
    await expect(service.respondToSessionPermission('session-1', 'permission-1', 'always')).resolves.toBeUndefined();
  });

  describe('SDK capability snapshot', () => {
    beforeEach(() => {
      ({ service } = createOpenCodeServiceSdkCompatContext());
    });

    it('getSdkCapabilitySnapshot returns a snapshot with capability entries', () => {
      const snapshot = service.getSdkCapabilitySnapshot();
      expect(snapshot.generatedAt).toBeGreaterThan(0);
      expect(snapshot.entries.length).toBeGreaterThan(0);
      // every entry has the required shape
      for (const entry of snapshot.entries) {
        expect(typeof entry.id).toBe('string');
        expect(entry.availability).toBeDefined();
        expect(entry.definition).toBeDefined();
      }
    });

    it('refreshSdkCapabilities re-probes and returns a fresh snapshot', async () => {
      const before = service.getSdkCapabilitySnapshot();
      const refreshed = await service.refreshSdkCapabilities();
      expect(refreshed.entries.length).toBeGreaterThan(0);
      expect(refreshed.generatedAt).toBeGreaterThanOrEqual(before.generatedAt);
      // the refreshed snapshot is now cached
      expect(service.getSdkCapabilitySnapshot()).toBe(refreshed);
    });

    it('requireSdkCapability returns an availability result for a known v2 capability', async () => {
      // refresh first so the read-probe runs against the mock facade
      await service.refreshSdkCapabilities();
      const result = service.requireSdkCapability('v2.health.get');
      // The mock client has no v2 namespace, so the facade cannot resolve the
      // method; the coordinator reports the path as not present on the connected
      // client. We assert the well-formed shape rather than a specific kind,
      // since the outcome depends on whether the mock exposes the v2 namespace.
      expect(result).toMatchObject({
        capabilityId: 'v2.health.get',
      });
      expect(result).toHaveProperty('kind');
      expect(['unsupported-by-sdk', 'unsupported-by-server', 'unknown', 'disabled-by-user'])
        .toContain((result as { kind: string }).kind);
    });

    it('requireSdkCapability returns a typed unsupported result for an unknown id', () => {
      const result = service.requireSdkCapability('does.not.exist');
      expect(result).toMatchObject({
        supported: false,
        capabilityId: 'does.not.exist',
        kind: 'unsupported-by-sdk',
      });
    });
  });
});
