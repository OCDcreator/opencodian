/**
 * Runtime effective-settings capture tests (round 2).
 *
 * Uses the real Codex 0.144.1 generated binding shapes: sandbox as a
 * discriminated SandboxPolicy object (dangerFullAccess / readOnly /
 * workspaceWrite), activePermissionProfile as { id, extends? }, and
 * approvalPolicy as either a known scalar or a granular object. Lifecycle
 * evidence mapping is covered by CodexAdapter evidence tests.
 */
import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import {
  buildUniformEffectiveEvidence,
  CodexAppServerClient,
} from '../../../../../src/core/agents/backend/CodexAppServerClient';

const FULL_THREAD = {
  id: 'thread-1',
  sessionId: 'thread-1',
  preview: 'preview',
  createdAt: 1,
  updatedAt: 2,
  cwd: '/vault',
  name: null,
  source: 'codex-cli-rust',
  status: { type: 'idle' },
  turns: [],
};

function makeClientWithMockRequest(): { client: CodexAppServerClient; request: jest.Mock } {
  const client = new CodexAppServerClient({});
  jest.spyOn(client as unknown as { start: () => Promise<void> }, 'start').mockResolvedValue(undefined);
  const request = jest.fn();
  jest.spyOn(client as unknown as { request: typeof request }, 'request').mockImplementation(request);
  return { client, request };
}

describe('CodexAppServerClient effective-settings capture (Codex 0.144.1 shapes)', () => {
  it('captures a workspaceWrite sandbox, {id,extends} profile, and scalar approval', async () => {
    const { client, request } = makeClientWithMockRequest();
    request.mockResolvedValue({
      thread: FULL_THREAD,
      model: 'gpt-5',
      modelProvider: 'openai',
      cwd: '/vault',
      runtimeWorkspaceRoots: ['/vault', '/extra'],
      instructionSources: ['project', 'global'],
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandbox: { type: 'workspaceWrite', writableRoots: ['/vault'], networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
      activePermissionProfile: { id: 'default', extends: 'base' },
      reasoningEffort: 'high',
    });

    await client.startThread({ cwd: '/vault' });

    const effective = client.getThreadEffectiveSettings('thread-1');
    expect(effective).toEqual({
      model: 'gpt-5',
      modelProvider: 'openai',
      cwd: '/vault',
      runtimeWorkspaceRoots: ['/vault', '/extra'],
      instructionSources: ['project', 'global'],
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandbox: { type: 'workspaceWrite', writableRoots: ['/vault'], networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
      activePermissionProfile: { id: 'default', extends: 'base' },
      reasoningEffort: 'high',
    });
  });

  it('captures dangerFullAccess and readOnly sandbox variants', async () => {
    const { client, request } = makeClientWithMockRequest();
    request.mockResolvedValue({
      thread: { ...FULL_THREAD, id: 'thread-danger' },
      sandbox: { type: 'dangerFullAccess' },
    });
    await client.startThread({});
    expect(client.getThreadEffectiveSettings('thread-danger')?.sandbox).toEqual({ type: 'dangerFullAccess' });

    request.mockResolvedValue({
      thread: { ...FULL_THREAD, id: 'thread-ro' },
      sandbox: { type: 'readOnly', networkAccess: false },
    });
    await client.startThread({});
    expect(client.getThreadEffectiveSettings('thread-ro')?.sandbox).toEqual({ type: 'readOnly', networkAccess: false });
  });

  it('captures a granular (object) approvalPolicy verbatim', async () => {
    const { client, request } = makeClientWithMockRequest();
    const granular = { onFailure: { type: 'deny' }, kind: 'granular' };
    request.mockResolvedValue({ thread: FULL_THREAD, approvalPolicy: granular });
    await client.startThread({});
    expect(client.getThreadEffectiveSettings('thread-1')?.approvalPolicy).toEqual(granular);
  });

  it('drops a bare-string sandbox (not a valid binding shape) and an untyped profile', async () => {
    const { client, request } = makeClientWithMockRequest();
    request.mockResolvedValue({
      thread: FULL_THREAD,
      sandbox: 'workspace-write', // invalid: bindings are objects
      activePermissionProfile: 'default', // invalid: bindings are {id}
      model: 'gpt-5',
    });
    await client.startThread({});
    const effective = client.getThreadEffectiveSettings('thread-1');
    expect(effective?.model).toBe('gpt-5');
    expect(effective?.sandbox).toBeUndefined();
    expect(effective?.activePermissionProfile).toBeUndefined();
  });

  it('returns null (unavailable) for an older server that echoes no effective fields', async () => {
    const { client, request } = makeClientWithMockRequest();
    request.mockResolvedValue({ thread: FULL_THREAD });
    await client.startThread({});
    expect(client.getThreadEffectiveSettings('thread-1')).toBeNull();
  });

  it('a no-field response REPLACES the stale snapshot (real client request sequence)', async () => {
    const { client, request } = makeClientWithMockRequest();
    // First response: full effective → captured.
    request.mockResolvedValueOnce({ thread: FULL_THREAD, model: 'gpt-5', sandbox: { type: 'workspaceWrite' } });
    await client.startThread({});
    expect(client.getThreadEffectiveSettings('thread-1')?.model).toBe('gpt-5');
    // Second response (resume): NO effective fields → must clear the stale entry.
    request.mockResolvedValueOnce({ thread: FULL_THREAD });
    await client.resumeThread('thread-1', {});
    expect(client.getThreadEffectiveSettings('thread-1')).toBeNull();
  });

  it('captures effective fields from thread/resume too', async () => {
    const { client, request } = makeClientWithMockRequest();
    request.mockResolvedValue({
      thread: { ...FULL_THREAD, id: 'thread-2' },
      model: 'gpt-5',
      approvalPolicy: 'untrusted',
      sandbox: { type: 'readOnly', networkAccess: false },
      activePermissionProfile: { id: 'strict' },
    });
    await client.resumeThread('thread-2', {});
    const effective = client.getThreadEffectiveSettings('thread-2');
    expect(effective?.model).toBe('gpt-5');
    expect(effective?.approvalPolicy).toBe('untrusted');
    expect(effective?.sandbox).toEqual({ type: 'readOnly', networkAccess: false });
    expect(effective?.activePermissionProfile).toEqual({ id: 'strict' });
  });

  it('buildUniformEffectiveEvidence respects wiring: never-wired fields are not-applicable in every state', () => {
    const wired = { model: true, modelProvider: false, cwd: true, sandbox: true, approvalPolicy: false, activePermissionProfile: false, reasoningEffort: true };
    const pending = buildUniformEffectiveEvidence('pending', wired, 'in flight');
    expect(pending.model.application).toBe('pending');
    expect(pending.model.runtime).toBe('pending');
    // Never-wired fields (modelProvider, approvalPolicy, activePermissionProfile) are
    // application not-applicable even in pending/failed/unavailable — never the lifecycle status.
    expect(pending.modelProvider.application).toBe('not-applicable');
    expect(pending.approvalPolicy.application).toBe('not-applicable');
    expect(pending.activePermissionProfile.application).toBe('not-applicable');
    // runtime still tracks the lifecycle.
    expect(pending.modelProvider.runtime).toBe('pending');
    const failed = buildUniformEffectiveEvidence('failed', wired, 'boom');
    expect(failed.sandbox.application).toBe('failed');
    expect(failed.modelProvider.application).toBe('not-applicable');
    const unavail = buildUniformEffectiveEvidence('unavailable', wired);
    expect(unavail.cwd.application).toBe('unavailable');
    expect(unavail.activePermissionProfile.application).toBe('not-applicable');
  });
});

describe('CodexAdapter effective-settings + evidence delegation', () => {
  it('returns null when no app-server client is available', async () => {
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue({}),
      createAppServerClient: () => null,
    });
    await adapter.start();
    expect(adapter.getThreadEffectiveSettings('codex-local-1')).toBeNull();
    // Evidence is all-unavailable when there is no readback.
    expect(adapter.getThreadEffectiveEvidence('codex-local-1').sandbox.application).toBe('unavailable');
    expect(adapter.getLatestThreadEffectiveEvidence()).toBeNull();
  });

  it('returns null for a provisional session with no resolved backend thread', async () => {
    const fakeClient = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      subscribeToSkillsChanged: jest.fn(() => () => undefined),
      getThreadEffectiveSettings: jest.fn().mockReturnValue({ model: 'gpt-5' }),
    };
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue({}),
      createAppServerClient: () => fakeClient as never,
    });
    await adapter.start();
    expect(adapter.getThreadEffectiveSettings('codex-local-1')).toBeNull();
    expect(fakeClient.getThreadEffectiveSettings).not.toHaveBeenCalled();
  });
});

