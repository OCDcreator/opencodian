import {
  expandSessionCommandTemplate,
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
  requireCapability?: jest.Mock<{ supported: boolean; reason?: string }, [string]>;
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

it('expands supported session command placeholders with stable path normalization', () => {
    expect(expandSessionCommandTemplate([
      'Vault: {{vault_path}}',
      'Note: {{current_note_path}}',
      'Selection: {{current_selection}}',
      'Context:',
      '{{external_context_paths}}',
      'Title: {{conversation_title}}',
    ].join('\n'), {
      vaultPath: 'C:\\Vault\\Project',
      currentNotePath: 'notes\\today.md',
      currentSelection: 'Keep {{vault_path}} literal',
      externalContextPaths: ['notes\\alpha.md', 'docs/beta.md', ''],
      conversationTitle: 'Sprint {{current_note_path}}',
    })).toBe([
      'Vault: C:/Vault/Project',
      'Note: notes/today.md',
      'Selection: Keep {{vault_path}} literal',
      'Context:',
      'notes/alpha.md',
      'docs/beta.md',
      'Title: Sprint {{current_note_path}}',
    ].join('\n'));
  });

it('builds context usage from session info, messages, and model catalog', async () => {
    const sessionSdk = createSessionSdk();
    const host = createHost(sessionSdk, createPartSdk(), {
      getSessionInfo: jest.fn().mockResolvedValue({
        id: 'session-1',
        title: 'Planning session',
        time: { created: 1000, updated: 9000 },
      }),
      getSessionMessages: jest.fn().mockResolvedValue([
        { info: { id: 'assistant-1', sessionID: 'session-1', role: 'assistant',
            providerID: 'openai', modelID: 'gpt-4.1', cost: 0.1,
            tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 2000 } }, parts: [] },
        { info: { id: 'assistant-2', sessionID: 'session-1', role: 'assistant',
            providerID: 'openai', modelID: 'gpt-5', cost: 0.2,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 3000 } }, parts: [] },
        { info: { id: 'assistant-3', sessionID: 'session-1', role: 'assistant',
            providerID: 'openai', modelID: 'gpt-5', cost: 0.3,
            tokens: { input: 40, output: 20, reasoning: 10, cache: { read: 5, write: 5 } },
            time: { created: 4000 } }, parts: [] },
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

  it('uses session-level tokens and model when available, skipping message scan', async () => {
    const sessionSdk = createSessionSdk();
    const host = createHost(sessionSdk, createPartSdk(), {
      getSessionInfo: jest.fn().mockResolvedValue({
        id: 'session-fast',
        title: 'Fast path',
        cost: 0.42,
        tokens: { input: 100, output: 50, reasoning: 5, cache: { read: 10, write: 2 } },
        model: { id: 'gpt-5', providerID: 'openai' },
        time: { created: 1000, updated: 5000 },
      }),
      getSessionMessages: jest.fn().mockResolvedValue([]),
      getAvailableModels: jest.fn().mockResolvedValue({
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            models: [{ id: 'gpt-5', name: 'GPT-5', contextWindow: 400000 }],
          },
        ],
        defaults: {},
      }),
    });
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    const snapshot = await orchestrator.getSessionContextUsageSnapshot('session-fast');

    expect(snapshot).toMatchObject({
      sessionId: 'session-fast',
      sessionTitle: 'Fast path',
      providerId: 'openai',
      providerName: 'OpenAI',
      modelId: 'gpt-5',
      modelName: 'GPT-5',
      contextWindow: 400000,
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 5,
      cacheReadTokens: 10,
      cacheWriteTokens: 2,
      totalCost: 0.42,
    });
    expect(host.getSessionMessages).not.toHaveBeenCalled();
  });

  it('falls back to message scan when session has no tokens or model', async () => {
    const sessionSdk = createSessionSdk();
    const host = createHost(sessionSdk, createPartSdk(), {
      getSessionInfo: jest.fn().mockResolvedValue({
        id: 'session-slow',
        title: 'Fallback',
        time: { created: 1000, updated: 9000 },
      }),
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'a1', sessionID: 'session-slow', role: 'assistant',
            providerID: 'openai', modelID: 'gpt-5', cost: 0.1,
            tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 2000 },
          },
          parts: [],
        },
      ]),
      getAvailableModels: jest.fn().mockResolvedValue({
        providers: [{ id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-5', name: 'GPT-5', contextWindow: 400000 }] }],
        defaults: {},
      }),
    });
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    const snapshot = await orchestrator.getSessionContextUsageSnapshot('session-slow');

    expect(snapshot).toMatchObject({
      sessionId: 'session-slow',
      modelId: 'gpt-5',
      totalCost: 0.1,
    });
    expect(host.getSessionMessages).toHaveBeenCalledTimes(1);
  });

  it('carries upstream compaction metadata through local session contracts', async () => {
    const summaryMessage: SessionMessage = {
      info: { id: 'assistant-summary', sessionID: 'session-1', role: 'assistant',
        summary: true, time: { created: 5000 } },
      parts: [{
        id: 'part-compaction', sessionID: 'session-1', messageID: 'user-compaction',
        type: 'compaction', auto: true, overflow: true, tail_start_id: 'message-tail',
        metadata: { compaction_continue: true },
      }],
    };
    const sessionSdk = createSessionSdk();
    const host = createHost(sessionSdk, createPartSdk(), {
      getSessionInfo: jest.fn().mockResolvedValue({
        id: 'session-1',
        title: 'Compacting session',
        time: {
          created: 1000,
          updated: 9000,
          compacting: 7000,
        },
      }),
      getSessionMessages: jest.fn().mockResolvedValue([summaryMessage]),
      getAvailableModels: jest.fn().mockResolvedValue({
        providers: [],
        defaults: {},
      }),
    });
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    const snapshot = await orchestrator.getSessionContextUsageSnapshot('session-1');

    expect(summaryMessage.info.summary).toBe(true);
    expect(summaryMessage.parts[0]).toMatchObject({
      type: 'compaction',
      auto: true,
      overflow: true,
      tail_start_id: 'message-tail',
      metadata: {
        compaction_continue: true,
      },
    });
    expect(snapshot).toMatchObject({
      sessionId: 'session-1',
      sessionTitle: 'Compacting session',
      compactingAt: 7000,
    });
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

it('expands session command arguments before delegating to the SDK', async () => {
    const sessionMessage: SessionMessage = {
      info: {
        id: 'message-2',
        sessionID: 'session-1',
        role: 'assistant',
        time: { created: 2 },
      },
      parts: [],
    };
    const sessionSdk = createSessionSdk({
      command: jest.fn().mockResolvedValue(sessionMessage),
      shell: jest.fn().mockResolvedValue(sessionMessage),
    });
    const orchestrator = new OpenCodeSessionControlOrchestrator(
      createHost(sessionSdk, createPartSdk()),
    );
    const syntheticParts = [
      {
        id: 'part-plugin-1',
        type: 'text',
        text: 'Injected plugin prompt',
        synthetic: true,
        metadata: {
          source: 'plugin',
          pluginName: 'opencode-plugin-x',
        },
      },
    ];

    await expect(orchestrator.runSessionCommand('session-1', {
      command: ' review ',
      arguments: [
        'Vault={{vault_path}}',
        'Note={{current_note_path}}',
        'Selection={{current_selection}}',
        'Context={{external_context_paths}}',
        'Title={{conversation_title}}',
      ].join('\n'),
      placeholderContext: {
        vaultPath: '/vault',
        currentNotePath: 'notes/plan.md',
        externalContextPaths: ['notes/alpha.md', 'notes/beta.md'],
      },
      agent: ' build ',
      model: ' openai/gpt-5 ',
      messageID: ' message-1 ',
      variant: ' high ',
      parts: syntheticParts,
    })).resolves.toEqual(sessionMessage);

    await expect(orchestrator.runSessionShell('session-1', {
      agent: ' build ',
      command: ' npm test ',
      model: { providerID: 'openai', modelID: 'gpt-5' },
      messageID: ' shell-message-1 ',
    })).resolves.toEqual(sessionMessage);

    expect(sessionSdk.command).toHaveBeenCalledWith({
      sessionID: 'session-1',
      command: 'review',
      arguments: [
        'Vault=/vault',
        'Note=notes/plan.md',
        'Selection=',
        'Context=notes/alpha.md',
        'notes/beta.md',
        'Title=',
      ].join('\n'),
      agent: 'build',
      model: 'openai/gpt-5',
      messageID: 'message-1',
      variant: 'high',
      parts: syntheticParts,
    });
    expect(sessionSdk.command.mock.calls[0]?.[0]).not.toHaveProperty('placeholderContext');
    expect(sessionSdk.command.mock.calls[0]?.[0].parts).not.toBe(syntheticParts);
    expect(sessionSdk.command.mock.calls[0]?.[0].parts?.[0]).toEqual(syntheticParts[0]);
    expect(sessionSdk.shell).toHaveBeenCalledWith({
      sessionID: 'session-1',
      agent: 'build',
      command: 'npm test',
      model: { providerID: 'openai', modelID: 'gpt-5' },
      messageID: 'shell-message-1',
    });
  });

it('isCapabilitySupported returns true when the host reports the capability as supported', () => {
    const host = createHost(createSessionSdk(), createPartSdk(), {
      requireCapability: jest.fn(() => ({ supported: true })),
    });
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    expect(orchestrator.isCapabilitySupported('v2.session.history')).toBe(true);
    expect(host.requireCapability).toHaveBeenCalledWith('v2.session.history');
  });

it('isCapabilitySupported returns false when the host reports the capability as unsupported', () => {
    const host = createHost(createSessionSdk(), createPartSdk(), {
      requireCapability: jest.fn(() => ({
        supported: false,
        reason: 'The connected OpenCode server does not expose this endpoint.',
      })),
    });
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    expect(orchestrator.isCapabilitySupported('v2.session.events')).toBe(false);
  });

it('isCapabilitySupported defaults to true when the host omits requireCapability (backward compat)', () => {
    const host = createHost(createSessionSdk(), createPartSdk());
    const orchestrator = new OpenCodeSessionControlOrchestrator(host);

    expect(orchestrator.isCapabilitySupported('v2.session.message')).toBe(true);
  });
