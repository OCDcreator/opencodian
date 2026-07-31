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
});
