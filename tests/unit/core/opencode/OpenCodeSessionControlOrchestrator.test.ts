import {
  OpenCodeSessionControlOrchestrator,
  type OpenCodeSessionControlOrchestratorHost,
  type OpenCodeSessionControlPartSdk,
  type OpenCodeSessionControlSdk,
} from '../../../../src/core/opencode/OpenCodeSessionControlOrchestrator';
import type {
  Part,
  Session,
  SessionMessage,
} from '../../../../src/core/opencode/OpenCodeSessionLifecycleCoordinator';

type ModelDirectory = Awaited<ReturnType<OpenCodeSessionControlOrchestratorHost['getAvailableModels']>>;

type MockHost = OpenCodeSessionControlOrchestratorHost & {
  shouldUseSdkCrud: jest.Mock<boolean, []>;
  getSdkSession: jest.Mock<OpenCodeSessionControlSdk, []>;
  getSdkPart: jest.Mock<OpenCodeSessionControlPartSdk, []>;
  postLegacy: jest.Mock<Promise<unknown>, [string, unknown]>;
  getLegacy: jest.Mock<Promise<unknown>, [string]>;
  getSessionInfo: jest.Mock<Promise<Session>, [string]>;
  getSessionMessages: jest.Mock<Promise<SessionMessage[]>, [string]>;
  getAvailableModels: jest.Mock<Promise<ModelDirectory>, []>;
  logServiceWarning: jest.Mock<void, [string, string, unknown]>;
  logServiceError: jest.Mock<void, [string, string, unknown]>;
};

function createSessionSdk(
  overrides: Partial<jest.Mocked<OpenCodeSessionControlSdk>> = {},
): jest.Mocked<OpenCodeSessionControlSdk> {
  return {
    fork: jest.fn(),
    revert: jest.fn(),
    unrevert: jest.fn(),
    diff: jest.fn(),
    init: jest.fn(),
    children: jest.fn(),
    share: jest.fn(),
    unshare: jest.fn(),
    summarize: jest.fn(),
    message: jest.fn(),
    deleteMessage: jest.fn(),
    command: jest.fn(),
    shell: jest.fn(),
    ...overrides,
  };
}

function createPartSdk(
  overrides: Partial<jest.Mocked<OpenCodeSessionControlPartSdk>> = {},
): jest.Mocked<OpenCodeSessionControlPartSdk> {
  return {
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  };
}

function createHost(
  sessionSdk: jest.Mocked<OpenCodeSessionControlSdk>,
  partSdk: jest.Mocked<OpenCodeSessionControlPartSdk>,
  overrides: Partial<MockHost> = {},
): MockHost {
  return {
    shouldUseSdkCrud: jest.fn(() => true),
    getSdkSession: jest.fn(() => sessionSdk),
    getSdkPart: jest.fn(() => partSdk),
    postLegacy: jest.fn(),
    getLegacy: jest.fn(),
    getSessionInfo: jest.fn(),
    getSessionMessages: jest.fn(),
    getAvailableModels: jest.fn(),
    logServiceWarning: jest.fn(),
    logServiceError: jest.fn(),
    ...overrides,
  } as MockHost;
}

