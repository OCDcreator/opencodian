import { ClaudeCodeAdapter, type ClaudeCodeSdkFacade } from '../../../../../src/core/agents/backend/ClaudeCodeAdapter';
import {
  ClaudeCodeAsyncQueue,
  type ClaudeCodeMcpPermissionModeOverride,
  type ClaudeCodeQueuedPrompt,
  type ClaudeCodeRuntimeOutput,
  type ClaudeCodeSessionRuntime,
} from '../../../../../src/core/agents/backend/ClaudeCodeQueue';
import { ClaudeCodeStreamNormalizer } from '../../../../../src/core/agents/backend/ClaudeCodeStreamNormalizer';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

interface TestSession {
  id: string;
  title: string;
  messages: ClaudeCodeQueuedPrompt[];
  sdkSessionId?: string;
  runtime?: ClaudeCodeSessionRuntime;
}

function createControlSession(nativeSessionId: string, localId: string) {
  const query = Object.assign(new ClaudeCodeAsyncQueue<unknown>(), {
    setMcpPermissionModeOverride: jest.fn().mockResolvedValue({}),
    reloadOutputStyles: jest.fn().mockResolvedValue({ available_output_styles: ['default', 'custom'] }),
    setPermissionMode: jest.fn(),
    setMcpServers: jest.fn(),
    reloadSkills: jest.fn(),
    interrupt: jest.fn(),
    close: jest.fn(),
  });
  const runtime: ClaudeCodeSessionRuntime = {
    input: new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>(),
    output: new ClaudeCodeAsyncQueue<ClaudeCodeRuntimeOutput>(),
    normalizer: new ClaudeCodeStreamNormalizer({ sessionId: nativeSessionId }),
    abortController: new AbortController(), query, closed: false,
  };
  const inputPush = jest.spyOn(runtime.input, 'push');
  const session: TestSession = { id: localId, title: 'test', messages: [], sdkSessionId: nativeSessionId, runtime };
  return { query, runtime, session, inputPush };
}

function createFixture() {
  const sdkQuery = jest.fn();
  const sdkStartup = jest.fn();
  const sdkResumeRead = jest.fn();
  const sdk: ClaudeCodeSdkFacade = { query: sdkQuery, startup: sdkStartup, getSessionInfo: sdkResumeRead };
  const adapter = new ClaudeCodeAdapter({ vaultPath: '/fixture-vault', settings: getDefaultClaudeCodeBackendSettings(), sdk });
  const a = createControlSession('native-a', 'local-a');
  const b = createControlSession('native-b', 'local-b');
  const sessions = (adapter as unknown as { sessions: Map<string, TestSession> }).sessions;
  // The native capture path registers the same state under both identities.
  sessions.set('local-a', a.session);
  sessions.set('native-a', a.session);
  sessions.set('local-b', b.session);
  sessions.set('native-b', b.session);
  return { adapter, a, b, sessions, sdkQuery, sdkStartup, sdkResumeRead };
}

type Fixture = ReturnType<typeof createFixture>;
type Operation = 'mcp' | 'styles';

function invoke(fixture: Fixture, operation: Operation, nativeSessionId = 'native-a') {
  return operation === 'mcp'
    ? fixture.adapter.setMcpPermissionModeOverride(nativeSessionId, 'server-exact', 'default')
    : fixture.adapter.reloadOutputStyles(nativeSessionId);
}

function assertNoUnrelatedDispatch(fixture: Fixture, operation: Operation, expectedCalls: number) {
  const selected = operation === 'mcp' ? fixture.a.query.setMcpPermissionModeOverride : fixture.a.query.reloadOutputStyles;
  const unselected = operation === 'mcp' ? fixture.a.query.reloadOutputStyles : fixture.a.query.setMcpPermissionModeOverride;
  expect(selected).toHaveBeenCalledTimes(expectedCalls);
  expect(unselected).not.toHaveBeenCalled();
  for (const call of [fixture.sdkQuery, fixture.sdkStartup, fixture.sdkResumeRead, fixture.a.inputPush, fixture.b.inputPush,
    fixture.a.query.close, fixture.b.query.close, fixture.a.query.interrupt, fixture.b.query.interrupt,
    fixture.a.query.setPermissionMode, fixture.b.query.setPermissionMode, fixture.a.query.setMcpServers,
    fixture.b.query.setMcpServers, fixture.a.query.reloadSkills, fixture.b.query.reloadSkills,
    fixture.b.query.setMcpPermissionModeOverride, fixture.b.query.reloadOutputStyles]) {
    expect(call).not.toHaveBeenCalled();
  }
}

