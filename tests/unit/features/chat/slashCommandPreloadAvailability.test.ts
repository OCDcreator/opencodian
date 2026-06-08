import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

describe('OpenCodianView slash command preload availability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not warm slash command catalog when opencode backend is disabled', () => {
    jest.useFakeTimers();
    try {
      const settings = {
        ...DEFAULT_SETTINGS,
        enabledBackends: [...DEFAULT_SETTINGS.enabledBackends],
      };
      settings.enabledBackends = [];
      settings.activeBackend = 'opencode';

      const view = new OpenCodianView(new WorkspaceLeaf(), {
        settings,
        openCodeService: {},
        storage: {},
      } as never);

      const warmSpy = jest.spyOn(
        (view as unknown as { slashCommandMenuCatalogCache: { warm: () => void } }).slashCommandMenuCatalogCache,
        'warm',
      );

      (view as unknown as { invalidateSlashCommandMenuCatalog: (options?: { preload?: boolean }) => void })
        .invalidateSlashCommandMenuCatalog({ preload: true });

      jest.runOnlyPendingTimers();

      expect(warmSpy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
