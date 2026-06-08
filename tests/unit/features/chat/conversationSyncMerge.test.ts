import {
  ConversationAuthoritativeSyncCoordinator,
  type ConversationAuthoritativeSyncHost,
} from '../../../../src/features/chat/services/ConversationAuthoritativeSyncCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createHost(
  overrides?: Partial<Mocked<ConversationAuthoritativeSyncHost>>,
): Mocked<ConversationAuthoritativeSyncHost> {
  const host: Mocked<ConversationAuthoritativeSyncHost> = {
    getVaultBasePath: jest.fn().mockReturnValue(undefined),
    getTabRuntimeState: jest.fn().mockReturnValue(null),
    getCurrentConversationId: jest.fn().mockReturnValue(null),
    getCurrentConversationRevertState: jest.fn().mockReturnValue(null),
    getActiveTabId: jest.fn().mockReturnValue(null),
    getSessionMessages: jest.fn().mockResolvedValue([]),
    getCanonicalSessionMessages: jest.fn().mockReturnValue([]),
    getSessionRevertState: jest.fn().mockResolvedValue(null),
    hydrateOpenCodeMessage: jest.fn(),
    shouldRenderConversationMessage: jest.fn().mockReturnValue(true),
    getConversationSyncFingerprint: jest.fn().mockImplementation((messages) =>
      JSON.stringify(messages.map((message: Record<string, unknown>) => ({
        id: message.id,
        sourceMessageId: message.sourceMessageId ?? null,
        streamState: message.streamState ?? null,
        displayStyle: message.displayStyle ?? null,
        content: message.content,
        timestamp: message.timestamp,
      })))),
    rerenderSingleUserMessage: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message) =>
      message
        ? {
            id: message.id,
            role: message.role,
            sourceMessageId: message.sourceMessageId ?? null,
          }
        : null,
    ),
    logAssistantFinalizationDebug: jest.fn(),
    stringifyLogPayload: jest.fn().mockImplementation((payload: unknown) => JSON.stringify(payload)),
    getLogPreview: jest.fn().mockImplementation((text: string) => text),
    getInterruptedSyncPreservationLogFingerprint: jest.fn().mockReturnValue(''),
    ...overrides,
  };
  return host;
}

describe('ConversationAuthoritativeSyncCoordinator synced assistant merge preservation', () => {
  it('preserves structured output for the Claude Code backend when synced message lacks it', () => {
    const host = createHost();
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const merged = coordinator.mergeClientOnlyMessageFields(
      {
        id: 'assistant-local',
        role: 'assistant',
        content: 'answer',
        timestamp: 1,
        sourceMessageId: 'msg-1',
        structured: { status: 'ok' },
      } as never,
      {
        id: 'assistant-server',
        role: 'assistant',
        content: 'answer',
        timestamp: 2,
        sourceMessageId: 'msg-1',
      } as never,
      true,
      'claude-code',
    );

    expect(merged).toMatchObject({
      id: 'assistant-server',
      sourceMessageId: 'msg-1',
      content: 'answer',
      structured: { status: 'ok' },
    });
  });

  it('does not preserve structured output for other backends when synced message lacks it', () => {
    const host = createHost();
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const merged = coordinator.mergeClientOnlyMessageFields(
      {
        id: 'assistant-local',
        role: 'assistant',
        content: 'answer',
        timestamp: 1,
        sourceMessageId: 'msg-1',
        structured: { stale: true },
      } as never,
      {
        id: 'assistant-server',
        role: 'assistant',
        content: 'answer',
        timestamp: 2,
        sourceMessageId: 'msg-1',
      } as never,
      true,
      'opencode',
    );

    expect(merged).toMatchObject({
      id: 'assistant-server',
      sourceMessageId: 'msg-1',
      content: 'answer',
    });
    expect(merged.structured).toBeUndefined();
  });

  it('does not preserve structured output for non-Claude backends when synced message lacks it', () => {
    const host = createHost();
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const merged = coordinator.mergeClientOnlyMessageFields(
      {
        id: 'assistant-local',
        role: 'assistant',
        content: 'answer',
        timestamp: 1,
        sourceMessageId: 'msg-1',
        structured: { stale: true },
      } as never,
      {
        id: 'assistant-server',
        role: 'assistant',
        content: 'answer',
        timestamp: 2,
        sourceMessageId: 'msg-1',
      } as never,
      true,
      'copilot',
    );

    expect(merged).toMatchObject({
      id: 'assistant-server',
      sourceMessageId: 'msg-1',
      content: 'answer',
    });
    expect(merged.structured).toBeUndefined();
  });

  it('does not preserve richer local assistant content blocks over authoritative synced content', () => {
    const host = createHost();
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const merged = coordinator.mergeClientOnlyMessageFields(
      {
        id: 'assistant-local',
        role: 'assistant',
        content: 'answer',
        timestamp: 1,
        sourceMessageId: 'msg-1',
        contentBlocks: [
          { type: 'tool_use', toolId: 'tool-1', toolName: 'structured_output' },
          { type: 'text', text: 'answer' },
        ],
      } as never,
      {
        id: 'assistant-server',
        role: 'assistant',
        content: 'answer',
        timestamp: 2,
        sourceMessageId: 'msg-1',
        contentBlocks: [
          { type: 'text', text: 'answer' },
        ],
      } as never,
    );

    expect(merged).toMatchObject({
      id: 'assistant-server',
      sourceMessageId: 'msg-1',
      content: 'answer',
      contentBlocks: [
        { type: 'text', text: 'answer' },
      ],
    });
  });
});