it('builds context usage from session info, messages, and model catalog', async () => {
    const sessionSdk = createSessionSdk();
    const host = createHost(sessionSdk, createPartSdk(), {
      getSessionInfo: jest.fn().mockResolvedValue({
        id: 'session-1',
        title: 'Planning session',
        time: { created: 1000, updated: 9000 },
      }),
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'assistant-1',
            sessionID: 'session-1',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-4.1',
            cost: 0.1,
            tokens: {
              input: 10,
              output: 5,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            time: { created: 2000 },
          },
          parts: [],
        },
        {
          info: {
            id: 'assistant-2',
            sessionID: 'session-1',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            cost: 0.2,
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            time: { created: 3000 },
          },
          parts: [],
        },
        {
          info: {
            id: 'assistant-3',
            sessionID: 'session-1',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            cost: 0.3,
            tokens: {
              input: 40,
              output: 20,
              reasoning: 10,
              cache: { read: 5, write: 5 },
            },
            time: { created: 4000 },
          },
          parts: [],
        },
      ]),
      getAvailableModels: jest.fn().mockResolvedValue({
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            models: [
              { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 128000 },
              { id: 'gpt-5', name: 'GPT-5', contextWindow: 400000 },
            ],
          },
        ],
        defaults: { provider: 'openai', model: 'gpt-5' },
      }),
    });
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    const snapshot = await orchestrator.getSessionContextUsageSnapshot('session-1');

    expect(snapshot).toMatchObject({
      sessionId: 'session-1',
      sessionTitle: 'Planning session',
      providerId: 'openai',
      providerName: 'OpenAI',
      modelId: 'gpt-5',
      modelName: 'GPT-5',
      contextWindow: 400000,
      inputTokens: 40,
      outputTokens: 20,
      reasoningTokens: 10,
      cacheReadTokens: 5,
      cacheWriteTokens: 5,
      updatedAt: 4000,
    });
    expect(snapshot?.totalCost).toBeCloseTo(0.6, 6);
  });

it('uses configured SDK and legacy transports for control mutations', async () => {
    const sessionSdk = createSessionSdk({
      fork: jest.fn().mockResolvedValue({ id: 'sdk-fork', title: 'Fork Session' }),
      revert: jest.fn().mockResolvedValue({}),
      unrevert: jest.fn().mockResolvedValue({ id: 'session-1', title: 'Session' }),
    });
    const host = createHost(sessionSdk, createPartSdk());
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    await expect(orchestrator.forkSession('session-1', 'message-1')).resolves.toEqual({
      id: 'sdk-fork',
      title: 'Fork Session',
    });
    await expect(orchestrator.revertSession('session-1', 'message-1', 'part-1')).resolves.toBe(true);
    await expect(orchestrator.unrevertSession('session-1')).resolves.toBe(true);

    expect(sessionSdk.fork).toHaveBeenCalledWith({ sessionID: 'session-1', messageID: 'message-1' });
    expect(sessionSdk.revert).toHaveBeenCalledWith({ sessionID: 'session-1', messageID: 'message-1', partID: 'part-1' });
    expect(sessionSdk.unrevert).toHaveBeenCalledWith({ sessionID: 'session-1' });

    host.shouldUseSdkCrud.mockReturnValue(false);
    host.postLegacy
      .mockResolvedValueOnce({ id: 'legacy-fork', title: 'Legacy Fork' })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({});

    await expect(orchestrator.forkSession('legacy-session')).resolves.toEqual({
      id: 'legacy-fork',
      title: 'Legacy Fork',
    });
    await expect(orchestrator.revertSession('legacy-session', 'message-2')).resolves.toBe(true);
    await expect(orchestrator.unrevertSession('legacy-session')).resolves.toBe(true);

    expect(host.postLegacy).toHaveBeenNthCalledWith(1, '/session/legacy-session/fork', {});
    expect(host.postLegacy).toHaveBeenNthCalledWith(2, '/session/legacy-session/revert', { messageID: 'message-2' });
    expect(host.postLegacy).toHaveBeenNthCalledWith(3, '/session/legacy-session/unrevert', {});
  });

