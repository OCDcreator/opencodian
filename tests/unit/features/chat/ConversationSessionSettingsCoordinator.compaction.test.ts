import type {
  Conversation,
  ConversationSessionSettings,
} from '../../../../src/core/types';
import {
  ConversationSessionSettingsCoordinator,
  type ConversationSessionSettingsCoordinatorHost,
} from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';

function createConversation(
  overrides?: ConversationSessionSettings,
): Conversation {
  return {
    id: 'conversation-1',
    title: 'Session Settings',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [],
    sessionSettings: overrides,
  };
}

function createCoordinator(options?: {
  currentConversation?: Conversation | null;
  backendApplyResult?: { status: 'applied' | 'deferred'; reason?: string };
  projectConfigApplyResult?: { status: 'applied' | 'deferred' | 'skipped'; reason?: string };
}) {
  const applyCompactionConfig = jest.fn().mockResolvedValue(
    options?.backendApplyResult ?? { status: 'applied' },
  );
  const reapplyCompactionConfigFromProjectConfig = jest.fn().mockResolvedValue(
    options?.projectConfigApplyResult ?? { status: 'skipped' },
  );
  const refreshCurrentSessionState = jest.fn().mockResolvedValue(undefined);
  const updateCompactionConfig = jest.fn().mockResolvedValue(undefined);
  const saveConversation = jest.fn().mockResolvedValue(undefined);
  const host = {
    app: {} as never,
    getCurrentConversation: jest.fn().mockReturnValue(options?.currentConversation ?? null),
    getSessionSettingsDefaults: jest.fn().mockReturnValue({
      autoCompactionEnabled: true,
      compactionReservedTokens: 10_000,
      chatFontSizePx: 13,
    }),
    getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
    applyCompactionConfig,
    reapplyCompactionConfigFromProjectConfig,
    refreshCurrentSessionState,
    getOpencodeConfigManager: jest.fn().mockReturnValue({
      updateCompactionConfig,
    }),
    saveConversation,
    showNotice: jest.fn(),
  } as jest.Mocked<ConversationSessionSettingsCoordinatorHost> & {
    reapplyCompactionConfigFromProjectConfig: jest.Mock;
  };

  return {
    coordinator: new ConversationSessionSettingsCoordinator(host),
    host,
    reapplyCompactionConfigFromProjectConfig,
    refreshCurrentSessionState,
    updateCompactionConfig,
  };
}

describe('ConversationSessionSettingsCoordinator compaction fallback', () => {
  it('falls back to deferred local compaction config without claiming backend apply', async () => {
    const conversation = createConversation();
    const {
      coordinator,
      host,
      refreshCurrentSessionState,
      reapplyCompactionConfigFromProjectConfig,
      updateCompactionConfig,
    } = createCoordinator({
      currentConversation: conversation,
      backendApplyResult: {
        status: 'deferred',
        reason: 'config.update unavailable',
      },
    });

    await coordinator.saveConversationOverrides(conversation, {
      autoCompactionEnabled: false,
      compactionReservedTokens: 12_000,
    });

    expect(updateCompactionConfig).toHaveBeenCalledWith({
      auto: false,
      reserved: 12_000,
    });
    expect(reapplyCompactionConfigFromProjectConfig).toHaveBeenCalledWith({
      auto: false,
      reserved: 12_000,
    });
    expect(refreshCurrentSessionState).not.toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith(
      'Session settings saved; compaction will apply after the OpenCode backend reloads',
    );
  });

  it('activates the project-config fallback immediately when the scoped backend can re-read it', async () => {
    const conversation = createConversation();
    const {
      coordinator,
      host,
      refreshCurrentSessionState,
      reapplyCompactionConfigFromProjectConfig,
      updateCompactionConfig,
    } = createCoordinator({
      currentConversation: conversation,
      backendApplyResult: {
        status: 'deferred',
        reason: 'resolved config mismatch',
      },
      projectConfigApplyResult: {
        status: 'applied',
      },
    });

    await coordinator.saveConversationOverrides(conversation, {
      autoCompactionEnabled: false,
      compactionReservedTokens: 14_000,
    });

    expect(updateCompactionConfig).toHaveBeenCalledWith({
      auto: false,
      reserved: 14_000,
    });
    expect(reapplyCompactionConfigFromProjectConfig).toHaveBeenCalledWith({
      auto: false,
      reserved: 14_000,
    });
    expect(refreshCurrentSessionState).toHaveBeenCalledTimes(1);
    expect(host.showNotice).toHaveBeenCalledWith('Session settings saved');
  });
});
