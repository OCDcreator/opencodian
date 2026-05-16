import type {
  Conversation,
  OpencodeCommandConfigRecord,
} from '../../../../src/core/types';
import type { FocusContextPreview } from '../../../../src/features/chat/composerContext';
import {
  createSlashCommandExecutionHost,
  type SlashCommandExecutionHost,
  SlashCommandExecutionService,
} from '../../../../src/features/chat/services/SlashCommandExecutionService';

type SlashCommandExecutionHostDependencies = Parameters<
  typeof createSlashCommandExecutionHost
>[0];

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    title: 'Sprint review',
    createdAt: 1,
    updatedAt: 2,
    openCodeSessionId: 'session-1',
    messages: [],
    externalContextPaths: ['notes\\alpha.md', 'docs/beta.md'],
    ...overrides,
  };
}

type MockedSlashCommandExecutionHost = {
  [Key in keyof SlashCommandExecutionHost]:
    SlashCommandExecutionHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SlashCommandExecutionHost[Key];
};

function createHost(
  overrides: Partial<MockedSlashCommandExecutionHost> = {},
): MockedSlashCommandExecutionHost {
  return {
    ensureConversationReady: jest.fn().mockResolvedValue(createConversation()),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    ensureTabRuntime: jest.fn().mockReturnValue(true),
    isTabForegroundBusy: jest.fn().mockReturnValue(false),
    notifyForegroundBusy: jest.fn(),
    getServerAvailability: jest.fn().mockResolvedValue('running'),
    refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
    ensureServerReadyForChat: jest.fn().mockResolvedValue(true),
    getProjectCommands: jest.fn().mockResolvedValue({}),
    getRuntimeCommands: jest.fn().mockResolvedValue([]),
    getRuntimeSkills: jest.fn().mockResolvedValue([]),
    getMdFileCommands: jest.fn().mockResolvedValue([]),
    getSlashCommandSkillMode: jest.fn().mockReturnValue('direct'),
    getVaultPath: jest.fn().mockReturnValue('/vault'),
    refreshActiveFocusContextPreview: jest.fn(),
    getActiveFocusContextPreview: jest.fn().mockReturnValue(null),
    runSessionCommand: jest.fn().mockResolvedValue({
      info: {
        id: 'message-1',
        role: 'assistant',
        sessionID: 'session-1',
        time: { created: 3 },
      },
      parts: [],
    }),
    startConversationSyncLoop: jest.fn(),
    runCompactSession: jest.fn().mockResolvedValue(true),
    syncVisibleConversationInBackground: jest.fn().mockResolvedValue(undefined),
    notifySlashCommandFailed: jest.fn(),
    ...overrides,
  };
}

