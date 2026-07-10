import type { Conversation } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

interface ExperimentalActionViewHarness {
  currentConversation: Conversation;
  getActiveTabId(): string;
  getTabRuntimeState(tabId: string): {
    readonly turnBodyByAnchorKey: Map<string, HTMLElement>;
    readonly isStreaming: boolean;
    readonly sessionStatus: unknown;
  } | null;
  handleExperimentalBackgroundActionCompleted(): void;
}

describe('OpenCodianView experimental actions', () => {
  it('adds background completion to the active turn without changing foreground runtime state', () => {
    const userMessage = {
      id: 'message-1',
      role: 'user' as const,
      content: 'Run this in background',
      timestamp: 1,
    };
    const turnBodyEl = document.createElement('div');
    document.body.appendChild(turnBodyEl);
    const runtime = {
      turnBodyByAnchorKey: new Map([[userMessage.id, turnBodyEl]]),
      isStreaming: true,
      sessionStatus: { type: 'busy' },
    };
    const view = Object.assign(Object.create(OpenCodianView.prototype), {
      currentConversation: {
        id: 'conversation-1',
        title: 'Experimental actions',
        createdAt: 1,
        updatedAt: 1,
        messages: [userMessage],
      },
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getTabRuntimeState: jest.fn().mockReturnValue(runtime),
    }) as ExperimentalActionViewHarness;

    const isStreamingBefore = runtime.isStreaming;
    const sessionStatusBefore = runtime.sessionStatus;

    view.handleExperimentalBackgroundActionCompleted();

    expect(turnBodyEl.querySelector('[data-experimental-background-status="completed"]')).not.toBeNull();
    expect(runtime.isStreaming).toBe(isStreamingBefore);
    expect(runtime.sessionStatus).toBe(sessionStatusBefore);
  });
});
