/**
 * Real unit tests for the Codex MCP elicitation bridge:
 * `CodexElicitationBridge` builders (form/url question cards, content
 * coercion) and the adapter-side `mcpServer/elicitation/request` handler
 * (registration, form/url flows, decline/cancel, unsupported modes).
 */

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
let elicitationHandler: ((params: unknown, signal?: AbortSignal) => unknown) | null = null;
const mockRegisterMcpElicitationHandler = jest.fn((handler: (params: unknown, signal?: AbortSignal) => unknown) => {
  elicitationHandler = handler;
});

jest.mock('../../../../../src/core/agents/backend/codex/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/codex/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerClientStart,
      stop: mockAppServerClientStop,
      registerServerRequestHandler: mockRegisterServerRequestHandler,
      unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
      registerMcpElicitationHandler: mockRegisterMcpElicitationHandler,
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    })),
  };
});

import { CodexAdapter } from '../../../../../src/core/agents/backend/codex/CodexAdapter';
import {
  buildCodexElicitationContent,
  buildCodexElicitationQuestionRequest,
  buildCodexElicitationUrlQuestionRequest,
  type CodexElicitationFormParams,
  type CodexElicitationUrlParams,
  createCodexElicitationBridgeHost,
} from '../../../../../src/core/agents/backend/codex/CodexElicitationBridge';

function createMockCodex(): unknown {
  return {
    startThread: jest.fn(),
    resumeThread: jest.fn(),
  };
}

const FORM_PARAMS: CodexElicitationFormParams = {
  serverName: 'github',
  threadId: 'thread-1',
  mode: 'form',
  message: 'Configure the deployment',
  requestedSchema: {
    type: 'object',
    properties: {
      environment: {
        type: 'string',
        title: 'Environment',
        enum: ['staging', 'production'],
        enumNames: ['Staging', 'Production'],
      },
      retries: { type: 'integer', title: 'Retries' },
      confirmed: { type: 'boolean', title: 'Confirmed' },
      regions: { type: 'array', items: { type: 'string', enum: ['us', 'eu'] } },
      channel: {
        type: 'string',
        oneOf: [
          { const: 'stable', title: 'Stable channel' },
          { const: 'beta', title: 'Beta channel' },
        ],
      },
    },
    required: ['environment'],
  },
};

const URL_PARAMS: CodexElicitationUrlParams = {
  serverName: 'slack',
  threadId: 'thread-1',
  mode: 'url',
  message: 'Authorize Slack in the browser',
  url: 'https://example.com/auth',
  elicitationId: 'elicitation-1',
};

describe('CodexElicitationBridge builders', () => {
  it('maps schema properties to custom prompts with enum options and multiple arrays', () => {
    const request = buildCodexElicitationQuestionRequest(FORM_PARAMS);

    expect(request.sessionId).toBe('codex');
    expect(request.questions).toHaveLength(5);

    const byKey = Object.fromEntries(request.questions.map((q) => [q.question, q]));
    expect(byKey.environment.header).toBe('Environment');
    expect(byKey.environment.options).toEqual([
      { label: 'staging', description: 'Staging' },
      { label: 'production', description: 'Production' },
    ]);
    expect(byKey.environment.custom).toBe(true);

    expect(byKey.retries.options).toEqual([]);
    expect(byKey.confirmed.multiple).toBeFalsy();

    expect(byKey.regions.multiple).toBe(true);
    expect(byKey.regions.options).toEqual([
      { label: 'us', description: '' },
      { label: 'eu', description: '' },
    ]);

    expect(byKey.channel.options).toEqual([
      { label: 'stable', description: 'Stable channel' },
      { label: 'beta', description: 'Beta channel' },
    ]);
  });

  it('falls back to an Accept/Decline confirm card when the form has no properties', () => {
    const request = buildCodexElicitationQuestionRequest({
      ...FORM_PARAMS,
      requestedSchema: { type: 'object', properties: {} },
    });

    expect(request.questions).toHaveLength(1);
    expect(request.questions[0].question).toBe('Configure the deployment');
    expect(request.questions[0].options.map((o) => o.label)).toEqual(['Accept', 'Decline']);
  });

  it('builds the url-mode confirm card', () => {
    const request = buildCodexElicitationUrlQuestionRequest(URL_PARAMS);

    expect(request.id).toBe('codex-elicitation-url-elicitation-1');
    expect(request.questions[0].options[0]).toEqual({
      label: 'Accept',
      description: 'https://example.com/auth',
    });
  });

  it('coerces answers back per the requested schema', () => {
    const request = buildCodexElicitationQuestionRequest(FORM_PARAMS);
    const answers = [
      ['staging'],
      ['3'],
      ['yes'],
      ['us', 'eu'],
      ['beta'],
    ];

    const content = buildCodexElicitationContent(request, answers, FORM_PARAMS);

    expect(content).toEqual({
      environment: 'staging',
      retries: 3,
      confirmed: true,
      regions: ['us', 'eu'],
      channel: 'beta',
    });
  });

  it('skips the fallback Decline selection when building content', () => {
    const params: CodexElicitationFormParams = {
      ...FORM_PARAMS,
      requestedSchema: { type: 'object', properties: {} },
    };
    const request = buildCodexElicitationQuestionRequest(params);

    expect(buildCodexElicitationContent(request, [['Decline']], params)).toEqual({});
  });
});