type MockedSlashCommandExecutionHostDependencies = {
  [Key in keyof SlashCommandExecutionHostDependencies]:
    SlashCommandExecutionHostDependencies[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SlashCommandExecutionHostDependencies[Key] extends null
        ? null
        : SlashCommandExecutionHostDependencies[Key] extends object
          ? MockedObject<SlashCommandExecutionHostDependencies[Key]>
          : SlashCommandExecutionHostDependencies[Key];
};

type MockedObject<T> = {
  [Key in keyof T]: T[Key] extends (...args: infer Args) => infer Result
    ? jest.Mock<Result, Args>
    : T[Key] extends object | null
      ? T[Key]
      : T[Key];
};

function createDependencies(
  overrides: Partial<MockedSlashCommandExecutionHostDependencies> = {},
): MockedSlashCommandExecutionHostDependencies {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(createConversation()),
    createNewConversation: jest.fn().mockResolvedValue(undefined),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    ensureTabRuntimeState: jest.fn().mockReturnValue({ id: 'tab-1' }),
    isTabForegroundBusy: jest.fn().mockReturnValue(false),
    notifyForegroundBusy: jest.fn(),
    getServerAvailability: jest.fn().mockResolvedValue('running'),
    chatHeaderPresenter: {
      refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
    },
    ensureServerReadyForChat: jest.fn().mockResolvedValue(true),
    opencodeConfigManager: {
      getCommandConfig: jest.fn().mockResolvedValue({}),
      getConfigDir: jest.fn().mockReturnValue('/vault/.opencode'),
    },
    getSlashCommandSkillMode: jest.fn().mockReturnValue('direct'),
    openCodeServiceSdk: {
      command: {
        list: jest.fn().mockResolvedValue([]),
      },
      app: {
        skills: jest.fn().mockResolvedValue([]),
      },
    },
    openCodeService: {
      runSessionCommand: jest.fn().mockResolvedValue(undefined),
    },
    runCompactSession: jest.fn().mockResolvedValue(true),
    getVaultPath: jest.fn().mockReturnValue('/vault'),
    composerContextViewFacade: {
      refreshActiveFocusContextPreview: jest.fn(),
    },
    getTabRuntimeState: jest.fn().mockReturnValue({
      focusContextPreview: null,
    }),
    conversationSyncBridgePorts: {
      getLoopControl: jest.fn().mockReturnValue({
        startConversationSyncLoop: jest.fn(),
      }),
      getVisibleSyncFollowUp: jest.fn().mockReturnValue({
        syncVisibleConversationInBackground: jest.fn().mockResolvedValue(undefined),
      }),
    },
    notifySlashCommandFailed: jest.fn(),
    ...overrides,
  };
}

