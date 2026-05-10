import type {
  Conversation,
} from '../../../../src/core/types';
import {
  createSendPipelineRuntimeHost,
  type SendPipelineHostDependencies,
  type SendPipelineStreamController,
  type SendPipelineTabRuntime,
} from '../../../../src/features/chat/runtime/SendPipelineRuntime';
import type { StreamingChunk,StreamingContentBlock } from '../../../../src/utils/streaming';

function createTabRuntime(): SendPipelineTabRuntime {
  return {
    isStreaming: true,
    streamingMessageEl: null,
    streamingContentEl: null,
    pendingEditedFiles: new Set<string>(),
    pendingQuestionResolution: null,
    isConversationSyncInFlight: false,
  };
}

function createStreamController(): SendPipelineStreamController {
  const contentBlocks: StreamingContentBlock[] = [];
  return {
    startStream: jest.fn(),
    handleChunk: jest.fn().mockImplementation(async (chunk: StreamingChunk) => {
      if (chunk.type === 'text') contentBlocks.push({ type: 'text', content: chunk.content });
    }),
    cancelStream: jest.fn(),
    getContentBlocks: jest.fn().mockReturnValue(contentBlocks),
  };
}

function createConversation(): Conversation {
  return { id: 'conv-1', title: 'T', createdAt: 1, updatedAt: 1, openCodeSessionId: 's-1', messages: [] };
}

function createShellPort() {
  return {
    createAssistantMessageElement: jest.fn().mockReturnValue({
      messageEl: document.createElement('div'),
      contentEl: document.createElement('div'),
    }),
    revealStreamingAssistantMessageElement: jest.fn().mockReturnValue(document.createElement('div')),
    renderAssistantPlaceholderAsNotice: jest.fn().mockResolvedValue(undefined),
    addTimestampWithCopyButton: jest.fn(),
  };
}

function createFullDeps(overrides: Partial<SendPipelineHostDependencies> = {}): SendPipelineHostDependencies {
  const shellPort = createShellPort();
  return {
    getTabRuntimeState: jest.fn().mockReturnValue(createTabRuntime()),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    shouldAutoScroll: jest.fn().mockReturnValue(true),
    scheduleSettledScrollToBottomIfNeeded: jest.fn(),
    getOrCreateTabStreamController: jest.fn().mockReturnValue(createStreamController()),
    finalizeBackgroundTaskIndicatorAfterPrimaryStream: jest.fn().mockResolvedValue(undefined),
    removeEmptyAssistantShells: jest.fn(),
    syncTabStreamLikeState: jest.fn(),
    refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
    sendStreamMessage: jest.fn().mockImplementation(() => (async function* () {})()),
    detachStream: jest.fn(),
    syncLatestUserMessageFromServer: jest.fn().mockResolvedValue(undefined),
    beginTabContextUsageStream: jest.fn(),
    completeTabContextUsageStream: jest.fn(),
    applyUsageChunkToTab: jest.fn(),
    showPermissionDialog: jest.fn().mockResolvedValue(undefined),
    showQuestionDialog: jest.fn().mockResolvedValue(undefined),
    convertToStreamingChunk: jest.fn().mockReturnValue(null),
    getFriendlyStreamErrorMessage: jest.fn().mockImplementation((m: string) => `Friendly: ${m}`),
    createSendPipelineShellPort: jest.fn().mockReturnValue(shellPort),
    createConversationWriteTicket: jest.fn().mockImplementation((conversationId: string) => ({
      conversationId,
      version: 0,
    })),
    commitConversationWrite: jest.fn().mockImplementation(async (_conversation, _ticket, _reason, write) => {
      await write();
      return true;
    }),
    summarizeContentBlocksForDebug: jest.fn().mockReturnValue(null),
    summarizeCoreStreamChunkForDebug: jest.fn().mockReturnValue({}),
    summarizeChatMessageForDebug: jest.fn().mockReturnValue(null),
    logAssistantFinalizationDebug: jest.fn(),
    getLogPreview: jest.fn().mockImplementation((t: string) => t),
    stringifyLogPayload: jest.fn().mockImplementation((p: unknown) => JSON.stringify(p)),
    ...overrides,
  };
}