describe('CodexAdapter mcpServer/elicitation/request handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    elicitationHandler = null;
    mockAppServerClientStart.mockResolvedValue(undefined);
  });

  function createStartedAdapter(
    host: { collectElicitation: jest.Mock },
  ): CodexAdapter {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setElicitationHost(host);
    return adapter;
  }

  it('registers the elicitation handler when a host is set before start', async () => {
    const adapter = createStartedAdapter({ collectElicitation: jest.fn().mockResolvedValue(null) });
    await adapter.start();

    expect(mockRegisterMcpElicitationHandler).toHaveBeenCalledWith(expect.any(Function));
    await adapter.stop();
  });

  it('accepts a form elicitation with schema-coerced content', async () => {
    const collectElicitation = jest.fn().mockResolvedValue({
      action: 'accept',
      answers: [['staging'], ['2'], ['true'], ['us'], ['stable']],
    });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    const reply = await elicitationHandler!(FORM_PARAMS);

    expect(reply).toEqual({
      action: 'accept',
      content: {
        environment: 'staging',
        retries: 2,
        confirmed: true,
        regions: ['us'],
        channel: 'stable',
      },
    });
    const cardRequest = collectElicitation.mock.calls[0][0];
    expect(cardRequest.params).toBe(FORM_PARAMS);
    expect(cardRequest.questionRequest.questions).toHaveLength(5);
    await adapter.stop();
  });

  it('passes decline and cancel actions through unchanged', async () => {
    const collectElicitation = jest.fn()
      .mockResolvedValueOnce({ action: 'decline' })
      .mockResolvedValueOnce({ action: 'cancel' });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    await expect(elicitationHandler!(FORM_PARAMS)).resolves.toEqual({ action: 'decline' });
    await expect(elicitationHandler!(FORM_PARAMS)).resolves.toEqual({ action: 'cancel' });
    await adapter.stop();
  });

  it('maps the fallback Decline selection to a decline action', async () => {
    const collectElicitation = jest.fn().mockResolvedValue({
      action: 'accept',
      answers: [['Decline']],
    });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    const noProperties = { ...FORM_PARAMS, requestedSchema: { type: 'object', properties: {} } };
    await expect(elicitationHandler!(noProperties)).resolves.toEqual({ action: 'decline' });
    await adapter.stop();
  });

  it('opens the url and confirms for url-mode elicitations', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const collectElicitation = jest.fn().mockResolvedValue({ action: 'accept' });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    await expect(elicitationHandler!(URL_PARAMS)).resolves.toEqual({ action: 'accept' });
    expect(openSpy).toHaveBeenCalledWith('https://example.com/auth', '_blank');
    const cardRequest = collectElicitation.mock.calls[0][0];
    expect(cardRequest.questionRequest.id).toBe('codex-elicitation-url-elicitation-1');

    openSpy.mockRestore();
    await adapter.stop();
  });

  it.each([FORM_PARAMS, URL_PARAMS])('cancels an already stopped owning turn without opening or collecting a form', async (params) => {
    const collectElicitation = jest.fn().mockResolvedValue({ action: 'accept', answers: [['staging']] });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();
    const controller = new AbortController();
    (adapter as unknown as { activeControllers: Map<string, AbortController> }).activeControllers.set('thread-1', controller);
    controller.abort();
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    await expect(elicitationHandler!(params)).resolves.toEqual({ action: 'cancel' });
    expect(collectElicitation).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
    await adapter.stop();
  });

  it.each([FORM_PARAMS, URL_PARAMS])('passes owning cancellation to the card and rejects a late accept', async (params) => {
    const controller = new AbortController();
    const collectElicitation = jest.fn(async (_request) => {
      controller.abort();
      return { action: 'accept', answers: [['staging']] };
    });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();
    (adapter as unknown as { activeControllers: Map<string, AbortController> }).activeControllers.set('thread-1', controller);
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    await expect(elicitationHandler!(params)).resolves.toEqual({ action: 'cancel' });
    expect(collectElicitation).toHaveBeenCalledTimes(1);
    expect(collectElicitation.mock.calls[0][0].signal).toBe(controller.signal);
    openSpy.mockRestore();
    await adapter.stop();
  });

  it('combines native request expiry with the owning turn and cleans both listeners', async () => {
    const turn = new AbortController();
    const request = new AbortController();
    const removeTurn = jest.spyOn(turn.signal, 'removeEventListener');
    const removeRequest = jest.spyOn(request.signal, 'removeEventListener');
    let answer!: (value: unknown) => void;
    const collectElicitation = jest.fn(() => new Promise(resolve => { answer = resolve; }));
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();
    (adapter as unknown as { activeControllers: Map<string, AbortController> }).activeControllers.set('thread-1', turn);
    const pending = elicitationHandler!(FORM_PARAMS, request.signal);
    const cardSignal = collectElicitation.mock.calls[0][0].signal as AbortSignal;
    request.abort();
    answer({ action: 'accept', answers: [['staging']] });
    await expect(pending).resolves.toEqual({ action: 'cancel' });
    expect(cardSignal.aborted).toBe(true);
    expect(turn.signal.aborted).toBe(false);
    expect(removeTurn).toHaveBeenCalledTimes(1);
    expect(removeRequest).toHaveBeenCalledTimes(1);
    await adapter.stop();
  });

  it('also preserves Stop when a native request lifetime is present', async () => {
    const turn = new AbortController();
    const request = new AbortController();
    const collectElicitation = jest.fn(async () => { turn.abort(); return { action: 'accept', answers: [['staging']] }; });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();
    (adapter as unknown as { activeControllers: Map<string, AbortController> }).activeControllers.set('thread-1', turn);
    await expect(elicitationHandler!(FORM_PARAMS, request.signal)).resolves.toEqual({ action: 'cancel' });
    expect(collectElicitation.mock.calls[0][0].signal.aborted).toBe(true);
    expect(request.signal.aborted).toBe(false);
    await adapter.stop();
  });

  it('declines the unsupported openai/form mode gracefully', async () => {
    const collectElicitation = jest.fn();
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    await expect(elicitationHandler!({
      serverName: 'openai',
      threadId: 'thread-1',
      mode: 'openai/form',
      message: 'm',
      requestedSchema: { type: 'object' },
    })).resolves.toEqual({ action: 'decline' });
    expect(collectElicitation).not.toHaveBeenCalled();
    await adapter.stop();
  });

  it('cancels malformed params', async () => {
    const collectElicitation = jest.fn();
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    await expect(elicitationHandler!({ nope: true })).resolves.toEqual({ action: 'cancel' });
    await adapter.stop();
  });
});