// eslint-disable-next-line max-lines-per-function -- Slash command execution scenarios share one host fixture for readable call-order assertions.
describe('SlashCommandExecutionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('leaves non-slash input on the normal send path', async () => {
    const host = createHost();
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('Explain the roadmap')).resolves.toBe(false);

    expect(host.getProjectCommands).not.toHaveBeenCalled();
    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });

  it('returns false for unknown slash commands so regular chat can handle the text', async () => {
    const host = createHost({
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'known', source: 'command' },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/missing keep this literal')).resolves.toBe(false);

    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });

  it('runs markdown file commands as regular messages when no runtime or project command overrides them', async () => {
    const host = createHost({
      getRuntimeCommands: jest.fn().mockResolvedValue([]),
      getMdFileCommands: jest.fn().mockResolvedValue([
        {
          id: 'docs:review',
          template: 'Review $ARGUMENTS in $1',
          description: 'Review docs',
          filePath: '/vault/.opencode/commands/docs/review.md',
        },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/docs:review notes/plan.md carefully'))
      .resolves.toBe('Review notes/plan.md carefully in notes/plan.md');
    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });

  it('clears markdown file command placeholders when arguments are missing', async () => {
    const host = createHost({
      getRuntimeCommands: jest.fn().mockResolvedValue([]),
      getMdFileCommands: jest.fn().mockResolvedValue([
        {
          id: 'draft',
          template: 'Draft $TITLE with $ARGUMENTS and $1.',
          description: 'Draft docs',
          filePath: '/vault/.opencode/commands/draft.md',
        },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/draft'))
      .resolves.toBe('Draft  with  and .');
    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });

  it('does not let markdown file commands override project command IDs', async () => {
    const host = createHost({
      getProjectCommands: jest.fn().mockResolvedValue({ review: { template: 'Project review' } }),
      getRuntimeCommands: jest.fn().mockResolvedValue([]),
      getMdFileCommands: jest.fn().mockResolvedValue([
        {
          id: 'review',
          template: 'Markdown review',
          description: '',
          filePath: '/vault/.opencode/commands/review.md',
        },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/review')).resolves.toBe(false);

    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });

  it('executes project commands after the runtime catalog confirms they are available', async () => {
    const callOrder: string[] = [];
    const conversation = createConversation();
    const focusPreview: FocusContextPreview = {
      kind: 'selection',
      path: 'notes/plan.md',
      label: 'plan.md:4-7',
      lineRange: {
        startLine: 4,
        endLine: 7,
      },
      textSnapshot: 'Selected note text',
    };
    const projectCommands: OpencodeCommandConfigRecord = {
      review: {
        template: 'Review {{current_note_path}}',
      },
    };
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
      getProjectCommands: jest.fn().mockResolvedValue(projectCommands),
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'review', source: 'command' },
      ]),
      getActiveFocusContextPreview: jest.fn().mockReturnValue(focusPreview),
      startConversationSyncLoop: jest.fn().mockImplementation(() => {
        callOrder.push('startConversationSyncLoop');
      }),
      runSessionCommand: jest.fn().mockImplementation(async () => {
        callOrder.push('runSessionCommand');
        return {
          info: {
            id: 'message-1',
            role: 'assistant',
            sessionID: 'session-1',
            time: { created: 3 },
          },
          parts: [],
        };
      }),
      syncVisibleConversationInBackground: jest.fn().mockImplementation(async () => {
        callOrder.push('syncVisibleConversationInBackground');
      }),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(
      service.tryRunSlashCommand('/review Include {{current_selection}}'),
    ).resolves.toBe(true);

    expect(host.getRuntimeCommands).toHaveBeenCalledTimes(1);
    expect(host.refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);
    expect(host.runSessionCommand).toHaveBeenCalledWith('session-1', {
      command: 'review',
      arguments: 'Include {{current_selection}}',
      placeholderContext: {
        vaultPath: '/vault',
        currentNotePath: 'notes/plan.md',
        currentSelection: 'Selected note text',
        externalContextPaths: ['notes\\alpha.md', 'docs/beta.md'],
        conversationTitle: 'Sprint review',
      },
    });
    expect(callOrder).toEqual([
      'startConversationSyncLoop',
      'runSessionCommand',
      'syncVisibleConversationInBackground',
    ]);
  });

  it('lets project compact commands override the built-in compaction handler', async () => {
    const host = createHost({
      getProjectCommands: jest.fn().mockResolvedValue({ compact: { template: 'Project compact' } }),
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'compact', source: 'command' },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/compact aggressively')).resolves.toBe(true);

    expect(host.runCompactSession).not.toHaveBeenCalled();
    expect(host.runSessionCommand).toHaveBeenCalledWith('session-1', expect.objectContaining({
      command: 'compact',
      arguments: 'aggressively',
    }));
  });

  it('uses built-in compaction only when runtime catalog has no project override', async () => {
    const host = createHost({
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'compact', source: 'command' },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/compact')).resolves.toBe(true);

    expect(host.runCompactSession).toHaveBeenCalledWith('session-1');
    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });

  it('executes runtime commands and direct skill commands while ignoring MCP entries', async () => {
    const host = createHost({
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'ask-docs', source: 'mcp' },
        { name: 'skill-review', source: 'skill' },
        { name: 'build', source: 'command' },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/ask-docs query')).resolves.toBe(false);
    await expect(service.tryRunSlashCommand('/skill-review note.md')).resolves.toBe(true);
    await expect(service.tryRunSlashCommand('/build --fast')).resolves.toBe(true);

    expect(host.runSessionCommand).toHaveBeenCalledTimes(2);
    expect(host.runSessionCommand).toHaveBeenNthCalledWith(1, 'session-1', expect.objectContaining({
      command: 'skill-review',
      arguments: 'note.md',
    }));
    expect(host.runSessionCommand).toHaveBeenNthCalledWith(2, 'session-1', expect.objectContaining({
      command: 'build',
      arguments: '--fast',
    }));
  });

  it('runs skill commands through /skills prefix mode and suppresses direct skill execution', async () => {
    const host = createHost({
      getSlashCommandSkillMode: jest.fn().mockReturnValue('skills-command'),
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'skill-review', source: 'skill' },
        { name: 'build', source: 'command' },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/skill-review note.md')).resolves.toBe(false);
    await expect(service.tryRunSlashCommand('/skills skill-review note.md')).resolves.toBe(true);

    expect(host.runSessionCommand).toHaveBeenCalledTimes(1);
    expect(host.runSessionCommand).toHaveBeenCalledWith('session-1', expect.objectContaining({
      command: 'skill-review',
      arguments: 'note.md',
    }));
  });

  it('treats runtime commands backed by runtime skills as /skills-only entries in prefixed mode', async () => {
    const host = createHost({
      getSlashCommandSkillMode: jest.fn().mockReturnValue('skills-command'),
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'x-reader/video', source: 'command' },
      ]),
      getRuntimeSkills: jest.fn().mockResolvedValue([
        { name: 'x-reader/video' },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/x-reader/video https://example.com')).resolves.toBe(false);
    await expect(service.tryRunSlashCommand('/skills x-reader/video https://example.com')).resolves.toBe(true);

    expect(host.runSessionCommand).toHaveBeenCalledTimes(1);
    expect(host.runSessionCommand).toHaveBeenCalledWith('session-1', expect.objectContaining({
      command: 'x-reader/video',
      arguments: 'https://example.com',
    }));
  });

  it('consumes runtime commands without execution when the server readiness check fails', async () => {
    const host = createHost({
      getServerAvailability: jest.fn().mockResolvedValue('offline'),
      ensureServerReadyForChat: jest.fn().mockResolvedValue(false),
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'build', source: 'command' },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/build')).resolves.toBe(true);

    expect(host.ensureServerReadyForChat).toHaveBeenCalledWith('offline');
    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });

  it('returns false for project-only commands until the runtime loads them', async () => {
    const host = createHost({
      getProjectCommands: jest.fn().mockResolvedValue({
        review: { template: 'Review' },
      }),
      getRuntimeCommands: jest.fn().mockResolvedValue([]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/review')).resolves.toBe(false);

    expect(host.getServerAvailability).toHaveBeenCalledTimes(1);
    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });

  it('consumes known commands through the foreground busy notice path', async () => {
    const host = createHost({
      getProjectCommands: jest.fn().mockResolvedValue({
        review: { template: 'Review' },
      }),
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'review', source: 'command' },
      ]),
      isTabForegroundBusy: jest.fn().mockReturnValue(true),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/review')).resolves.toBe(true);

    expect(host.notifyForegroundBusy).toHaveBeenCalledTimes(1);
    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });
});

describe('createSlashCommandExecutionHost delegation', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('creates a host that delegates simple callbacks to the flat dependency object', async () => {
    const deps = createDependencies();
    const host = createSlashCommandExecutionHost(deps);

    expect(host.getActiveTabId()).toBe('tab-1');
    expect(deps.getActiveTabId).toHaveBeenCalledTimes(1);

    await expect(host.getServerAvailability()).resolves.toBe('running');
    expect(deps.getServerAvailability).toHaveBeenCalledTimes(1);

    await expect(host.refreshServerStatusBadge()).resolves.toBeUndefined();
    expect(deps.chatHeaderPresenter.refreshServerStatusBadge).toHaveBeenCalledTimes(1);
  });

  it('creates a host that initializes a conversation when none exists yet', async () => {
    const createdConversation = createConversation({ id: 'conversation-2' });
    let currentConversation: Conversation | null = null;
    const deps = createDependencies({
      getCurrentConversation: jest.fn().mockImplementation(() => currentConversation),
      createNewConversation: jest.fn().mockImplementation(async () => {
        currentConversation = createdConversation;
      }),
    });
    const host = createSlashCommandExecutionHost(deps);

    await expect(host.ensureConversationReady()).resolves.toBe(createdConversation);

    expect(deps.createNewConversation).toHaveBeenCalledTimes(1);
    expect(deps.getCurrentConversation).toHaveBeenCalledTimes(2);
  });

  it('creates a host that forwards slash command failures to the dependency notifier', () => {
    const deps = createDependencies();
    const host = createSlashCommandExecutionHost(deps);
    const error = new Error('boom');

    host.notifySlashCommandFailed('build', error);

    expect(deps.notifySlashCommandFailed).toHaveBeenCalledWith('build', error);
  });
});
