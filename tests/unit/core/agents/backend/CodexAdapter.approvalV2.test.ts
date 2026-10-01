/**
 * Real unit tests for the Codex 0.159.0 v2 approval bridging in CodexAdapter:
 * `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`,
 * `item/permissions/requestApproval`, and `item/tool/requestUserInput`.
 *
 * The typed client registrations are captured and invoked directly with wire
 * params; the UI seam is a mocked approval host. Fail-closed behavior and the
 * legacy routes stay intact (legacy coverage lives in
 * CodexAdapter.approvalBridge.test.ts).
 */

type Handler = (params: never) => unknown;

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
const registeredV2 = new Map<string, Handler>();
const mockRegisterCommandExecutionApprovalHandler = jest.fn((h: Handler) => registeredV2.set('commandExecution', h));
const mockRegisterFileChangeApprovalHandler = jest.fn((h: Handler) => registeredV2.set('fileChange', h));
const mockRegisterPermissionsApprovalHandler = jest.fn((h: Handler) => registeredV2.set('permissions', h));
const mockRegisterToolUserInputHandler = jest.fn((h: Handler) => registeredV2.set('toolUserInput', h));

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerClientStart,
      stop: mockAppServerClientStop,
      registerServerRequestHandler: mockRegisterServerRequestHandler,
      unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
      registerCommandExecutionApprovalHandler: mockRegisterCommandExecutionApprovalHandler,
      registerFileChangeApprovalHandler: mockRegisterFileChangeApprovalHandler,
      registerPermissionsApprovalHandler: mockRegisterPermissionsApprovalHandler,
      registerToolUserInputHandler: mockRegisterToolUserInputHandler,
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    })),
  };
});

import type { CodexApprovalDecision, CodexApprovalRequest } from '../../../../../src/core/agents/backend/CodexAdapter';
import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';

function createMockCodex(): unknown {
  return {
    startThread: jest.fn(),
    resumeThread: jest.fn(),
  };
}

async function createStartedAdapter(
  host: { collectApproval: jest.Mock; collectQuestionAnswers?: jest.Mock },
): Promise<CodexAdapter> {
  const adapter = new CodexAdapter({
    codexPathOverride: '/path/to/codex',
    createCodex: jest.fn().mockResolvedValue(createMockCodex()),
  });
  adapter.setApprovalHost(host);
  await adapter.start();
  return adapter;
}

const COMMAND_EXECUTION_PARAMS = {
  threadId: 'thread-1',
  turnId: 'turn-1',
  itemId: 'item-1',
  startedAtMs: 1720000000000,
  command: ['npm', 'install'],
  cwd: '/vault',
  proposedExecpolicyAmendment: ['npm install *'],
  proposedNetworkPolicyAmendments: [{ action: 'allow', host: 'registry.npmjs.org' }],
};

const v2BridgeBeforeEach = (): void => {
  beforeEach(() => {
    jest.clearAllMocks();
    registeredV2.clear();
    mockAppServerClientStart.mockResolvedValue(undefined);
  });
};

describe('CodexAdapter v2 approval bridge registration', () => {
  v2BridgeBeforeEach();

  it('registers the v2 routes alongside the legacy routes when a host is set', async () => {
    const adapter = await createStartedAdapter({ collectApproval: jest.fn().mockResolvedValue({ decision: 'denied' }) });

    const methods = mockRegisterServerRequestHandler.mock.calls.map((c) => c[0]);
    expect(methods).toContain('execCommandApproval');
    expect(methods).toContain('applyPatchApproval');
    expect(registeredV2.has('commandExecution')).toBe(true);
    expect(registeredV2.has('fileChange')).toBe(true);
    expect(registeredV2.has('permissions')).toBe(true);
    expect(registeredV2.has('toolUserInput')).toBe(true);
    await adapter.stop();
  });

  it('does not register the v2 routes without a host callback', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();
    expect(registeredV2.size).toBe(0);
    await adapter.stop();
  });
});

