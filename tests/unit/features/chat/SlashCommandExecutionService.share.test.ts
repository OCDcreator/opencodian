import * as obsidian from 'obsidian';

import type { Conversation } from '../../../../src/core/types';
import {
  type SlashCommandExecutionHost,
  SlashCommandExecutionService,
} from '../../../../src/features/chat/services/SlashCommandExecutionService';
import { t } from '../../../../src/i18n';

type MockedSlashCommandExecutionHost = {
  [Key in keyof SlashCommandExecutionHost]:
    SlashCommandExecutionHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SlashCommandExecutionHost[Key];
};

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    title: 'Sprint review',
    createdAt: 1,
    updatedAt: 2,
    openCodeSessionId: 'session-1',
    messages: [],
    ...overrides,
  };
}

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
    runSessionCommand: jest.fn().mockResolvedValue(undefined),
    startConversationSyncLoop: jest.fn(),
    runCompactSession: jest.fn().mockResolvedValue(true),
    revertSession: jest.fn().mockResolvedValue(true),
    unrevertSession: jest.fn().mockResolvedValue(true),
    shareSession: jest.fn().mockResolvedValue('https://share.example.com/s/test'),
    unshareSession: jest.fn().mockResolvedValue(true),
    createNewConversation: jest.fn().mockResolvedValue(undefined),
    syncVisibleConversationInBackground: jest.fn().mockResolvedValue(undefined),
    notifySlashCommandFailed: jest.fn(),
    ...overrides,
  };
}

describe('SlashCommandExecutionService share/unshare backend gates', () => {
  let noticeSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    noticeSpy.mockRestore();
  });

  it('share reports no session for Claude conversations with a backend session id', async () => {
    const conversation = createConversation({
      backend: 'claude-code',
      backendSessionId: 'claude-session-1',
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/share')).resolves.toBe(true);

    expect(host.shareSession).not.toHaveBeenCalled();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.share.noSession'));
  });

  it('unshare reports no session for Claude conversations with a backend session id', async () => {
    const conversation = createConversation({
      backend: 'claude-code',
      backendSessionId: 'claude-session-1',
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/unshare')).resolves.toBe(true);

    expect(host.unshareSession).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.unshare.noSession'));
  });

  it('compact reports no session for Claude conversations with a backend session id', async () => {
    const conversation = createConversation({
      backend: 'claude-code',
      backendSessionId: 'claude-session-1',
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/compact')).resolves.toBe(true);

    expect(host.runCompactSession).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.compact.noSession'));
  });
});
