/**
 * Real unit tests for CodexDefaultApprovalHost.
 *
 * These tests prove the UI host seam that connects CodexAdapter's
 * server-request approval bridge to OpenCodian's existing question/inline-card
 * UI infrastructure.  Three concerns are covered:
 *
 * 1. `createCodexApprovalBridgeHost` — dynamic context reading, null-renderer
 *    fallback, and tabId delegation.
 * 2. `buildCodexApprovalQuestionRequest` — correct QuestionRequest shape for
 *    execCommand (with/without cwd) and applyPatch approvals.
 * 3. `mapCodexApprovalResolution` — correct CodexApprovalDecision mapping for
 *    every resolution status and option label.
 *
 * Together these tests prove the host seam is testable without a live runtime.
 */

import type { CodexApprovalRequest } from '../../../../../src/core/agents/backend/CodexAdapter';
import {
  buildCodexApprovalQuestionRequest,
  type CodexApprovalHostContext,
  createCodexApprovalBridgeHost,
  mapCodexApprovalResolution,
} from '../../../../../src/core/agents/backend/CodexDefaultApprovalHost';

function execCommandRequest(overrides?: Partial<CodexApprovalRequest>): CodexApprovalRequest {
  return {
    kind: 'execCommand',
    summary: 'ls -la',
    command: 'ls -la',
    cwd: '/tmp',
    raw: { command: ['ls', '-la'], cwd: '/tmp' },
    ...overrides,
  };
}

function applyPatchRequest(overrides?: Partial<CodexApprovalRequest>): CodexApprovalRequest {
  return {
    kind: 'applyPatch',
    summary: '2 file changes',
    changeCount: 2,
    raw: { changes: [{ path: '/a.ts' }, { path: '/b.ts' }] },
    ...overrides,
  };
}

describe('createCodexApprovalBridgeHost', () => {
  it('returns null when the context has no renderer', async () => {
    const context: CodexApprovalHostContext = { getActiveTabId: () => 'tab-1' };
    const host = createCodexApprovalBridgeHost(() => context);

    const result = await host.collectApproval!(execCommandRequest());

    expect(result).toBeNull();
  });

  it('delegates to the renderer and returns its decision', async () => {
    const collectResponse = jest.fn().mockResolvedValue({ decision: 'approved' });
    const context: CodexApprovalHostContext = {
      getActiveTabId: () => 'tab-1',
      approvalCardRenderer: { collectResponse },
    };
    const host = createCodexApprovalBridgeHost(() => context);

    const result = await host.collectApproval!(execCommandRequest());

    expect(result).toEqual({ decision: 'approved' });
    expect(collectResponse).toHaveBeenCalledTimes(1);
  });

  it('passes the request and the active tab id to the renderer', async () => {
    const collectResponse = jest.fn().mockResolvedValue(null);
    const request = execCommandRequest({ cwd: '/vault' });
    const context: CodexApprovalHostContext = {
      getActiveTabId: () => 'tab-42',
      approvalCardRenderer: { collectResponse },
    };
    const host = createCodexApprovalBridgeHost(() => context);

    await host.collectApproval!(request);

    expect(collectResponse).toHaveBeenCalledWith(request, 'tab-42');
  });

  it('reads the context dynamically so a renderer added after creation takes effect', async () => {
    const context: CodexApprovalHostContext = { getActiveTabId: () => null };
    const host = createCodexApprovalBridgeHost(() => context);

    expect(await host.collectApproval!(execCommandRequest())).toBeNull();

    context.approvalCardRenderer = {
      collectResponse: jest.fn().mockResolvedValue({ decision: 'denied' }),
    };

    const result = await host.collectApproval!(execCommandRequest());

    expect(result).toEqual({ decision: 'denied' });
  });
});

describe('buildCodexApprovalQuestionRequest', () => {
  it('builds a question with command and cwd for execCommand approvals', () => {
    const request = buildCodexApprovalQuestionRequest(execCommandRequest());

    expect(request.id).toMatch(/^codex-approval-\d+$/);
    expect(request.sessionId).toBe('codex');
    expect(request.questions).toHaveLength(1);

    const q = request.questions[0];
    expect(q.header).toBe('Codex approval');
    expect(q.question).toContain('ls -la');
    expect(q.question).toContain('/tmp');
    expect(q.options).toHaveLength(3);
    expect(q.options.map((o) => o.label)).toEqual([
      'Approve',
      'Approve for session',
      'Deny',
    ]);
    expect(q.multiple).toBe(false);
  });

  it('omits cwd from the question text when not present', () => {
    const request = buildCodexApprovalQuestionRequest(
      execCommandRequest({ cwd: undefined }),
    );

    expect(request.questions[0].question).toContain('ls -la');
    expect(request.questions[0].question).not.toContain('/tmp');
  });

  it('builds a question with change summary for applyPatch approvals', () => {
    const request = buildCodexApprovalQuestionRequest(applyPatchRequest());

    const q = request.questions[0];
    expect(q.question).toContain('2 file changes');
    expect(q.question).not.toContain('run');
  });
});