describe('item/commandExecution/requestApproval (CodexAdapter v2 bridge)', () => {
  v2BridgeBeforeEach();
    it('normalizes params and maps approved → accept', async () => {
      const collectApproval = jest.fn().mockResolvedValue({ decision: 'approved' });
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('commandExecution')! as (params: unknown) => Promise<unknown>;

      const reply = await handler(COMMAND_EXECUTION_PARAMS);

      expect(reply).toEqual({ decision: 'accept' });
      const request = collectApproval.mock.calls[0][0] as CodexApprovalRequest;
      expect(request.kind).toBe('commandExecution');
      expect(request.command).toBe('npm install');
      expect(request.cwd).toBe('/vault');
      expect(request.proposedExecpolicyAmendment).toEqual(['npm install *']);
      expect(request.proposedNetworkPolicyAmendments).toEqual([{ action: 'allow', host: 'registry.npmjs.org' }]);
      await adapter.stop();
    });

    it('maps approved_for_session → acceptForSession and denied → decline', async () => {
      const collectApproval = jest.fn()
        .mockResolvedValueOnce({ decision: 'approved_for_session' })
        .mockResolvedValueOnce({ decision: 'denied' });
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('commandExecution')! as (params: unknown) => Promise<unknown>;

      await expect(handler(COMMAND_EXECUTION_PARAMS)).resolves.toEqual({ decision: 'acceptForSession' });
      await expect(handler(COMMAND_EXECUTION_PARAMS)).resolves.toEqual({ decision: 'decline' });
      await adapter.stop();
    });

    it('maps abort → cancel (interrupt the turn)', async () => {
      const collectApproval = jest.fn().mockResolvedValue({ decision: 'abort' });
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('commandExecution')! as (params: unknown) => Promise<unknown>;

      await expect(handler(COMMAND_EXECUTION_PARAMS)).resolves.toEqual({ decision: 'cancel' });
      await adapter.stop();
    });

    it('maps the execpolicy amendment decision to the object wire shape', async () => {
      const collectApproval = jest.fn().mockResolvedValue({
        decision: 'accept_with_execpolicy_amendment',
        execpolicyAmendment: ['npm install *'],
      } satisfies CodexApprovalDecision);
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('commandExecution')! as (params: unknown) => Promise<unknown>;

      await expect(handler(COMMAND_EXECUTION_PARAMS)).resolves.toEqual({
        decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['npm install *'] } },
      });
      await adapter.stop();
    });

    it('maps the network policy amendment decision to the object wire shape', async () => {
      const collectApproval = jest.fn().mockResolvedValue({
        decision: 'apply_network_policy_amendment',
        networkPolicyAmendment: { action: 'allow', host: 'registry.npmjs.org' },
      } satisfies CodexApprovalDecision);
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('commandExecution')! as (params: unknown) => Promise<unknown>;

      await expect(handler(COMMAND_EXECUTION_PARAMS)).resolves.toEqual({
        decision: { applyNetworkPolicyAmendment: { network_policy_amendment: { action: 'allow', host: 'registry.npmjs.org' } } },
      });
      await adapter.stop();
    });

    it('fails closed to decline when the host returns null', async () => {
      const collectApproval = jest.fn().mockResolvedValue(null);
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('commandExecution')! as (params: unknown) => Promise<unknown>;

      await expect(handler(COMMAND_EXECUTION_PARAMS)).resolves.toEqual({ decision: 'decline' });
      await adapter.stop();
    });
});

describe('item/fileChange/requestApproval (CodexAdapter v2 bridge)', () => {
  v2BridgeBeforeEach();
    const FILE_CHANGE_PARAMS = {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-2',
      startedAtMs: 1720000000000,
      grantRoot: '/vault/src',
      reason: 'extra write access',
    };

    it('surfaces grantRoot/reason and maps approved → accept', async () => {
      const collectApproval = jest.fn().mockResolvedValue({ decision: 'approved' });
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('fileChange')! as (params: unknown) => Promise<unknown>;

      await expect(handler(FILE_CHANGE_PARAMS)).resolves.toEqual({ decision: 'accept' });
      const request = collectApproval.mock.calls[0][0] as CodexApprovalRequest;
      expect(request.kind).toBe('fileChange');
      expect(request.grantRoot).toBe('/vault/src');
      expect(request.reason).toBe('extra write access');
      await adapter.stop();
    });

    it('maps denied → decline and abort → cancel', async () => {
      const collectApproval = jest.fn()
        .mockResolvedValueOnce({ decision: 'denied' })
        .mockResolvedValueOnce({ decision: 'abort' });
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('fileChange')! as (params: unknown) => Promise<unknown>;

      await expect(handler(FILE_CHANGE_PARAMS)).resolves.toEqual({ decision: 'decline' });
      await expect(handler(FILE_CHANGE_PARAMS)).resolves.toEqual({ decision: 'cancel' });
      await adapter.stop();
    });
});

