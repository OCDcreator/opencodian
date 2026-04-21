import { WorkspaceLeaf } from 'obsidian';

import type { ChatMessage } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

function createView(): OpenCodianView {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      effortLevel: 'medium',
      thinkingBudget: 0,
      locale: 'en',
      maxTabs: 3,
    },
    openCodeService: {},
    storage: {},
    saveConversation: jest.fn().mockResolvedValue(undefined),
  } as never);
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

describe('OpenCodianView task signature sensitivity', () => {
  it('treats task metadata and result-visibility changes as body-signature changes', () => {
    const view = createView() as OpenCodianView & {
      getAssistantBodySignature(message: ChatMessage): string;
      getMessageVisualSignature(message: ChatMessage): string;
    };
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

    expect(view.getAssistantBodySignature(previous)).not.toBe(view.getAssistantBodySignature(next));
    expect(view.getMessageVisualSignature(previous)).not.toBe(view.getMessageVisualSignature(next));
  });
});