describe('mapCodexApprovalResolution', () => {
  it('maps "Approve" answer to approved', () => {
    const result = mapCodexApprovalResolution({
      status: 'answered',
      answers: [['Approve']],
    });

    expect(result).toEqual({ decision: 'approved' });
  });

  it('maps "Approve for session" answer to approved_for_session', () => {
    const result = mapCodexApprovalResolution({
      status: 'answered',
      answers: [['Approve for session']],
    });

    expect(result).toEqual({ decision: 'approved_for_session' });
  });

  it('maps "Deny" answer to denied', () => {
    const result = mapCodexApprovalResolution({
      status: 'answered',
      answers: [['Deny']],
    });

    expect(result).toEqual({ decision: 'denied' });
  });

  it('maps rejected status to denied', () => {
    const result = mapCodexApprovalResolution({ status: 'rejected' });

    expect(result).toEqual({ decision: 'denied' });
  });

  it('maps cancelled status to null', () => {
    const result = mapCodexApprovalResolution({ status: 'cancelled' });

    expect(result).toBeNull();
  });

  it('defaults to denied for an unrecognized answer label', () => {
    const result = mapCodexApprovalResolution({
      status: 'answered',
      answers: [['Unknown option']],
    });

    expect(result).toEqual({ decision: 'denied' });
  });
});


describe('Codex approval owning tab', () => {
  it('routes a native request to its owning session tab when a different tab is active', async () => {
    const collectResponse = jest.fn(async () => ({ decision: 'denied' as const }));
    const context = { getActiveTabId: () => 'other-tab', getTabIdForSession: jest.fn(() => 'owner-tab'), approvalCardRenderer: { collectResponse } };
    const request = execCommandRequest({ raw: { threadId: 'thread-owner', turnId: 'turn-owner' } });
    await createCodexApprovalBridgeHost(() => context).collectApproval!(request);
    expect(context.getTabIdForSession).toHaveBeenCalledWith('thread-owner');
    expect(collectResponse).toHaveBeenCalledWith(request, 'owner-tab');
  });

  it('declines without displaying an approval when the native thread has no owning tab', async () => {
    const collectResponse = jest.fn(async () => ({ decision: 'approved' as const }));
    const context = { getActiveTabId: () => 'other-tab', getTabIdForSession: () => null, approvalCardRenderer: { collectResponse } };
    const request = execCommandRequest({ raw: { threadId: 'closed-thread' } });
    await expect(createCodexApprovalBridgeHost(() => context).collectApproval!(request)).resolves.toBeNull();
    expect(collectResponse).not.toHaveBeenCalled();
  });
});