describe('createSendPipelineRuntimeHost', () => {
  it('composes all five port categories and delegates viewPort methods', () => {
    const deps = createFullDeps();
    const host = createSendPipelineRuntimeHost(deps);

    expect(typeof host.sendStreamMessage).toBe('function');
    expect(typeof host.createAssistantMessageElement).toBe('function');
    expect(typeof host.createConversationWriteTicket).toBe('function');
    expect(typeof host.commitConversationWrite).toBe('function');
    expect(typeof host.summarizeContentBlocksForDebug).toBe('function');

    host.getTabRuntimeState('tab-1');
    expect(deps.getTabRuntimeState).toHaveBeenCalledWith('tab-1');
    host.getActiveTabId();
    expect(deps.getActiveTabId).toHaveBeenCalled();
    host.shouldAutoScroll('tab-1');
    expect(deps.shouldAutoScroll).toHaveBeenCalledWith('tab-1');
    host.scheduleSettledScrollToBottomIfNeeded(true, 'tab-1');
    expect(deps.scheduleSettledScrollToBottomIfNeeded).toHaveBeenCalledWith(true, 'tab-1');
    host.getOrCreateTabStreamController('tab-1');
    expect(deps.getOrCreateTabStreamController).toHaveBeenCalledWith('tab-1');
    host.removeEmptyAssistantShells();
    expect(deps.removeEmptyAssistantShells).toHaveBeenCalled();
    host.syncTabStreamLikeState('tab-1');
    expect(deps.syncTabStreamLikeState).toHaveBeenCalledWith('tab-1');
    void host.refreshServerStatusBadge();
    expect(deps.refreshServerStatusBadge).toHaveBeenCalled();
  });

  it('delegates transportPort, shellPort, persistence and debug methods to deps', () => {
    const shellPort = createShellPort();
    const deps = createFullDeps({
      createSendPipelineShellPort: jest.fn().mockReturnValue(shellPort),
    });
    const host = createSendPipelineRuntimeHost(deps);

    host.sendStreamMessage('hello', {
      provider: 'openai', model: 'gpt-5.4',
      contextItems: [], messageID: 'msg-1', requestParts: [],
    });
    expect(deps.sendStreamMessage).toHaveBeenCalled();

    host.detachStream('session-1');
    expect(deps.detachStream).toHaveBeenCalledWith('session-1');

    const conversation = createConversation();
    host.syncLatestUserMessageFromServer(conversation, 'msg-1', 'tab-1');
    expect(deps.syncLatestUserMessageFromServer).toHaveBeenCalledWith(conversation, 'msg-1', 'tab-1');

    host.beginTabContextUsageStream('tab-1');
    expect(deps.beginTabContextUsageStream).toHaveBeenCalledWith('tab-1');
    host.completeTabContextUsageStream('tab-1');
    expect(deps.completeTabContextUsageStream).toHaveBeenCalledWith('tab-1');

    expect(deps.createSendPipelineShellPort).toHaveBeenCalled();
    expect(host.createAssistantMessageElement).toBe(shellPort.createAssistantMessageElement);
    expect(host.revealStreamingAssistantMessageElement).toBe(shellPort.revealStreamingAssistantMessageElement);

    host.createConversationWriteTicket('conversation-1');
    expect(deps.createConversationWriteTicket).toHaveBeenCalledWith('conversation-1');

    host.summarizeContentBlocksForDebug([]);
    expect(deps.summarizeContentBlocksForDebug).toHaveBeenCalled();

    host.logAssistantFinalizationDebug('test', { x: 1 });
    expect(deps.logAssistantFinalizationDebug).toHaveBeenCalledWith('test', { x: 1 });
  });
});