describe('CodexAppServerClient — real cache eviction (item 2 round 7)', () => {
  it('capture → get non-null → clearThreadEffectiveSettings → get null', async () => {
    const { client, request } = makeClientWithMockRequest();
    request.mockResolvedValue({ thread: FULL_THREAD, model: 'gpt-5', sandbox: { type: 'workspaceWrite' } });
    await client.startThread({});
    expect(client.getThreadEffectiveSettings('thread-1')?.model).toBe('gpt-5');
    client.clearThreadEffectiveSettings('thread-1');
    expect(client.getThreadEffectiveSettings('thread-1')).toBeNull();
  });

  it('resume captures then clearThreadEffectiveSettings evicts', async () => {
    const { client, request } = makeClientWithMockRequest();
    request.mockResolvedValue({ thread: { ...FULL_THREAD, id: 'thread-2' }, model: 'gpt-5' });
    await client.resumeThread('thread-2', {});
    expect(client.getThreadEffectiveSettings('thread-2')).not.toBeNull();
    client.clearThreadEffectiveSettings('thread-2');
    expect(client.getThreadEffectiveSettings('thread-2')).toBeNull();
  });
});

describe('CodexAppServerClient — stop() clears cache (item B round 8)', () => {
  it('capture → stop → get null (real client)', async () => {
    const { client, request } = makeClientWithMockRequest();
    request.mockResolvedValue({ thread: FULL_THREAD, model: 'gpt-5' });
    await client.startThread({});
    expect(client.getThreadEffectiveSettings('thread-1')?.model).toBe('gpt-5');
    await client.stop();
    expect(client.getThreadEffectiveSettings('thread-1')).toBeNull();
  });
});