describe('Codex user input owning tab', () => {
  it('routes the native question with its cancellation to its owning tab', async () => {
    const collectResponse = jest.fn().mockResolvedValue({ status: 'cancelled' });
    const getTabIdForSession = jest.fn(() => 'owner-tab');
    const context = { getActiveTabId: () => 'other-tab', getTabIdForSession, questionCardRenderer: { collectResponse } };
    const request = { id: 'input-1', sessionId: 'thread-1', questions: [] };
    const signal = new AbortController().signal;
    await createCodexApprovalBridgeHost(() => context).collectQuestionAnswers!(request, signal);
    expect(getTabIdForSession).toHaveBeenCalledWith('thread-1');
    expect(collectResponse).toHaveBeenCalledWith(request, 'owner-tab', signal);
  });

  it('does not show a native question after its owning tab is gone', async () => {
    const collectResponse = jest.fn().mockResolvedValue({ status: 'answered', answers: [['late']] });
    const context = { getActiveTabId: () => 'other-tab', getTabIdForSession: () => null, questionCardRenderer: { collectResponse } };
    const request = { id: 'input-1', sessionId: 'closed-thread', questions: [] };
    await expect(createCodexApprovalBridgeHost(() => context).collectQuestionAnswers!(request)).resolves.toBeNull();
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

import { CodexAdapter as Matrix014CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import type { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';
import type { QuestionRequest } from '../../../../../src/core/types';

/* eslint-disable jest/no-conditional-expect -- This finite it.each driver selects named schema partitions; every registered scenario runs assertions. Keep the frozen per-partition fail-closed oracles unchanged. */
describe('MATRIX014 Codex synthetic tool user input', () => {
  beforeEach(() => {
    if (typeof globalThis.fetch === 'function') jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked fetch'); });
    jest.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked XHR'); });
  });
  let actual: Record<string, unknown>; let adapter: Matrix014CodexAdapter; let card: QuestionRequest | undefined;
  let result: { status: 'answered' | 'cancelled'; answers?: string[][] };
  const routes = new Map<string, (params: unknown, signal?: AbortSignal) => Promise<unknown>>(); const renderer = jest.fn(); const owner = jest.fn(() => 'FAKE_MATRIX014_owner_tab'); const active = jest.fn(() => 'FAKE_MATRIX014_other_tab');
  const client = { start: jest.fn(async () => {}), stop: jest.fn(), registerServerRequestHandler: jest.fn(), unregisterServerRequestHandler: jest.fn(), registerToolUserInputHandler: jest.fn((handler: (params: unknown, signal?: AbortSignal) => Promise<unknown>) => { routes.set('item/tool/requestUserInput', handler); }) };
  beforeEach(async () => {
    jest.clearAllMocks(); routes.clear(); actual = {}; card = undefined; result = { status: 'cancelled' };
    jest.spyOn(window, 'open').mockImplementation(() => null);
    renderer.mockImplementation(async (request: QuestionRequest, tabId: string | null, signal?: AbortSignal) => { card = request; actual.card = JSON.parse(JSON.stringify(request)); actual.tabId = tabId; actual.signalAbortedAtCollection = signal?.aborted ?? null; return result; });
    adapter = new Matrix014CodexAdapter({ createCodex: async () => ({ startThread: jest.fn(() => { mockMatrix014Attempts.sdk++; throw new Error('MATRIX014 blocked SDK startThread'); }), resumeThread: jest.fn(() => { mockMatrix014Attempts.sdk++; throw new Error('MATRIX014 blocked SDK resumeThread'); }) }) as unknown as Codex, createAppServerClient: () => client as unknown as CodexAppServerClient });
    adapter.setApprovalHost({ ...createCodexApprovalBridgeHost(() => ({ getActiveTabId: active, getTabIdForSession: owner, questionCardRenderer: { collectResponse: renderer } })), collectApproval: jest.fn(async () => ({ decision: 'denied' as const })) }); await adapter.start();
  });
  afterEach(async () => {
    actual.beforeTeardown = { cards: renderer.mock.calls.length, fakeHandlerInvocations: actual.handlerInvocations ?? 0, fakeStarts: client.start.mock.calls.length, windowOpenAttempts: (window.open as jest.Mock).mock.calls.length, windowOpenAdmissions: 0, attempts: { ...mockMatrix014Attempts }, actualRpcEnvelopeReplies: null, nativeRequestID: null, providerHTTP: null }; await adapter.stop(); actual.teardown = { fakeStops: client.stop.mock.calls.length, status: adapter.status, unregisterCalls: client.unregisterServerRequestHandler.mock.calls };
    console.warn('MATRIX014_ACTUAL '+JSON.stringify({ fullName: expect.getState().currentTestName, actual })); jest.restoreAllMocks();
  });
  it('MATRIX014 CODEX-TOOL-INPUT SMOKE-002', async () => {
    const params = { threadId: 'FAKE_MATRIX014_thread', itemId: 'FAKE_MATRIX014_item', questions: [] }; actual.rawInput = params; actual.handlerInvocations = 1; actual.reply = await routes.get('item/tool/requestUserInput')!(params);
    expect(actual.reply).toEqual({ answers: {} }); expect(mockMatrix014Attempts).toEqual({ child: 0, fs: 0, sdk: 0, network: 0 });
  });
  it.each([
    {"id": "CODEX-TOOL-INPUT-SCENARIO-001", "options": "single-options", "answer": "one-string", "lifetime": "active"},
    {"id": "CODEX-TOOL-INPUT-SCENARIO-002", "options": "single-options", "answer": "many-strings", "lifetime": "aborted"},
    {"id": "CODEX-TOOL-INPUT-SCENARIO-003", "options": "single-options", "answer": "empty", "lifetime": "no-host"},
    {"id": "CODEX-TOOL-INPUT-SCENARIO-004", "options": "empty-options", "answer": "one-string", "lifetime": "aborted"},
    {"id": "CODEX-TOOL-INPUT-SCENARIO-005", "options": "empty-options", "answer": "many-strings", "lifetime": "active"},
    {"id": "CODEX-TOOL-INPUT-SCENARIO-006", "options": "malformed-options", "answer": "one-string", "lifetime": "no-host"},
    {"id": "CODEX-TOOL-INPUT-SCENARIO-007", "options": "malformed-options", "answer": "empty", "lifetime": "active"},
    {"id": "CODEX-TOOL-INPUT-SCENARIO-008", "options": "empty-options", "answer": "many-strings", "lifetime": "no-host"},
    {"id": "CODEX-TOOL-INPUT-SCENARIO-009", "options": "empty-options", "answer": "empty", "lifetime": "aborted"},
    {"id": "CODEX-TOOL-INPUT-SCENARIO-010", "options": "malformed-options", "answer": "many-strings", "lifetime": "aborted"},
  ])('MATRIX014 CODEX-TOOL-INPUT $id', async ({ options, answer, lifetime }) => {
    const choices = options === 'single-options' ? [{ label: 'A', description: 'First' }] : options === 'malformed-options' ? [null] : [];
    const params = { threadId: 'FAKE_MATRIX014_thread', turnId: 'FAKE_MATRIX014_turn', itemId: 'FAKE_MATRIX014_item', questions: [{ id: 'FAKE_MATRIX014_q1', question: 'FAKE_MATRIX014_first', header: 'First', options: choices, isOther: true }, { id: 'FAKE_MATRIX014_q2', question: 'FAKE_MATRIX014_second', header: 'Second', options: [], isOther: false }] };
    const answers = [answer === 'one-string' ? ['A'] : answer === 'many-strings' ? ['A', 'typed'] : [], ['second']]; result = { status: 'answered', answers }; const controller = new AbortController();
    if (lifetime === 'aborted') controller.abort();
    if (lifetime === 'no-host') adapter.setApprovalHost({ collectApproval: jest.fn(async () => ({ decision: 'denied' as const })) });
    actual.rawInput = params; actual.answers = answers; actual.handlerInvocations = 1; actual.abortedBeforeDispatch = controller.signal.aborted;
    let error: string | null = null; let reply: unknown; try { reply = await routes.get('item/tool/requestUserInput')!(params, controller.signal); } catch (caught) { error = String(caught); } actual.error = error; actual.reply = reply ?? null;
    expect(error).toBeNull();
    if (lifetime !== 'active' || options === 'malformed-options') { expect(reply).toEqual({ answers: {} }); expect(renderer).not.toHaveBeenCalled(); return; }
    expect(card).toEqual({ id: 'codex-tool-input-FAKE_MATRIX014_item', sessionId: 'FAKE_MATRIX014_thread', questions: [{ question: 'FAKE_MATRIX014_first', header: 'First', options: options === 'single-options' ? [{ label: 'A', description: 'First' }] : [], multiple: false, custom: true }, { question: 'FAKE_MATRIX014_second', header: 'Second', options: [], multiple: false, custom: true }] });
    expect(reply).toEqual({ answers: { FAKE_MATRIX014_q1: { answers: answers[0] }, FAKE_MATRIX014_q2: { answers: ['second'] } } }); expect(renderer).toHaveBeenCalledWith(card, 'FAKE_MATRIX014_owner_tab', controller.signal); expect(owner).toHaveBeenCalledWith('FAKE_MATRIX014_thread'); expect(active).not.toHaveBeenCalled();
  });
  it('MATRIX014 CODEX-TOOL-INPUT SUPPLEMENT-LATE-ACCEPT', async () => {
    const params = { threadId: 'FAKE_MATRIX014_thread', itemId: 'FAKE_MATRIX014_item', questions: [{ id: 'FAKE_MATRIX014_q1', question: 'FAKE_MATRIX014_prompt', header: 'Input', options: [] }] }; const controller = new AbortController();
    renderer.mockImplementation(async (request: QuestionRequest) => { card = request; actual.card = request; controller.abort(); actual.abortedBeforeAccept = true; return { status: 'answered', answers: [['late']] }; }); actual.rawInput = params; actual.handlerInvocations = 1; actual.reply = await routes.get('item/tool/requestUserInput')!(params, controller.signal); actual.settledBeforeTeardown = true;
    expect(actual.reply).toEqual({ answers: {} }); expect(renderer).toHaveBeenCalledTimes(1); expect(controller.signal.aborted).toBe(true);
  });
  it('MATRIX014 CODEX-TOOL-INPUT SUPPLEMENT-ANSWER-COPY', async () => {
    const params = { threadId: 'FAKE_MATRIX014_thread', itemId: 'FAKE_MATRIX014_item', questions: [{ id: 'FAKE_MATRIX014_q1', question: 'FAKE_MATRIX014_prompt', header: 'Input', options: [] }] }; const answers = [['one', 'two']]; result = { status: 'answered', answers }; actual.rawInput = params; actual.handlerInvocations = 1;
    const reply = await routes.get('item/tool/requestUserInput')!(params) as { answers: Record<string, { answers: string[] }> }; answers[0].push('mutated'); actual.reply = reply; actual.answersAfterMutation = answers;
    expect(reply).toEqual({ answers: { FAKE_MATRIX014_q1: { answers: ['one', 'two'] } } }); expect(reply.answers.FAKE_MATRIX014_q1.answers).not.toBe(answers[0]);
  });
});

/* eslint-enable jest/no-conditional-expect */
