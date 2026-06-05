import type { Conversation } from '../../../../../src/core/types';
import {
  type SlashCommandExecutionHost,
  SlashCommandExecutionService,
} from '../../../../../src/features/chat/services/SlashCommandExecutionService';

type MockedSlashCommandExecutionHost = {
  [Key in keyof SlashCommandExecutionHost]: SlashCommandExecutionHost[Key] extends (...args: infer Args) => infer Result
    ? jest.Mock<Result, Args>
    : SlashCommandExecutionHost[Key];
};

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    title: 'Test conversation',
    createdAt: 1,
    updatedAt: 2,
    openCodeSessionId: 'session-1',
    messages: [],
    ...overrides,
  };
}

function createHost(
  conversation: Conversation | Record<string, never> | null,
): MockedSlashCommandExecutionHost {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
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
    getVaultPath: jest.fn().mockReturnValue(null),
    refreshActiveFocusContextPreview: jest.fn(),
    getActiveFocusContextPreview: jest.fn().mockReturnValue(null),
    runSessionCommand: jest.fn().mockResolvedValue(undefined),
    runCompactSession: jest.fn().mockResolvedValue(true),
    revertSession: jest.fn().mockResolvedValue(true),
    unrevertSession: jest.fn().mockResolvedValue(true),
    shareSession: jest.fn().mockResolvedValue('https://example.com/share'),
    unshareSession: jest.fn().mockResolvedValue(true),
    createNewConversation: jest.fn().mockResolvedValue(undefined),
    startConversationSyncLoop: jest.fn(),
    syncVisibleConversationInBackground: jest.fn().mockResolvedValue(undefined),
    notifySlashCommandFailed: jest.fn(),
  };
}

describe('SlashCommandExecutionService Claude passthrough', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns false for slash commands when the current conversation uses claude-code', async () => {
    const host = createHost(createConversation({ backend: 'claude-code' }));
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/any-command args')).resolves.toBe(false);

    expect(host.getRuntimeSkills).not.toHaveBeenCalled();
  });

  it('continues normal slash-command flow when the current conversation uses opencode', async () => {
    const host = createHost(createConversation({ backend: 'opencode' }));
    const service = new SlashCommandExecutionService(host);

    await service.tryRunSlashCommand('/any-command args');

    expect(host.getRuntimeSkills).toHaveBeenCalled();
  });

  it('continues normal slash-command flow when there is no current conversation', async () => {
    const host = createHost(null);
    const service = new SlashCommandExecutionService(host);

    await service.tryRunSlashCommand('/any-command args');

    expect(host.getRuntimeSkills).toHaveBeenCalled();
  });

  it('continues normal slash-command flow when the current conversation has no backend field', async () => {
    const host = createHost({});
    const service = new SlashCommandExecutionService(host);

    await service.tryRunSlashCommand('/any-command args');

    expect(host.getRuntimeSkills).toHaveBeenCalled();
  });
});
