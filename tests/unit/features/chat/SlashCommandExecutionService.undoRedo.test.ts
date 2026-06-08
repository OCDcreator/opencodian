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
    externalContextPaths: ['notes\\alpha.md', 'docs/beta.md'],
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

describe('SlashCommandExecutionService undo/redo', () => {
  let noticeSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    noticeSpy.mockRestore();
  });

  // ── /undo tests ──────────────────────────────────────────────

  it('undo succeeds with the latest user source message', async () => {
    const conversation = createConversation({
      messages: [
        { role: 'user', sourceMessageId: 'msg-user-1' } as Conversation['messages'][number],
        { role: 'assistant', sourceMessageId: 'msg-assistant-1' } as Conversation['messages'][number],
        { role: 'user', sourceMessageId: 'msg-user-2' } as Conversation['messages'][number],
      ],
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/undo')).resolves.toBe(true);

    expect(host.revertSession).toHaveBeenCalledWith('session-1', 'msg-user-2');
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.undo.success'));
    expect(host.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);
  });

  it('undo reports no user message when no user source message exists', async () => {
    const conversation = createConversation({
      messages: [
        { role: 'user' } as Conversation['messages'][number],
        { role: 'assistant', sourceMessageId: 'msg-assistant-1' } as Conversation['messages'][number],
      ],
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/undo')).resolves.toBe(true);

    expect(host.revertSession).not.toHaveBeenCalled();
    expect(host.syncVisibleConversationInBackground).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.undo.noUserMessage'));
  });

  it('undo consumes the command when no conversation is ready', async () => {
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(null),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/undo')).resolves.toBe(true);

    expect(host.revertSession).not.toHaveBeenCalled();
    expect(host.syncVisibleConversationInBackground).not.toHaveBeenCalled();
  });

  it('undo reports no session when the conversation has no backend session id', async () => {
    const conversation = createConversation({
      openCodeSessionId: undefined,
      backendSessionId: undefined,
      acpSessionId: undefined,
      messages: [{ role: 'user', sourceMessageId: 'msg-user-1' } as Conversation['messages'][number]],
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/undo')).resolves.toBe(true);

    expect(host.revertSession).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.undo.noSession'));
  });

  it('undo reports no session for non-opencode conversations', async () => {
    const conversation = createConversation({
      backend: 'claude-code',
      messages: [{ role: 'user', sourceMessageId: 'msg-user-1' } as Conversation['messages'][number]],
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/undo')).resolves.toBe(true);

    expect(host.revertSession).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.undo.noSession'));
  });

  it('undo reports failure without syncing when revert returns false', async () => {
    const conversation = createConversation({
      messages: [{ role: 'user', sourceMessageId: 'msg-user-1' } as Conversation['messages'][number]],
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
      revertSession: jest.fn().mockResolvedValue(false),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/undo')).resolves.toBe(true);

    expect(host.revertSession).toHaveBeenCalledWith('session-1', 'msg-user-1');
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.undo.failed'));
    expect(host.syncVisibleConversationInBackground).not.toHaveBeenCalled();
  });

  it('undo reports failure when revert throws', async () => {
    const conversation = createConversation({
      messages: [{ role: 'user', sourceMessageId: 'msg-user-1' } as Conversation['messages'][number]],
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
      revertSession: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/undo')).resolves.toBe(true);

    expect(host.revertSession).toHaveBeenCalledWith('session-1', 'msg-user-1');
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.undo.failed'));
    expect(host.syncVisibleConversationInBackground).not.toHaveBeenCalled();
  });

  // ── /redo tests ──────────────────────────────────────────────

  it('redo succeeds for the active opencode session', async () => {
    const host = createHost();
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/redo')).resolves.toBe(true);

    expect(host.unrevertSession).toHaveBeenCalledWith('session-1');
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.redo.success'));
    expect(host.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);
  });

  it('redo consumes the command when no conversation is ready', async () => {
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(null),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/redo')).resolves.toBe(true);

    expect(host.unrevertSession).not.toHaveBeenCalled();
    expect(host.syncVisibleConversationInBackground).not.toHaveBeenCalled();
  });

  it('redo reports no session when the conversation has no backend session id', async () => {
    const conversation = createConversation({
      openCodeSessionId: undefined,
      backendSessionId: undefined,
      acpSessionId: undefined,
    });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/redo')).resolves.toBe(true);

    expect(host.unrevertSession).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.redo.noSession'));
  });

  it('redo reports no session for non-opencode conversations', async () => {
    const conversation = createConversation({ backend: 'claude-code' });
    const host = createHost({
      ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/redo')).resolves.toBe(true);

    expect(host.unrevertSession).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.redo.noSession'));
  });

  it('redo reports failure without syncing when unrevert returns false', async () => {
    const host = createHost({
      unrevertSession: jest.fn().mockResolvedValue(false),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/redo')).resolves.toBe(true);

    expect(host.unrevertSession).toHaveBeenCalledWith('session-1');
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.redo.failed'));
    expect(host.syncVisibleConversationInBackground).not.toHaveBeenCalled();
  });

  it('redo reports failure when unrevert throws', async () => {
    const host = createHost({
      unrevertSession: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const service = new SlashCommandExecutionService(host);

    await expect(service.tryRunSlashCommand('/redo')).resolves.toBe(true);

    expect(host.unrevertSession).toHaveBeenCalledWith('session-1');
    expect(noticeSpy).toHaveBeenCalledWith(t('slashCommand.redo.failed'));
    expect(host.syncVisibleConversationInBackground).not.toHaveBeenCalled();
  });
});
