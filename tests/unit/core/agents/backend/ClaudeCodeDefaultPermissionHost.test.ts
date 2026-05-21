import {
  type ClaudeCodePermissionBridgeHostContext,
  createClaudeCodePermissionBridgeHost,
} from '../../../../../src/core/agents/backend/ClaudeCodeDefaultPermissionHost';
import type { QuestionRequest, StreamChunk } from '../../../../../src/core/types';

type PermissionRequestChunk = Extract<StreamChunk, { type: 'permission_request' }>;

describe('ClaudeCodeDefaultPermissionHost', () => {
  const permissionRequest = {
    type: 'permission_request',
    id: 'test-id',
    sessionID: 'test-session',
    permission: 'Bash',
    patterns: ['*'],
    metadata: {},
  } as PermissionRequestChunk;

  const questionRequest: QuestionRequest = {
    id: 'q-1',
    sessionId: 'test-session',
    questions: [{
      question: 'Pick one',
      header: 'Test',
      options: [{ label: 'A', description: '' }],
      multiple: false,
      custom: true,
    }],
  };

  let currentContext: ClaudeCodePermissionBridgeHostContext;
  let getContext: jest.MockedFunction<() => ClaudeCodePermissionBridgeHostContext>;
  let permissionCollectResponse: jest.Mock;
  let questionCollectResponse: jest.Mock;

  beforeEach(() => {
    permissionCollectResponse = jest.fn();
    questionCollectResponse = jest.fn();
    currentContext = { getActiveTabId: () => 'active-tab' };
    getContext = jest.fn(() => currentContext);
  });

  it('returns null from collectToolApproval when no permissionCardRenderer is available', async () => {
    const host = createClaudeCodePermissionBridgeHost(getContext);

    await expect(host.collectToolApproval(permissionRequest, {})).resolves.toBeNull();
  });

  it('returns null from collectToolApproval when the card renderer returns null', async () => {
    permissionCollectResponse.mockResolvedValue(null);
    currentContext = {
      getActiveTabId: () => 'active-tab',
      permissionCardRenderer: { collectResponse: permissionCollectResponse },
    };
    const host = createClaudeCodePermissionBridgeHost(getContext);

    await expect(host.collectToolApproval(permissionRequest, {})).resolves.toBeNull();
    expect(permissionCollectResponse).toHaveBeenCalledWith(permissionRequest, 'active-tab');
  });

  it('returns always from collectToolApproval when user clicks always', async () => {
    permissionCollectResponse.mockResolvedValue('always');
    currentContext = {
      getActiveTabId: () => 'active-tab',
      permissionCardRenderer: { collectResponse: permissionCollectResponse },
    };
    const host = createClaudeCodePermissionBridgeHost(getContext);

    await expect(host.collectToolApproval(permissionRequest, {})).resolves.toEqual({ reply: 'always' });
  });

  it('returns once from collectToolApproval when user clicks once', async () => {
    permissionCollectResponse.mockResolvedValue('once');
    currentContext = {
      getActiveTabId: () => 'active-tab',
      permissionCardRenderer: { collectResponse: permissionCollectResponse },
    };
    const host = createClaudeCodePermissionBridgeHost(getContext);

    await expect(host.collectToolApproval(permissionRequest, {})).resolves.toEqual({ reply: 'once' });
  });

  it('returns reject from collectToolApproval when user clicks reject', async () => {
    permissionCollectResponse.mockResolvedValue('reject');
    currentContext = {
      getActiveTabId: () => 'active-tab',
      permissionCardRenderer: { collectResponse: permissionCollectResponse },
    };
    const host = createClaudeCodePermissionBridgeHost(getContext);

    await expect(host.collectToolApproval(permissionRequest, {})).resolves.toEqual({ reply: 'reject' });
  });

  it('preserves session approval from collectToolApproval', async () => {
    permissionCollectResponse.mockResolvedValue('session');
    currentContext = {
      getActiveTabId: () => 'active-tab',
      permissionCardRenderer: { collectResponse: permissionCollectResponse },
    };
    const host = createClaudeCodePermissionBridgeHost(getContext);

    await expect(host.collectToolApproval(permissionRequest, {})).resolves.toEqual({ reply: 'session' });
  });

  it('returns null from collectQuestionAnswers when no questionCardRenderer is available', async () => {
    const host = createClaudeCodePermissionBridgeHost(getContext);

    await expect(host.collectQuestionAnswers(questionRequest, {})).resolves.toBeNull();
  });

  it('returns answers from collectQuestionAnswers when the card renderer returns answers', async () => {
    const answers = [['A']];
    questionCollectResponse.mockResolvedValue(answers);
    currentContext = {
      getActiveTabId: () => 'active-tab',
      questionCardRenderer: { collectResponse: questionCollectResponse },
    };
    const host = createClaudeCodePermissionBridgeHost(getContext);

    await expect(host.collectQuestionAnswers(questionRequest, {})).resolves.toEqual({ answers });
    expect(questionCollectResponse).toHaveBeenCalledWith(questionRequest, 'active-tab');
  });

  it('returns null from collectQuestionAnswers when the card renderer returns null', async () => {
    questionCollectResponse.mockResolvedValue(null);
    currentContext = {
      getActiveTabId: () => 'active-tab',
      questionCardRenderer: { collectResponse: questionCollectResponse },
    };
    const host = createClaudeCodePermissionBridgeHost(getContext);

    await expect(host.collectQuestionAnswers(questionRequest, {})).resolves.toBeNull();
    expect(questionCollectResponse).toHaveBeenCalledWith(questionRequest, 'active-tab');
  });
});
