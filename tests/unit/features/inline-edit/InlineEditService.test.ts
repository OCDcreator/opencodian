import { describe, expect, it } from '@jest/globals';

import type {
  AgentAuxQueryCapability,
  AuxQueryResult,
  AuxQuerySafetyProof,
  AuxQuerySession,
  AuxQuerySessionConfig,
} from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import {
  AUX_DENIED_CAPABILITIES,
  findWriteToolCalls,
} from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import { canApplyEdit, InlineEditService } from '../../../../src/features/inline-edit/InlineEditService';
import type { InlineEditHostAdapter } from '../../../../src/features/inline-edit/InlineEditTypes';

const SAFETY: AuxQuerySafetyProof = {
  backend: 'opencode',
  enforcedPolicy: 'read-only-allowlist',
  effectiveTools: ['read'],
  deniedCapabilities: AUX_DENIED_CAPABILITIES,
  mechanism: 'test',
};

interface StubSession extends AuxQuerySession {
  readonly queries: string[];
  readonly followUps: string[];
  disposed: boolean;
}

function stubSession(results: AuxQueryResult[]): StubSession {
  const queries: string[] = [];
  const followUps: string[] = [];
  const queue = [...results];
  const session: StubSession = {
    queryId: 'test',
    safety: SAFETY,
    queries,
    followUps,
    disposed: false,
    query(request) {
      queries.push(request.prompt);
      return Promise.resolve(queue.shift() ?? { success: true, text: '<replacement>fallback</replacement>', toolCalls: [] });
    },
    followUp(prompt) {
      followUps.push(prompt);
      return Promise.resolve(queue.shift() ?? { success: true, text: '<replacement>fallback</replacement>', toolCalls: [] });
    },
    cancel() { /* no-op */ },
    dispose() { session.disposed = true; return Promise.resolve(); },
  };
  return session;
}

function adapterWith(
  session: AuxQuerySession | null,
  hasCapability = true,
): { adapter: InlineEditHostAdapter; started: AuxQuerySessionConfig[] } {
  const started: AuxQuerySessionConfig[] = [];
  const capability: AgentAuxQueryCapability = {
    kind: 'opencode',
    displayName: 'OpenCode',
    description: 'test',
    status: 'connected',
    capabilities: new Set(),
    hasCapability: () => true,
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    dispose: () => { /* no-op */ },
    onStatusChange: () => ({ dispose: () => { /* no-op */ } }),
    startAuxQuerySession(config) {
      started.push(config);
      return session ? Promise.resolve(session) : Promise.reject(new Error('no session'));
    },
  };
  return {
    started,
    adapter: {
      kind: 'opencode',
      displayName: 'OpenCode',
      getAuxQuery: () => (hasCapability ? capability : null),
      resolveModel: () => ({ ok: true, model: null }),
    },
  };
}

const selectionRequest = {
  kind: 'selection' as const,
  instruction: 'Tighten this',
  notePath: 'a.md',
  startLine: 1,
  endLine: 1,
  selectionText: 'The cat sat on the mat.',
};

