import type { ChatMessage } from '../../../../src/core/types';
import { AssistantShellViewHostAdapter } from '../../../../src/features/chat/runtime/AssistantShellViewHostAdapter';

function createAdapter(): AssistantShellViewHostAdapter {
  return new AssistantShellViewHostAdapter({
    getActiveTabId: () => 'tab-1',
    getTabRuntimeState: () => ({ streamingMessageEl: null, streamingContentEl: null }),
    ensureTurnBody: () => document.createElement('div'),
    shouldAutoScroll: () => true,
    scheduleSettledScrollToBottomIfNeeded: jest.fn(),
    setStreamingAssistantMessageVisibility: jest.fn(),
    initializeAssistantCopyButton: jest.fn(),
    renderNoticeCard: jest.fn(),
    getMarkdownService: () => null,
    shouldRenderQuestionResolutionCards: () => false,
    suppressActiveLayoutAutoScrollOnce: jest.fn(),
    openTaskToolSession: jest.fn(),
  });
}

function createTaskMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-task-1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    contentBlocks: [{
      type: 'tool_use',
      toolId: 'call-task-1',
      toolName: 'task',
      toolKind: 'task',
      toolInput: { description: 'Audit routes', subagent_type: 'explorer' },
      toolStatus: 'completed',
      toolResult: 'task_id: child-session-1\n\n<task_result>\nHidden\n</task_result>',
      ...overrides.contentBlocks?.[0],
    }],
    ...overrides,
  };
}

describe('Assistant body signature task metadata sensitivity', () => {
  it('treats task metadata and result-visibility changes as body-signature changes', () => {
    const adapter = createAdapter();
    const previous = createTaskMessage();
    const next = createTaskMessage({
      contentBlocks: [{
        type: 'tool_use',
        toolId: 'call-task-1',
        toolName: 'task',
        toolKind: 'task',
        toolInput: { description: 'Audit routes', subagent_type: 'explorer' },
        toolMetadata: { sessionId: 'child-session-1' },
        toolStatus: 'completed',
        toolResult: 'task_id: child-session-1\n\n<task_result>\nHidden\n</task_result>',
        toolResultVisibility: 'hidden',
      }],
    });

    expect(adapter.getAssistantBodySignature(previous)).not.toBe(adapter.getAssistantBodySignature(next));
  });
});
