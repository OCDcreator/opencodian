import type {
  Conversation,
  OpencodeCommandConfigRecord,
} from '../../../../src/core/types';
import type { FocusContextPreview } from '../../../../src/features/chat/composerContext';
import {
  type SlashCommandExecutionHost,
  SlashCommandExecutionService,
} from '../../../../src/features/chat/services/SlashCommandExecutionService';

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
    syncVisibleConversationInBackground: jest.fn().mockResolvedValue(undefined),
    notifySlashCommandFailed: jest.fn(),
    ...overrides,
  };
}

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
