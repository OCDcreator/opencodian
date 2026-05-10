import {
  createMessageSendPreparationHost,
  MessageSendPreparationService,
} from '../../../../src/features/chat/services/MessageSendPreparationService';
import {
  createComposerSendContext,
  createConversation,
  createHost,
  createStructuredSendPayload,
  type MockedMessageSendPreparationHost,
  type MockedMessageSendPreparationHostDependencies,
} from './MessageSendPreparationService.testSupport';

describe('MessageSendPreparationService ensureServerReadyForChat', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  function createServerReadinessHost(
    overrides: Partial<MockedMessageSendPreparationHost> = {},
  ): { host: MockedMessageSendPreparationHost; container: { messageEl: HTMLElement; contentEl: HTMLElement } } {
    const container = { messageEl: document.createElement('div'), contentEl: document.createElement('div') };
    const host: MockedMessageSendPreparationHost = {
      ...createHost(createConversation(), [], {
        createAssistantShellContainer: jest.fn().mockReturnValue(container),
        ...overrides,
      }),
    };
    return { host, container };
  }

  function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
    for (const btn of container.querySelectorAll('button')) {
      if (btn.textContent === text) return btn as HTMLButtonElement;
    }
    return null;
  }

  function simulateButtonClickAfterRender(container: HTMLElement, buttonLabel: string): void {
    const btn = findButtonByText(container, buttonLabel);
    if (!btn) {
      const allButtons = container.querySelectorAll('button');
      throw new Error(`Button "${buttonLabel}" not found. Available: ${[...allButtons].map(b => b.textContent).join(', ')}`);
    }
    btn.click();
  }

  it('returns true on successful server start (start button)', async () => {
    const { host, container } = createServerReadinessHost();
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const resultPromise = service.ensureServerReadyForChat('offline');
    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Start service');
    const result = await resultPromise;
    expect(result).toBe(true);
    expect(host.startServer).toHaveBeenCalled();
    expect(host.refreshServerStatusBadge).toHaveBeenCalled();
    expect(host.refreshSettingsTabStatus).toHaveBeenCalled();
    expect(host.scrollToBottom).toHaveBeenCalledWith({ tabId: 'tab-1', enableAutoScroll: true });
  });

  it('returns false and finalizes with server error when start throws', async () => {
    const { host, container } = createServerReadinessHost({
      startServer: jest.fn().mockRejectedValue(new Error('Binary not found')),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const resultPromise = service.ensureServerReadyForChat('offline');
    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Start service');
    expect(await resultPromise).toBe(false);
    expect(host.finalizeAssistantMessageWithServerError).toHaveBeenCalled();
  });

  it('returns true when skip is chosen and server becomes running', async () => {
    const { host, container } = createServerReadinessHost({
      getServerAvailability: jest.fn().mockResolvedValue('running'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const resultPromise = service.ensureServerReadyForChat('offline');
    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Not now');
    expect(await resultPromise).toBe(true);
    expect(host.startServer).not.toHaveBeenCalled();
  });

  it('returns false when skip is chosen and server stays offline', async () => {
    const { host, container } = createServerReadinessHost({
      getServerAvailability: jest.fn().mockResolvedValue('offline'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const resultPromise = service.ensureServerReadyForChat('offline');
    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Not now');
    expect(await resultPromise).toBe(false);
    expect(host.finalizeAssistantMessageWithServerUnavailableError).toHaveBeenCalled();
  });

  it('returns true when settings is chosen and server becomes running', async () => {
    const { host, container } = createServerReadinessHost({
      getServerAvailability: jest.fn().mockResolvedValue('running'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const resultPromise = service.ensureServerReadyForChat('offline');
    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Open settings');
    expect(await resultPromise).toBe(true);
    expect(host.openPluginSettingsAtServerSection).toHaveBeenCalled();
    expect(host.startServer).not.toHaveBeenCalled();
  });

  it('returns false when settings is chosen and server stays offline', async () => {
    const { host, container } = createServerReadinessHost({
      getServerAvailability: jest.fn().mockResolvedValue('offline'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const resultPromise = service.ensureServerReadyForChat('offline');
    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Open settings');
    expect(await resultPromise).toBe(false);
    expect(host.openPluginSettingsAtServerSection).toHaveBeenCalled();
    expect(host.finalizeAssistantMessageWithServerUnavailableError).toHaveBeenCalled();
  });
});

describe('MessageSendPreparationService createServerReadinessDelegate', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns a delegate that delegates to ensureServerReadyForChat', async () => {
    const host = createHost(createConversation());
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const delegate = service.createServerReadinessDelegate();
    expect(delegate).toHaveProperty('ensureServerReadyForChat');
    expect(typeof delegate.ensureServerReadyForChat).toBe('function');
  });

  it('delegate calls ensureServerReadyForChat on the service', async () => {
    const host = createHost(createConversation());
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const spy = jest.spyOn(service, 'ensureServerReadyForChat').mockResolvedValue(true);
    const delegate = service.createServerReadinessDelegate();
    expect(await delegate.ensureServerReadyForChat('offline')).toBe(true);
    expect(spy).toHaveBeenCalledWith('offline');
  });
});

describe('createMessageSendPreparationHost', () => {
  function createDeps(): MockedMessageSendPreparationHostDependencies {
    return {
      getCurrentConversation: jest.fn().mockReturnValue(createConversation()),
      createNewConversation: jest.fn().mockResolvedValue(null),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      createConversationWriteTicket: jest.fn().mockImplementation((conversationId: string) => ({
        conversationId,
        version: 0,
      })),
      commitConversationWrite: jest.fn().mockImplementation(async (_conversation, _ticket, _reason, write) => {
        await write();
        return true;
      }),
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      ensureTabRuntimeState: jest.fn().mockReturnValue({}),
      isTabForegroundBusy: jest.fn().mockReturnValue(false),
      conversationTabRuntimeCoordinator: {
        setAutoScrollEnabled: jest.fn(),
        transitionTabSessionLifecycle: jest.fn().mockReturnValue(true),
        setStreaming: jest.fn(),
        clearPendingEditedFiles: jest.fn(),
        queueFollowUpSend: jest.fn().mockReturnValue(false),
        consumeQueuedFollowUpSend: jest.fn().mockReturnValue(null),
      },
      getServerAvailability: jest.fn().mockResolvedValue('running'),
      chatHeaderPresenter: { refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined) },
      settingsTab: { refreshServerStatusDisplay: jest.fn() },
      getServerMode: jest.fn().mockReturnValue('local'),
      openPluginSettingsAtServerSection: jest.fn(),
      startServer: jest.fn().mockResolvedValue(undefined),
      notifyForegroundBusy: jest.fn(),
      assistantShellViewHostAdapter: {
        createAssistantShellContainer: jest.fn().mockReturnValue({ messageEl: document.createElement('div'), contentEl: document.createElement('div') }),
      },
      messageFinalizationService: {
        getUnavailableServerPromptMessage: jest.fn().mockReturnValue('Server is offline'),
        finalizeAssistantMessageWithServerError: jest.fn().mockResolvedValue(undefined),
        finalizeAssistantMessageWithServerUnavailableError: jest.fn().mockResolvedValue(undefined),
      },
      chatSelectionControlsCoordinator: {
        hasLoadedModelCatalog: jest.fn().mockReturnValue(true),
        formatModelId: jest.fn().mockReturnValue(undefined),
        ensureSelectedModelAvailable: jest.fn().mockResolvedValue(true),
      },
      reloadModelCatalog: jest.fn().mockResolvedValue(undefined),
      getSendMessageOptions: jest.fn().mockReturnValue({}),
      appendModelUnavailableNoticeMessage: jest.fn().mockResolvedValue(undefined),
      openCodeService: {
        buildStructuredPromptSendPayload: jest.fn().mockReturnValue(createStructuredSendPayload()),
        seedCanonicalUserMessage: jest.fn(),
        sdk: { app: { skills: jest.fn().mockResolvedValue([]) } },
      },
      backgroundTaskHost: { resetBackgroundTaskIndicator: jest.fn(), armBackgroundTaskIndicatorForUserMessage: jest.fn() },
      conversationSyncBridgePorts: { getLoopControl: () => ({ startConversationSyncLoop: jest.fn() }) },
      conversationRenderService: { renderMessage: jest.fn().mockResolvedValue(undefined) },
      scrollToBottom: jest.fn(),
      applyFallbackConversationTitle: jest.fn().mockResolvedValue(undefined),
      getTitleMode: jest.fn().mockReturnValue('manual'),
      startAiConversationTitleGeneration: jest.fn(),
      activeTabContextUsageCoordinator: { beginTabContextUsageStream: jest.fn() },
      syncTabStreamLikeState: jest.fn(),
    };
  }

  it('wires flat dependencies into the host', () => {
    const deps = createDeps();
    const host = createMessageSendPreparationHost(deps);
    expect(host.getActiveTabId()).toBe('tab-1');
    expect(deps.getActiveTabId).toHaveBeenCalledTimes(1);
  });

  it('produces a host usable by MessageSendPreparationService', async () => {
    const deps = createDeps();
    deps.chatSelectionControlsCoordinator = {
      hasLoadedModelCatalog: jest.fn().mockReturnValue(true),
      formatModelId: jest.fn().mockReturnValue('openai/gpt-5.4'),
      ensureSelectedModelAvailable: jest.fn().mockResolvedValue(true),
    };
    deps.getSendMessageOptions = jest.fn().mockReturnValue({ provider: 'openai', model: 'gpt-5.4' });
    const host = createMessageSendPreparationHost(deps);
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const result = await service.prepareMessageSend({ content: 'hello' });
    expect(result).not.toBeNull();
    expect(deps.getCurrentConversation).toHaveBeenCalled();
    expect(deps.chatSelectionControlsCoordinator.hasLoadedModelCatalog).toHaveBeenCalled();
  });
});