function selectedMethod(fixture: Fixture, operation: Operation) {
  return operation === 'mcp' ? fixture.a.query.setMcpPermissionModeOverride : fixture.a.query.reloadOutputStyles;
}

function deferredResponse() {
  let resolve!: (response: unknown) => void;
  const promise = new Promise<unknown>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe('Claude native session controls: acknowledgements', () => {
  it.each(['default', 'auto', null] as const)('passes the exact MCP registration name and %s once to the selected native query', async (mode) => {
    const fixture = createFixture();
    const response = { warning: 'Server Exact has not connected yet', ignored: 'drop extra data' };
    fixture.a.query.setMcpPermissionModeOverride.mockResolvedValue(response);
    const result = await fixture.adapter.setMcpPermissionModeOverride('native-a', ' Server Exact ', mode);

    expect(result).toEqual({ status: 'acknowledged', nativeSessionId: 'native-a', response: { warning: response.warning } });
    expect(fixture.a.query.setMcpPermissionModeOverride).toHaveBeenCalledWith(' Server Exact ', mode);
    expect(fixture.a.query.setMcpPermissionModeOverride.mock.contexts).toEqual([fixture.a.query]);
    if (result.status !== 'acknowledged') throw new Error('Expected native acknowledgement');
    expect(result.response).not.toBe(response);
    response.warning = 'mutated after return';
    expect(result.response.warning).toBe('Server Exact has not connected yet');
    expect(result).not.toHaveProperty('verified');
    assertNoUnrelatedDispatch(fixture, 'mcp', 1);
  });

  it('acknowledges an empty MCP response without inventing readback', async () => {
    const fixture = createFixture();
    expect(await invoke(fixture, 'mcp')).toEqual({ status: 'acknowledged', nativeSessionId: 'native-a', response: {} });
    assertNoUnrelatedDispatch(fixture, 'mcp', 1);
  });

  it.each([{ names: [] as string[] }, { names: ['custom', 'default', 'custom'] }])('copies refreshed style names and order $names without prompt application', async ({ names }) => {
    const fixture = createFixture();
    const response = { available_output_styles: names, promptApplied: true, effectiveStyle: 'unproven' };
    fixture.a.query.reloadOutputStyles.mockResolvedValue(response);
    const result = await invoke(fixture, 'styles');

    expect(result).toEqual({ status: 'acknowledged', nativeSessionId: 'native-a', response: { available_output_styles: [...names] } });
    expect(fixture.a.query.reloadOutputStyles).toHaveBeenCalledWith();
    expect(fixture.a.query.reloadOutputStyles.mock.contexts).toEqual([fixture.a.query]);
    if (result.status !== 'acknowledged' || !('available_output_styles' in result.response)) throw new Error('Expected styles');
    expect(result.response).not.toBe(response);
    expect(result.response.available_output_styles).not.toBe(names);
    names.push('mutated after return');
    expect(result.response.available_output_styles).not.toContain('mutated after return');
    expect(result.response).not.toHaveProperty('promptApplied');
    expect(result.response).not.toHaveProperty('effectiveStyle');
    expect(result).not.toHaveProperty('verified');
    assertNoUnrelatedDispatch(fixture, 'styles', 1);
  });
});

const unavailableCases: Array<[string, (fixture: Fixture) => void]> = [
  ['empty native ID', () => undefined],
  ['whitespace native ID', () => undefined],
  ['local alias', () => undefined],
  ['unknown native ID', () => undefined],
  ['padded native ID', () => undefined],
  ['no active sessions', (f) => { f.sessions.clear(); }],
  ['native ID not yet captured', (f) => { delete f.a.session.sdkSessionId; }],
  ['native identity mismatch', (f) => { f.a.session.sdkSessionId = 'native-old'; }],
  ['no runtime', (f) => { delete f.a.session.runtime; }],
  ['no query', (f) => { delete f.a.runtime.query; }],
  ['closed runtime', (f) => { f.a.runtime.closed = true; }],
  ['aborted runtime', (f) => { f.a.runtime.abortController.abort(); }],
];

for (const operation of ['mcp', 'styles'] as const) {
  describe('Claude ' + operation + ': unavailable and rejected controls', () => {
    it.each(unavailableCases)('reports %s without dispatch, resume, or session fallback', async (label, arrange) => {
      const fixture = createFixture();
      arrange(fixture);
      const ids: Record<string, string> = {
        'empty native ID': '', 'whitespace native ID': '  ', 'local alias': 'local-a',
        'unknown native ID': 'native-missing', 'padded native ID': ' native-a ',
      };
      const id = ids[label] ?? 'native-a';
      expect(await invoke(fixture, operation, id)).toEqual({
        status: 'unavailable', nativeSessionId: id,
        reason: label === 'empty native ID' || label === 'whitespace native ID'
          ? 'invalid-native-session-id' : 'no-active-session',
      });
      assertNoUnrelatedDispatch(fixture, operation, 0);
    });

    it.each([undefined, null, true, 'not-callable'])('reports a missing/non-callable method %s as unavailable', async (value) => {
      const fixture = createFixture();
      const original = selectedMethod(fixture, operation);
      const key = operation === 'mcp' ? 'setMcpPermissionModeOverride' : 'reloadOutputStyles';
      (fixture.a.query as unknown as Record<string, unknown>)[key] = value;
      expect(await invoke(fixture, operation)).toEqual({ status: 'unavailable', nativeSessionId: 'native-a', reason: 'missing-method' });
      expect(original).not.toHaveBeenCalled();
      (fixture.a.query as unknown as Record<string, unknown>)[key] = original;
      assertNoUnrelatedDispatch(fixture, operation, 0);
    });

    it.each(['sync', 'async', 'getter'])('contains %s failures without returning the raw exception', async (failure) => {
      const fixture = createFixture();
      const raw = 'credential=fixture-secret-never-return';
      const method = selectedMethod(fixture, operation);
      const key = operation === 'mcp' ? 'setMcpPermissionModeOverride' : 'reloadOutputStyles';
      if (failure === 'sync') method.mockImplementation(() => { throw new Error(raw); });
      if (failure === 'async') method.mockRejectedValue(new Error(raw));
      if (failure === 'getter') Object.defineProperty(fixture.a.query, key, { configurable: true, get() { throw new Error(raw); } });
      const result = await invoke(fixture, operation);
      expect(result).toEqual({ status: 'failed', nativeSessionId: 'native-a', reason: 'request-failed' });
      expect(JSON.stringify(result)).not.toContain(raw);
      if (failure === 'getter') Object.defineProperty(fixture.a.query, key, { configurable: true, value: method, writable: true });
      assertNoUnrelatedDispatch(fixture, operation, failure === 'getter' ? 0 : 1);
    });
  });
}

describe('Claude MCP invalid input and response boundaries', () => {
  it.each(['bypassPermissions', 'acceptEdits', 'plan', undefined, '', true, 42])('rejects unchecked mode %s without increasing permissions', async (mode) => {
    const fixture = createFixture();
    expect(await fixture.adapter.setMcpPermissionModeOverride('native-a', 'server', mode as ClaudeCodeMcpPermissionModeOverride))
      .toEqual({ status: 'failed', nativeSessionId: 'native-a', reason: 'invalid-input' });
    assertNoUnrelatedDispatch(fixture, 'mcp', 0);
  });

  it.each(['', '  ', undefined, null, true, 42])('rejects unchecked server name %s without dispatch', async (serverName) => {
    const fixture = createFixture();
    expect(await fixture.adapter.setMcpPermissionModeOverride('native-a', serverName as string, 'default'))
      .toEqual({ status: 'failed', nativeSessionId: 'native-a', reason: 'invalid-input' });
    assertNoUnrelatedDispatch(fixture, 'mcp', 0);
  });

  it.each([undefined, null, [], 'ok', true, { warning: true }, { warning: null }, { warning: 42 }])('rejects malformed MCP response %j instead of acknowledging a void/no-op', async (response) => {
    const fixture = createFixture();
    fixture.a.query.setMcpPermissionModeOverride.mockResolvedValue(response);
    expect(await invoke(fixture, 'mcp')).toEqual({ status: 'failed', nativeSessionId: 'native-a', reason: 'invalid-response' });
    assertNoUnrelatedDispatch(fixture, 'mcp', 1);
  });
});

describe('Claude output-style response boundary', () => {
  it.each([undefined, null, [], true, {}, { available_output_styles: null }, { available_output_styles: 'default' },
    { available_output_styles: [42] }, { available_output_styles: ['default', null] },
    { available_output_styles: Array(1) }])('rejects malformed style names %j without inventing a prompt application', async (response) => {
    const fixture = createFixture();
    fixture.a.query.reloadOutputStyles.mockResolvedValue(response);
    expect(await invoke(fixture, 'styles')).toEqual({ status: 'failed', nativeSessionId: 'native-a', reason: 'invalid-response' });
    assertNoUnrelatedDispatch(fixture, 'styles', 1);
  });
});

const changedCases: Array<[string, (fixture: Fixture) => void]> = [
  ['native identity reset', (f) => { f.a.session.sdkSessionId = 'native-reset'; }],
  ['runtime closed', (f) => { f.a.runtime.closed = true; }],
  ['runtime aborted', (f) => { f.a.runtime.abortController.abort(); }],
  ['runtime removed', (f) => { delete f.a.session.runtime; }],
  ['runtime replaced', (f) => { f.a.session.runtime = createControlSession('native-a', 'replacement').runtime; }],
  ['query replaced', (f) => { f.a.runtime.query = createControlSession('native-a', 'replacement').query; }],
  ['native mapping removed', (f) => { f.sessions.delete('native-a'); }],
  ['native mapping replaced', (f) => { f.sessions.set('native-a', { ...f.a.session }); }],
];

for (const operation of ['mcp', 'styles'] as const) {
  describe('Claude ' + operation + ': pending response session isolation', () => {
    it.each(changedCases)('does not bind an old acknowledgement after %s', async (_label, change) => {
      const fixture = createFixture();
      const deferred = deferredResponse();
      selectedMethod(fixture, operation).mockReturnValue(deferred.promise);
      const pending = invoke(fixture, operation);
      expect(selectedMethod(fixture, operation)).toHaveBeenCalledTimes(1);
      change(fixture);
      deferred.resolve(operation === 'mcp' ? {} : { available_output_styles: ['default'] });
      expect(await pending).toEqual({ status: 'failed', nativeSessionId: 'native-a', reason: 'session-changed' });
      assertNoUnrelatedDispatch(fixture, operation, 1);
    });

    it('allows concurrent controls on separate native queries without fan-out', async () => {
      const fixture = createFixture();
      const deferred = deferredResponse();
      selectedMethod(fixture, operation).mockReturnValue(deferred.promise);
      const pendingA = invoke(fixture, operation);
      expect(fixture.b.query.setMcpPermissionModeOverride).not.toHaveBeenCalled();
      expect(fixture.b.query.reloadOutputStyles).not.toHaveBeenCalled();
      const resultB = await invoke(fixture, operation, 'native-b');
      expect(resultB.status).toBe('acknowledged');
      deferred.resolve(operation === 'mcp' ? {} : { available_output_styles: ['A only'] });
      expect((await pendingA).nativeSessionId).toBe('native-a');
      expect(resultB.nativeSessionId).toBe('native-b');
      expect(selectedMethod(fixture, operation)).toHaveBeenCalledTimes(1);
      expect(operation === 'mcp' ? fixture.b.query.setMcpPermissionModeOverride : fixture.b.query.reloadOutputStyles).toHaveBeenCalledTimes(1);
      expect(fixture.sdkQuery).not.toHaveBeenCalled();
      expect(fixture.a.inputPush).not.toHaveBeenCalled();
      expect(fixture.b.inputPush).not.toHaveBeenCalled();
    });

    it('uses the new native ID after a conversation identity reset, never the old alias', async () => {
      const fixture = createFixture();
      fixture.a.session.sdkSessionId = 'native-reset';
      fixture.sessions.delete('native-a');
      fixture.sessions.set('native-reset', fixture.a.session);
      expect(await invoke(fixture, operation, 'native-a')).toEqual({ status: 'unavailable', nativeSessionId: 'native-a', reason: 'no-active-session' });
      expect(await invoke(fixture, operation, 'native-reset')).toMatchObject({ status: 'acknowledged', nativeSessionId: 'native-reset' });
      assertNoUnrelatedDispatch(fixture, operation, 1);
    });
  });
}