it('falls back to legacy session diff reads when SDK diff fails', async () => {
    const sessionSdk = createSessionSdk({
      diff: jest.fn().mockRejectedValue(new Error('sdk diff failed')),
    });
    const host = createHost(sessionSdk, createPartSdk(), {
      getLegacy: jest.fn().mockResolvedValue([
        {
          file: 'notes/today.md',
          patch: '@@ -1 +1 @@\n-old\n+new',
          additions: 3,
          deletions: 1,
          status: 'modified',
        },
      ]),
    });
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    await expect(orchestrator.getSessionDiff('session-1', 'message-1')).resolves.toEqual([
      {
        file: 'notes/today.md',
        patch: '@@ -1 +1 @@\n-old\n+new',
        additions: 3,
        deletions: 1,
        status: 'modified',
      },
    ]);

    expect(host.logServiceWarning).toHaveBeenCalledWith(
      'session.diff',
      'SDK session.diff failed for session-1, falling back to legacy HTTP',
      expect.any(Error),
    );
    expect(host.getLegacy).toHaveBeenCalledWith('/session/session-1/diff?messageID=message-1');
  });

it('owns session messaging and part SDK wrappers', async () => {
    const sessionMessage: SessionMessage = {
      info: {
        id: 'message-1',
        sessionID: 'session-1',
        role: 'assistant',
        time: { created: 1 },
      },
      parts: [],
    };
    const updatedPart: Part = {
      id: 'part-1',
      sessionID: 'session-1',
      messageID: 'message-1',
      type: 'text',
      text: 'updated',
    };
    const sessionSdk = createSessionSdk({
      init: jest.fn().mockResolvedValue(true),
      children: jest.fn().mockResolvedValue([
        { id: 'child-1', title: 'Child', time: { created: 1, updated: 2 } },
      ]),
      share: jest.fn().mockResolvedValue({ id: 'session-1', title: 'Shared', time: { created: 1, updated: 2 } }),
      unshare: jest.fn().mockResolvedValue({ id: 'session-1', title: 'Shared', time: { created: 1, updated: 2 } }),
      summarize: jest.fn().mockResolvedValue(true),
      message: jest.fn().mockResolvedValue(sessionMessage),
      deleteMessage: jest.fn().mockResolvedValue(true),
      command: jest.fn().mockResolvedValue(sessionMessage),
      shell: jest.fn().mockResolvedValue(sessionMessage),
    });
    const partSdk = createPartSdk({
      update: jest.fn().mockResolvedValue(updatedPart),
      delete: jest.fn().mockResolvedValue(true),
    });
    const host = createHost(sessionSdk, partSdk, {
      getSessionInfo: jest.fn().mockResolvedValue({
        id: 'session-1',
        title: 'Shared',
        revert: { messageID: 'message-1', partID: 'part-1' },
        time: { created: 1, updated: 2 },
      }),
    });
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    await expect(orchestrator.getSessionRevertState('session-1')).resolves.toEqual({
      messageID: 'message-1',
      partID: 'part-1',
    });
    await expect(orchestrator.initializeSession('session-1', 'openai', 'gpt-5', 'message-1')).resolves.toBe(true);
    await expect(orchestrator.getSessionChildren('session-1')).resolves.toHaveLength(1);
    await expect(orchestrator.shareSession('session-1')).resolves.toMatchObject({ id: 'session-1' });
    await expect(orchestrator.unshareSession('session-1')).resolves.toMatchObject({ id: 'session-1' });
    await expect(orchestrator.summarizeSession('session-1', 'openai', 'gpt-5')).resolves.toBe(true);
    await expect(orchestrator.getSessionMessage('session-1', 'message-1')).resolves.toEqual(sessionMessage);
    await expect(orchestrator.deleteSessionMessage('session-1', 'message-1')).resolves.toBe(true);
    await expect(orchestrator.runSessionCommand('session-1', {
      command: 'test',
      arguments: '--help',
    })).resolves.toEqual(sessionMessage);
    await expect(orchestrator.runSessionShell('session-1', {
      agent: 'build',
      command: 'echo hi',
    })).resolves.toEqual(sessionMessage);
    await expect(orchestrator.updateMessagePart('session-1', 'message-1', 'part-1', updatedPart)).resolves.toEqual(updatedPart);
    await expect(orchestrator.deleteMessagePart('session-1', 'message-1', 'part-1')).resolves.toBe(true);
});
