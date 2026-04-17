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

  it('executes project commands with runtime placeholder context from the active conversation', async () => {
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

    expect(host.getRuntimeCommands).not.toHaveBeenCalled();
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

  it('executes runtime commands while ignoring MCP and skill catalog entries', async () => {
    const host = createHost({
      getRuntimeCommands: jest.fn().mockResolvedValue([
        { name: 'ask-docs', source: 'mcp' },
        { name: 'skill-review', source: 'skill' },
        { name: 'build', source: 'command' },
      ]),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/ask-docs query')).resolves.toBe(false);
    await expect(service.tryRunSlashCommand('/build --fast')).resolves.toBe(true);

    expect(host.runSessionCommand).toHaveBeenCalledTimes(1);
    expect(host.runSessionCommand).toHaveBeenCalledWith('session-1', expect.objectContaining({
      command: 'build',
      arguments: '--fast',
    }));
  });

  it('consumes known commands without execution when the server readiness check fails', async () => {
    const host = createHost({
      getProjectCommands: jest.fn().mockResolvedValue({
        review: { template: 'Review' },
      }),
      getServerAvailability: jest.fn().mockResolvedValue('offline'),
      ensureServerReadyForChat: jest.fn().mockResolvedValue(false),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/review')).resolves.toBe(true);

    expect(host.ensureServerReadyForChat).toHaveBeenCalledWith('offline');
    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });

  it('consumes known commands through the foreground busy notice path', async () => {
    const host = createHost({
      getProjectCommands: jest.fn().mockResolvedValue({
        review: { template: 'Review' },
      }),
      isTabForegroundBusy: jest.fn().mockReturnValue(true),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/review')).resolves.toBe(true);

    expect(host.notifyForegroundBusy).toHaveBeenCalledTimes(1);
    expect(host.runSessionCommand).not.toHaveBeenCalled();
  });
});