describe('Codex elicitation owning tab', () => {
  it('keeps a background form on its native owning tab', async () => {
    const collectResponse = jest.fn().mockResolvedValue({ action: 'cancel' });
    const getTabIdForSession = jest.fn(() => 'owner-tab');
    const host = createCodexElicitationBridgeHost(() => ({ getActiveTabId: () => 'other-tab', getTabIdForSession, elicitationCardRenderer: { collectResponse } }));
    const request = { questionRequest: buildCodexElicitationQuestionRequest(FORM_PARAMS), params: FORM_PARAMS };
    await host.collectElicitation!(request);
    expect(getTabIdForSession).toHaveBeenCalledWith('thread-1');
    expect(collectResponse).toHaveBeenCalledWith(request, 'owner-tab');
  });

  it('does not show an orphaned form in the active tab', async () => {
    const collectResponse = jest.fn().mockResolvedValue({ action: 'accept' });
    const host = createCodexElicitationBridgeHost(() => ({ getActiveTabId: () => 'other-tab', getTabIdForSession: () => null, elicitationCardRenderer: { collectResponse } }));
    await expect(host.collectElicitation!({ questionRequest: buildCodexElicitationQuestionRequest(FORM_PARAMS), params: FORM_PARAMS })).resolves.toBeNull();
    expect(collectResponse).not.toHaveBeenCalled();
  });
});