describe('item/permissions/requestApproval (CodexAdapter v2 bridge)', () => {
  v2BridgeBeforeEach();
    const PERMISSIONS_PARAMS = {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-3',
      startedAtMs: 1720000000000,
      cwd: '/vault',
      permissions: { network: { enabled: true } },
      reason: 'network access',
    };

    it('approve echoes the requested profile with turn scope', async () => {
      const collectApproval = jest.fn().mockResolvedValue({ decision: 'approved' });
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('permissions')! as (params: unknown) => Promise<unknown>;

      await expect(handler(PERMISSIONS_PARAMS)).resolves.toEqual({
        permissions: { network: { enabled: true } },
        scope: 'turn',
      });
      const request = collectApproval.mock.calls[0][0] as CodexApprovalRequest;
      expect(request.kind).toBe('permissions');
      expect(request.permissionRequest).toEqual({ network: { enabled: true } });
      expect(request.cwd).toBe('/vault');
      await adapter.stop();
    });

    it('approve-for-session echoes the profile with session scope', async () => {
      const collectApproval = jest.fn().mockResolvedValue({ decision: 'approved_for_session' });
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('permissions')! as (params: unknown) => Promise<unknown>;

      await expect(handler(PERMISSIONS_PARAMS)).resolves.toEqual({
        permissions: { network: { enabled: true } },
        scope: 'session',
      });
      await adapter.stop();
    });

    it('deny returns the lawful empty granted profile', async () => {
      const collectApproval = jest.fn().mockResolvedValue({ decision: 'denied' });
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('permissions')! as (params: unknown) => Promise<unknown>;

      await expect(handler(PERMISSIONS_PARAMS)).resolves.toEqual({ permissions: {} });
      await adapter.stop();
    });
});

describe('item/tool/requestUserInput (CodexAdapter v2 bridge)', () => {
  v2BridgeBeforeEach();
    const USER_INPUT_PARAMS = {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-4',
      isBlocking: true,
      questions: [
        {
          id: 'q1',
          header: 'Deploy target',
          question: 'Which environment should be deployed?',
          options: [
            { label: 'staging', description: 'Staging environment' },
            { label: 'production', description: 'Production environment' },
          ],
        },
        {
          id: 'q2',
          header: 'Notes',
          question: 'Any extra notes?',
        },
      ],
    };

    it('bridges the question card and replies with per-question-id answers', async () => {
      const collectApproval = jest.fn().mockResolvedValue({ decision: 'denied' });
      const collectQuestionAnswers = jest.fn().mockResolvedValue({
        status: 'answered',
        answers: [['staging'], ['ship it']],
      });
      const adapter = await createStartedAdapter({ collectApproval, collectQuestionAnswers });
      const handler = registeredV2.get('toolUserInput')! as (params: unknown) => Promise<unknown>;

      const reply = await handler(USER_INPUT_PARAMS);

      expect(reply).toEqual({
        answers: {
          q1: { answers: ['staging'] },
          q2: { answers: ['ship it'] },
        },
      });
      const request = collectQuestionAnswers.mock.calls[0][0];
      expect(request.questions).toHaveLength(2);
      expect(request.questions[0].multiple).toBe(true);
      expect(request.questions[1].custom).toBe(true);
      await adapter.stop();
    });

    it('returns an empty answers map when the card is unanswered', async () => {
      const collectApproval = jest.fn().mockResolvedValue({ decision: 'denied' });
      const collectQuestionAnswers = jest.fn().mockResolvedValue({ status: 'cancelled' });
      const adapter = await createStartedAdapter({ collectApproval, collectQuestionAnswers });
      const handler = registeredV2.get('toolUserInput')! as (params: unknown) => Promise<unknown>;

      await expect(handler(USER_INPUT_PARAMS)).resolves.toEqual({ answers: {} });
      await adapter.stop();
    });

    it('returns an empty answers map when no question host callback exists', async () => {
      const collectApproval = jest.fn().mockResolvedValue({ decision: 'denied' });
      const adapter = await createStartedAdapter({ collectApproval });
      const handler = registeredV2.get('toolUserInput')! as (params: unknown) => Promise<unknown>;

      await expect(handler(USER_INPUT_PARAMS)).resolves.toEqual({ answers: {} });
      await adapter.stop();
    });
});

describe('CodexAdapter v2 bridge unregistration', () => {
  v2BridgeBeforeEach();

  it('unregisters every bridge route on stop', async () => {
    const adapter = await createStartedAdapter({ collectApproval: jest.fn().mockResolvedValue({ decision: 'denied' }) });
    await adapter.stop();

    const methods = mockUnregisterServerRequestHandler.mock.calls.map((c) => c[0]);
    for (const method of [
      'execCommandApproval',
      'applyPatchApproval',
      'item/commandExecution/requestApproval',
      'item/fileChange/requestApproval',
      'item/permissions/requestApproval',
      'item/tool/requestUserInput',
    ]) {
      expect(methods).toContain(method);
    }
  });
});
