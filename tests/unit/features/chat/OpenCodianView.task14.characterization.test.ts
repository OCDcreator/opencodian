import { WorkspaceLeaf } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

describe('Task 14 OpenCodianView plugin-seam characterization', () => {
  it('constructs from the current plugin seam and exposes stable view identity plus slash-cache invalidation', () => {
    const pluginReads: PropertyKey[] = [];
    const plugin = new Proxy({
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode'],
        activeBackend: 'opencode',
      },
      openCodeService: {},
      storage: {},
    }, {
      get(target, property, receiver) {
        pluginReads.push(property);
        return Reflect.get(target, property, receiver);
      },
    });
    const view = new OpenCodianView(new WorkspaceLeaf(), plugin as never);
    const cache = (view as unknown as {
      slashCommandMenuCatalogCache: { invalidate(): void };
    }).slashCommandMenuCatalogCache;
    const invalidate = jest.spyOn(cache, 'invalidate');

    view.invalidateSlashCommandMenuCatalog();

    expect(view.getViewType()).toBe('opencodian-view');
    expect(view.getDisplayText()).toBe('OpenCodian');
    expect(view.getIcon()).toBe('opencodian-app-icon');
    expect(pluginReads).toEqual(expect.arrayContaining([
      'settings',
      'openCodeService',
      'claudeCodePermissionHostContext',
      'codexApprovalHostContext',
    ]));
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
  it('keeps a live controller but replaces a cancelled controller before the next turn', () => {
    const messagesEl = document.body.createDiv();
    const prior = { isStreaming: jest.fn(() => false) };
    const pane = { messagesEl, runtime: { streamController: prior } };
    const view = Object.assign(Object.create(OpenCodianView.prototype), {
      markdownService: {},
      ensureTabMessagesPane: jest.fn(() => pane),
      getActiveTabId: jest.fn(() => 'tab-1'),
    }) as unknown as {
      getOrCreateTabStreamController(tabId: string): {
        startStream(element: HTMLElement): void;
        cancelStream(): void;
      };
    };

    const first = view.getOrCreateTabStreamController('tab-1');
    expect(first).not.toBe(prior);
    first.startStream(messagesEl.createDiv());
    expect(view.getOrCreateTabStreamController('tab-1')).toBe(first);
    first.cancelStream();
    expect(view.getOrCreateTabStreamController('tab-1')).not.toBe(first);
  });

});
