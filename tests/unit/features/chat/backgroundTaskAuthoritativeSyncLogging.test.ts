import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { setDebugLoggingEnabled } from '../../../../src/shared';

function createView(): OpenCodianView {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      effortLevel: 'medium',
      thinkingBudget: 0,
      locale: 'en',
      enableAutoScroll: true,
    },
    openCodeService: {},
    storage: {},
  } as never);
}

describe('OpenCodianView background task authoritative sync logging', () => {
  beforeEach(() => {
    setDebugLoggingEnabled(true);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    jest.restoreAllMocks();
  });

  it('does not log visible background sync without a pending authoritative sync', () => {
    const view = createView() as unknown as {
      markBackgroundTaskAuthoritativeSync: (tabId: string, reason: string) => void;
      getTabRuntimeState: () => Record<string, unknown>;
    };

    const runtime = {
      isHydratingConversation: false,
      backgroundTaskAwaitingAuthoritativeSync: false,
      backgroundTaskLastAuthoritativeSyncAt: null,
    };

    jest.spyOn(view, 'getTabRuntimeState').mockReturnValue(runtime);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    view.markBackgroundTaskAuthoritativeSync('tab-1', 'visible-background-sync');

    expect(runtime.backgroundTaskLastAuthoritativeSyncAt).toBeNull();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs once when a pending authoritative sync becomes ready', () => {
    const view = createView() as unknown as {
      markBackgroundTaskAuthoritativeSync: (tabId: string, reason: string) => void;
      getTabRuntimeState: () => Record<string, unknown>;
    };

    const runtime = {
      isHydratingConversation: false,
      backgroundTaskAwaitingAuthoritativeSync: true,
      backgroundTaskLastAuthoritativeSyncAt: null as number | null,
    };

    jest.spyOn(view, 'getTabRuntimeState').mockReturnValue(runtime);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    view.markBackgroundTaskAuthoritativeSync('tab-1', 'sync-event:message.updated');

    expect(runtime.backgroundTaskAwaitingAuthoritativeSync).toBe(false);
    expect(typeof runtime.backgroundTaskLastAuthoritativeSyncAt).toBe('number');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(String(consoleSpy.mock.calls[0]?.[0] ?? '')).toContain('[OpenCodianView] Background task authoritative sync ready');
  });
});
