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