// MATRIX014: synthetic-only controls. These module mocks never delegate a product operation.
const mockMatrix014Attempts: Record<string, number> = { child: 0, fs: 0, sdk: 0, network: 0 };
jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  ...Object.fromEntries(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'].map(key => [key, jest.fn(() => { mockMatrix014Attempts.child++; throw new Error('MATRIX014 blocked child operation'); })])),
}));
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  ...Object.fromEntries(['readFile', 'readFileSync', 'readdir', 'readdirSync', 'existsSync', 'stat', 'statSync', 'realpathSync', 'writeFile', 'writeFileSync', 'mkdirSync', 'mkdtempSync', 'rmSync', 'unlinkSync', 'open', 'openSync'].map(key => [key, jest.fn(() => { mockMatrix014Attempts.fs++; throw new Error('MATRIX014 blocked product filesystem operation'); })])),
}));
jest.mock('node:fs/promises', () => Object.fromEntries(['readFile', 'readdir', 'stat', 'access', 'writeFile', 'mkdir', 'mkdtemp', 'rm', 'unlink', 'open'].map(key => [key, jest.fn(async () => { mockMatrix014Attempts.fs++; throw new Error('MATRIX014 blocked product filesystem operation'); })])));
jest.mock('@openai/codex-sdk', () => ({ Codex: jest.fn(() => { mockMatrix014Attempts.sdk++; throw new Error('MATRIX014 blocked real SDK constructor'); }) }), { virtual: true });
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: jest.fn(() => { mockMatrix014Attempts.sdk++; throw new Error('MATRIX014 blocked SDK query'); }) }), { virtual: true });
jest.mock('node:http', () => ({ ...jest.requireActual('node:http'), request: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked HTTP'); }), get: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked HTTP'); }) }));
jest.mock('node:https', () => ({ ...jest.requireActual('node:https'), request: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked HTTPS'); }), get: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked HTTPS'); }) }));
jest.mock('node:net', () => ({ ...jest.requireActual('node:net'), connect: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked net'); }), createConnection: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked net'); }) }));
jest.mock('node:tls', () => ({ ...jest.requireActual('node:tls'), connect: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked TLS'); }) }));
jest.mock('obsidian', () => ({ ...jest.requireActual('../../../../../tests/__mocks__/obsidian'), requestUrl: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked requestUrl'); }) }));
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  ...Object.fromEntries(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'].map(key => [key, jest.fn(() => { mockMatrix014Attempts.child++; throw new Error('MATRIX014 blocked child operation'); })])),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  ...Object.fromEntries(['readFile', 'readFileSync', 'readdir', 'readdirSync', 'existsSync', 'stat', 'statSync', 'realpathSync', 'writeFile', 'writeFileSync', 'mkdirSync', 'mkdtempSync', 'rmSync', 'unlinkSync', 'open', 'openSync'].map(key => [key, jest.fn(() => { mockMatrix014Attempts.fs++; throw new Error('MATRIX014 blocked product filesystem operation'); })])),
}));
jest.mock('fs/promises', () => Object.fromEntries(['readFile', 'readdir', 'stat', 'access', 'writeFile', 'mkdir', 'mkdtemp', 'rm', 'unlink', 'open'].map(key => [key, jest.fn(async () => { mockMatrix014Attempts.fs++; throw new Error('MATRIX014 blocked product filesystem operation'); })])));

import type { Codex } from '@openai/codex-sdk';

import type { CodexAppServerClient } from '../../../../../src/core/agents/backend/codex/CodexAppServerClient';
import type { CodexElicitationCardRequest, CodexElicitationHostResponse } from '../../../../../src/core/agents/backend/codex/CodexElicitationBridge';

/* eslint-disable jest/no-conditional-expect -- This finite it.each driver selects named schema partitions; every registered scenario runs assertions. Keep the frozen per-partition fail-closed oracles unchanged. */
describe('MATRIX014 Codex synthetic registered handler', () => {
  beforeEach(() => {
    if (typeof globalThis.fetch === 'function') jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked fetch'); });
    jest.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked XHR'); });
  });
  let actual: Record<string, unknown>;
  let adapter: CodexAdapter;
  let card: CodexElicitationCardRequest | undefined;
  let hostResponse: CodexElicitationHostResponse | null;
  const routes = new Map<string, (params: unknown, signal?: AbortSignal) => Promise<unknown>>();
  const renderer = jest.fn();
  const owner = jest.fn(() => 'FAKE_MATRIX014_owner_tab');
  const active = jest.fn(() => 'FAKE_MATRIX014_other_tab');
  const client = { start: jest.fn(async () => {}), stop: jest.fn(), registerServerRequestHandler: jest.fn(), unregisterServerRequestHandler: jest.fn(), registerMcpElicitationHandler: jest.fn((handler: (params: unknown, signal?: AbortSignal) => Promise<unknown>) => { routes.set('mcpServer/elicitation/request', handler); }) };
  beforeEach(async () => {
    jest.clearAllMocks(); routes.clear(); actual = {}; card = undefined; hostResponse = { action: 'cancel' };
    jest.spyOn(Date, 'now').mockReturnValue(140014);
    jest.spyOn(window, 'open').mockImplementation(() => null);
    renderer.mockImplementation(async (request: CodexElicitationCardRequest, tabId: string | null) => { card = request; actual.card = JSON.parse(JSON.stringify(request.questionRequest)); actual.capturedParams = request.params; actual.tabId = tabId; actual.signalAbortedAtCollection = request.signal?.aborted ?? null; return hostResponse; });
    adapter = new CodexAdapter({ createCodex: async () => ({ startThread: jest.fn(() => { mockMatrix014Attempts.sdk++; throw new Error('MATRIX014 blocked SDK startThread'); }), resumeThread: jest.fn(() => { mockMatrix014Attempts.sdk++; throw new Error('MATRIX014 blocked SDK resumeThread'); }) }) as unknown as Codex, createAppServerClient: () => client as unknown as CodexAppServerClient });
    adapter.setElicitationHost(createCodexElicitationBridgeHost(() => ({ getActiveTabId: active, getTabIdForSession: owner, elicitationCardRenderer: { collectResponse: renderer } })));
    await adapter.start();
  });
  afterEach(async () => {
    actual.beforeTeardown = { cards: renderer.mock.calls.length, fakeHandlerInvocations: actual.handlerInvocations ?? 0, fakeStarts: client.start.mock.calls.length, windowOpenAttempts: (window.open as jest.Mock).mock.calls.length, windowOpenAdmissions: 0, attempts: { ...mockMatrix014Attempts }, actualRpcEnvelopeReplies: null, nativeRequestID: null, providerHTTP: null };
    await adapter.stop(); actual.teardown = { fakeStops: client.stop.mock.calls.length, status: adapter.status, unregisterCalls: client.unregisterServerRequestHandler.mock.calls };
    console.warn('MATRIX014_ACTUAL '+JSON.stringify({ fullName: expect.getState().currentTestName, actual })); jest.restoreAllMocks();
  });
  it('MATRIX014 CODEX-MCP-FORM SMOKE-001', async () => {
    const params = { mode: 'form', serverName: 'FAKE_MATRIX014_server', threadId: 'FAKE_MATRIX014_thread', message: 'FAKE_MATRIX014_confirm', requestedSchema: { type: 'object', properties: {} } };
    actual.rawInput = params; actual.handlerInvocations = 1; actual.reply = await routes.get('mcpServer/elicitation/request')!(params);
    expect(actual.reply).toEqual({ action: 'cancel' }); expect(mockMatrix014Attempts).toEqual({ child: 0, fs: 0, sdk: 0, network: 0 });
  });
  it.each([
    {"id": "CODEX-MCP-FORM-SCENARIO-001", "mode": "form", "shape": "valid-outer", "resolution": "accept"},
    {"id": "CODEX-MCP-FORM-SCENARIO-002", "mode": "form", "shape": "missing-thread", "resolution": "decline"},
    {"id": "CODEX-MCP-FORM-SCENARIO-003", "mode": "form", "shape": "malformed-schema", "resolution": "cancel"},
    {"id": "CODEX-MCP-FORM-SCENARIO-004", "mode": "url", "shape": "valid-outer", "resolution": "decline"},
    {"id": "CODEX-MCP-FORM-SCENARIO-005", "mode": "url", "shape": "missing-thread", "resolution": "accept"},
    {"id": "CODEX-MCP-FORM-SCENARIO-006", "mode": "openai/form", "shape": "valid-outer", "resolution": "cancel"},
    {"id": "CODEX-MCP-FORM-SCENARIO-007", "mode": "openai/form", "shape": "malformed-schema", "resolution": "accept"},
    {"id": "CODEX-MCP-FORM-SCENARIO-008", "mode": "openaiForm", "shape": "missing-thread", "resolution": "cancel"},
    {"id": "CODEX-MCP-FORM-SCENARIO-009", "mode": "openaiForm", "shape": "malformed-schema", "resolution": "decline"},
    {"id": "CODEX-MCP-FORM-SCENARIO-010", "mode": "url", "shape": "malformed-schema", "resolution": "cancel"},
    {"id": "CODEX-MCP-FORM-SCENARIO-011", "mode": "openai/form", "shape": "missing-thread", "resolution": "decline"},
    {"id": "CODEX-MCP-FORM-SCENARIO-012", "mode": "openaiForm", "shape": "valid-outer", "resolution": "accept"},
    {"id": "CODEX-MCP-FORM-SCENARIO-013", "mode": "unknown", "shape": "valid-outer", "resolution": "accept"},
    {"id": "CODEX-MCP-FORM-SCENARIO-014", "mode": "unknown", "shape": "missing-thread", "resolution": "decline"},
    {"id": "CODEX-MCP-FORM-SCENARIO-015", "mode": "unknown", "shape": "malformed-schema", "resolution": "cancel"},
  ])('MATRIX014 CODEX-MCP-FORM $id', async ({ mode, shape, resolution }) => {
    const properties = { text: { type: 'string', title: 'Text', enum: ['red', 'blue'], enumNames: ['Red', 'Blue'] }, number: { type: 'number' }, integer: { type: 'integer' }, boolean: { type: 'boolean' }, array: { type: 'array', items: { type: 'string', enum: ['red', 'blue'] } }, choice: { type: 'string', oneOf: [{ const: 'x', title: 'X' }, { const: 'y', title: 'Y' }] } };
    const params: Record<string, unknown> = { mode, serverName: 'FAKE_MATRIX014_server', threadId: 'FAKE_MATRIX014_thread', turnId: 'FAKE_MATRIX014_turn', message: 'FAKE_MATRIX014_prompt', requestedSchema: { type: 'object', properties: shape === 'malformed-schema' ? [{ type: 'string' }] : properties }, url: shape === 'malformed-schema' ? { invalid: true } : 'https://fixture.invalid/MATRIX014', elicitationId: 'FAKE_MATRIX014_elicitation' };
    if (shape === 'missing-thread') delete params.threadId;
    hostResponse = { action: resolution as 'accept' | 'decline' | 'cancel', answers: [['red'], ['2.5'], ['7'], ['yes'], ['red', 'blue'], ['x']] };
    const controller = new AbortController(); actual.rawInput = params; actual.rawInputBeforeSHA = 'bound by actual part manifest'; actual.handlerInvocations = 1;
    let error: string | null = null; let reply: unknown;
    try { reply = await routes.get('mcpServer/elicitation/request')!(params, controller.signal); } catch (caught) { error = String(caught); }
    actual.reply = reply ?? null; actual.error = error; actual.hostResponse = hostResponse; actual.sameOriginalParams = card ? card.params === params : null; actual.sameSignal = card ? card.signal === controller.signal : null;
    expect(error).toBeNull();
    if (shape === 'missing-thread' || mode === 'unknown') { expect(reply).toEqual({ action: 'cancel' }); expect(renderer).not.toHaveBeenCalled(); return; }
    if (mode === 'openai/form' || mode === 'openaiForm') { expect(reply).toEqual({ action: 'decline' }); expect(renderer).not.toHaveBeenCalled(); return; }
    if (shape === 'malformed-schema') { expect(renderer).not.toHaveBeenCalled(); expect(reply).not.toEqual(expect.objectContaining({ action: 'accept' })); return; }
    expect(renderer).toHaveBeenCalledTimes(1); expect(card?.params).toBe(params); expect(card?.signal).toBe(controller.signal); expect(owner).toHaveBeenCalledWith('FAKE_MATRIX014_thread'); expect(active).not.toHaveBeenCalled();
    if (mode === 'url') { expect(window.open).toHaveBeenCalledWith('https://fixture.invalid/MATRIX014', '_blank'); expect(reply).toEqual({ action: resolution }); expect(card?.questionRequest.id).toBe('codex-elicitation-url-FAKE_MATRIX014_elicitation'); return; }
    expect(card?.questionRequest).toEqual({ id: 'codex-elicitation-140014', sessionId: 'codex', questions: [
      { question: 'text', header: 'Text', options: [{ label: 'red', description: 'Red' }, { label: 'blue', description: 'Blue' }], multiple: false, custom: true },
      { question: 'number', header: 'FAKE_MATRIX014_server', options: [], multiple: false, custom: true },
      { question: 'integer', header: 'FAKE_MATRIX014_server', options: [], multiple: false, custom: true },
      { question: 'boolean', header: 'FAKE_MATRIX014_server', options: [], multiple: false, custom: true },
      { question: 'array', header: 'FAKE_MATRIX014_server', options: [{ label: 'red', description: '' }, { label: 'blue', description: '' }], multiple: true, custom: true },
      { question: 'choice', header: 'FAKE_MATRIX014_server', options: [{ label: 'x', description: 'X' }, { label: 'y', description: 'Y' }], multiple: false, custom: true },
    ] });
    expect(reply).toEqual(resolution === 'accept' ? { action: 'accept', content: { text: 'red', number: 2.5, integer: 7, boolean: true, array: ['red', 'blue'], choice: 'x' } } : { action: resolution });
  });
  it('MATRIX014 CODEX-MCP-FORM SUPPLEMENT-EMPTY-ACCEPT', async () => {
    const params = { mode: 'form', serverName: 'FAKE_MATRIX014_server', threadId: 'FAKE_MATRIX014_thread', message: 'FAKE_MATRIX014_confirm', requestedSchema: { type: 'object', properties: {} } };
    hostResponse = { action: 'accept', answers: [['Accept']] }; actual.rawInput = params; actual.handlerInvocations = 1; actual.reply = await routes.get('mcpServer/elicitation/request')!(params);
    expect(card?.questionRequest.questions[0].options).toEqual([{ label: 'Accept', description: '' }, { label: 'Decline', description: '' }]); expect(actual.reply).toEqual({ action: 'accept', content: { FAKE_MATRIX014_confirm: 'Accept' } });
  });
  it('MATRIX014 CODEX-MCP-FORM SUPPLEMENT-EMPTY-DECLINE', async () => {
    const params = { mode: 'form', serverName: 'FAKE_MATRIX014_server', threadId: 'FAKE_MATRIX014_thread', message: 'FAKE_MATRIX014_confirm', requestedSchema: { type: 'object', properties: {} } };
    hostResponse = { action: 'accept', answers: [['Decline']] }; actual.rawInput = params; actual.handlerInvocations = 1; actual.reply = await routes.get('mcpServer/elicitation/request')!(params);
    expect(actual.reply).toEqual({ action: 'decline' }); expect(renderer).toHaveBeenCalledTimes(1);
  });
  it('MATRIX014 CODEX-MCP-FORM SUPPLEMENT-ITEMS-ANYOF', async () => {
    const params: CodexElicitationFormParams = { mode: 'form', serverName: 'FAKE_MATRIX014_server', threadId: 'FAKE_MATRIX014_thread', message: 'FAKE_MATRIX014_prompt', requestedSchema: { type: 'object', properties: { list: { type: 'array', items: { type: 'string', anyOf: [{ const: 'red', title: 'Red' }, { const: 'blue', title: 'Blue' }] } } } } };
    hostResponse = { action: 'accept', answers: [['red', 'blue']] }; actual.rawInput = params; actual.handlerInvocations = 1; actual.reply = await routes.get('mcpServer/elicitation/request')!(params);
    expect(card?.questionRequest.questions).toEqual([{ question: 'list', header: 'FAKE_MATRIX014_server', options: [{ label: 'red', description: 'Red' }, { label: 'blue', description: 'Blue' }], multiple: true, custom: true }]); expect(actual.reply).toEqual({ action: 'accept', content: { list: ['red', 'blue'] } });
  });
  it('MATRIX014 CODEX-MCP-FORM SUPPLEMENT-ARRAY-COPY', () => {
    const params: CodexElicitationFormParams = { mode: 'form', serverName: 'FAKE_MATRIX014_server', threadId: 'FAKE_MATRIX014_thread', message: 'FAKE_MATRIX014_prompt', requestedSchema: { type: 'object', properties: { list: { type: 'array', enum: ['red', 'blue'] } } } };
    const request = buildCodexElicitationQuestionRequest(params); const answers = [['red', 'blue']]; const content = buildCodexElicitationContent(request, answers, params); answers[0].push('mutated'); actual.rawInput = params; actual.card = request; actual.answersAfterMutation = answers; actual.content = content; actual.hostLayer = 'not invoked';
    expect(content).toEqual({ list: ['red', 'blue'] }); expect(content.list).not.toBe(answers[0]); expect(request.questions[0].options).toEqual([{ label: 'red', description: '' }, { label: 'blue', description: '' }]);
  });
  it('MATRIX014 CODEX-MCP-FORM SUPPLEMENT-LATE-ACCEPT', async () => {
    const params = { mode: 'form', serverName: 'FAKE_MATRIX014_server', threadId: 'FAKE_MATRIX014_thread', message: 'FAKE_MATRIX014_prompt', requestedSchema: { type: 'object', properties: {} } }; const controller = new AbortController();
    renderer.mockImplementation(async (request: CodexElicitationCardRequest) => { card = request; actual.card = request.questionRequest; controller.abort(); actual.abortedBeforeAccept = controller.signal.aborted; return { action: 'accept', answers: [['Accept']] }; });
    actual.rawInput = params; actual.handlerInvocations = 1; actual.reply = await routes.get('mcpServer/elicitation/request')!(params, controller.signal); actual.settledBeforeTeardown = true;
    expect(actual.reply).toEqual({ action: 'cancel' }); expect(renderer).toHaveBeenCalledTimes(1); expect(card?.signal?.aborted).toBe(true);
  });
  it('MATRIX014 CODEX-MCP-FORM SUPPLEMENT-NULL-PROPERTY', async () => {
    const params = { mode: 'form', serverName: 'FAKE_MATRIX014_server', threadId: 'FAKE_MATRIX014_thread', message: 'FAKE_MATRIX014_prompt', requestedSchema: { type: 'object', properties: { broken: null } } }; actual.rawInput = params; actual.handlerInvocations = 1;
    let error: string | null = null; let reply: unknown; try { reply = await routes.get('mcpServer/elicitation/request')!(params); } catch (caught) { error = String(caught); } actual.error = error; actual.reply = reply ?? null;
    expect(error).toBeNull(); expect(renderer).not.toHaveBeenCalled(); expect(reply).toEqual(expect.objectContaining({ action: expect.stringMatching(/^(cancel|decline)$/) }));
  });
});

/* eslint-enable jest/no-conditional-expect */
