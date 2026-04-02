import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

describe('OpenCodianView stale session todo suppression', () => {
  function createView(): OpenCodianView {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
      },
      openCodeService: {},
      storage: {},
    } as never);
  }

  it('suppresses stale incomplete todos after prolonged inactivity', () => {
    const view = createView() as unknown as {
      suppressStaleSessionTodosIfNeeded: (tabId: string) => Array<Record<string, unknown>> | null;
      getTabRuntimeState: () => Record<string, unknown>;
      getTabSessionStatus: () => null;
      getSessionIdForTab: () => string;
      getActiveTabId: () => string;
      renderSessionTodoDock: () => void;
    };

    const runtime = {
      isStreaming: false,
      sessionTodoSessionId: 'session-1',
      sessionTodos: [
        { content: 'Investigate sync issue', status: 'in_progress' },
      ],
      sessionTodoFingerprint: JSON.stringify([
        {
          id: null,
          content: 'Investigate sync issue',
          status: 'in_progress',
          priority: null,
        },
      ]),
      sessionTodoLastChangedAt: Date.now() - 121_000,
      sessionTodoSuppressedFingerprint: null,
      sessionStatusLastChangedAt: Date.now() - 121_000,
      backgroundTaskStartedAt: Date.now() - 121_000,
    };

    jest.spyOn(view, 'getTabRuntimeState').mockReturnValue(runtime);
    jest.spyOn(view, 'getTabSessionStatus').mockReturnValue(null);
    jest.spyOn(view, 'getSessionIdForTab').mockReturnValue('session-1');
    jest.spyOn(view, 'getActiveTabId').mockReturnValue('tab-1');
    jest.spyOn(view, 'renderSessionTodoDock').mockImplementation(() => {});

    const staleTodos = view.suppressStaleSessionTodosIfNeeded('tab-1');

    expect(staleTodos).toEqual([
      { content: 'Investigate sync issue', status: 'in_progress' },
    ]);
    expect(runtime.sessionTodoSuppressedFingerprint).toBe(runtime.sessionTodoFingerprint);
    expect(runtime.sessionTodos).toEqual([]);
  });
});