describe('InlineEditService', () => {
  it('starts a session with the current locale system prompt, not a chat prompt', async () => {
    const session = stubSession([{ success: true, text: '<replacement>ok</replacement>', toolCalls: [] }]);
    const { adapter, started } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'zh' });
    await service.submit(selectionRequest);
    expect(started).toHaveLength(1);
    expect(started[0]?.workingDirectory).toBe('/vault');
    expect(started[0]?.systemPrompt).toContain('行内编辑');
    await service.dispose();
  });

  it('returns a preview for a replacement response', async () => {
    const session = stubSession([{ success: true, text: '<replacement>New</replacement>', toolCalls: [] }]);
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await expect(service.submit(selectionRequest)).resolves.toEqual({
      status: 'preview', mode: 'replacement', text: 'New',
    });
    await service.dispose();
  });

  it('returns a clarification when the reply has no tag', async () => {
    const session = stubSession([{ success: true, text: 'Which tone?', toolCalls: [] }]);
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await expect(service.submit(selectionRequest)).resolves.toEqual({
      status: 'clarification', text: 'Which tone?',
    });
    await service.dispose();
  });

  it('reuses the same session for the clarification loop', async () => {
    const session = stubSession([
      { success: true, text: 'Which tone?', toolCalls: [] },
      { success: true, text: '<replacement>Formal</replacement>', toolCalls: [] },
    ]);
    const { adapter, started } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await service.submit(selectionRequest);
    const outcome = await service.clarify('Formal please');
    expect(outcome).toEqual({ status: 'preview', mode: 'replacement', text: 'Formal' });
    expect(started).toHaveLength(1);
    // The clarification round goes through followUp so the backend reuses its
    // native session state.
    expect(session.followUps).toEqual(['Formal please']);
    expect(session.queries).toHaveLength(1);
    await service.dispose();
  });

  it('discards the result and disposes the session when a write-class tool was observed', async () => {
    const session = stubSession([{
      success: true,
      text: '<replacement>sneaky</replacement>',
      toolCalls: [{ name: 'write' }],
    }]);
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const outcome = await service.submit(selectionRequest);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.reason).toBe('write-tool-observed');
    expect(outcome.detail).toContain('write');
    expect(session.disposed).toBe(true);
    await service.dispose();
  });

  it('fails closed when the backend has no aux query capability', async () => {
    const { adapter } = adapterWith(null, false);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const outcome = await service.submit(selectionRequest);
    expect(outcome).toEqual({
      status: 'error', reason: 'capability-unavailable', detail: 'opencode',
    });
    await service.dispose();
  });

  it('surfaces a session start failure instead of falling back', async () => {
    const { adapter } = adapterWith(null, true);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const outcome = await service.submit(selectionRequest);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.reason).toBe('session-unavailable');
    expect(outcome.detail).toContain('no session');
    await service.dispose();
  });

  it('reports a rejected request without starting a session', async () => {
    const session = stubSession([]);
    const { adapter, started } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    const outcome = await service.submit({ ...selectionRequest, selectionText: '</editor_selection>' });
    expect(outcome).toEqual({
      status: 'error', reason: 'selection-contains-protocol-tag',
    });
    expect(started).toHaveLength(0);
    await service.dispose();
  });

  it('stops accepting turns after dispose', async () => {
    const session = stubSession([{ success: true, text: 'Which tone?', toolCalls: [] }]);
    const { adapter } = adapterWith(session);
    const service = new InlineEditService({ adapter, workingDirectory: '/vault', locale: 'en' });
    await service.submit(selectionRequest);
    await service.dispose();
    expect(await service.clarify('more')).toEqual({ status: 'error', reason: 'no-session' });
  });
});

describe('findWriteToolCalls', () => {
  it('accepts read-only tool calls', () => {
    expect(findWriteToolCalls([{ name: 'Read' }, { name: 'grep' }, { name: 'glob' }])).toEqual([]);
  });

  it('flags write, shell, package, and subagent tools', () => {
    expect(findWriteToolCalls([{ name: 'Write' }])).toEqual(['Write']);
    expect(findWriteToolCalls([{ name: 'Bash' }])).toEqual(['Bash']);
    expect(findWriteToolCalls([{ name: 'install_package' }])).toEqual(['install_package']);
    expect(findWriteToolCalls([{ name: 'Task' }])).toEqual(['Task']);
  });

  it('flags anything classified as MCP', () => {
    expect(findWriteToolCalls([{ name: 'some_tool', kind: 'mcp' }])).toEqual(['some_tool']);
  });
});

describe('canApplyEdit', () => {
  it('accepts an unchanged snapshot', () => {
    expect(canApplyEdit('a\nb', 'a\nb')).toBe(true);
  });

  it('rejects a changed snapshot', () => {
    expect(canApplyEdit('a\nb', 'a\nc')).toBe(false);
  });

  it('is line-ending sensitive so CRLF drift is caught', () => {
    expect(canApplyEdit('a\nb', 'a\r\nb')).toBe(false);
  });
});
