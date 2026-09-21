import { DEFAULT_SETTINGS } from '../../../src/core/types';
import type { InlineCompletionService } from '../../../src/features/inline-edit/InlineCompletionService';
import OpenCodianPlugin from '../../../src/main';

(globalThis as { BUILD_ID?: string }).BUILD_ID = 'test-build';

type WarmWiredPlugin = OpenCodianPlugin & {
  settings: typeof DEFAULT_SETTINGS;
  inlineCompletionPool: InlineCompletionService | null;
  configureInlineCompletion(): void;
};

describe('R-F4 chat warm-session composition', () => {
  it('defaults to no warm session and no target resolution', () => {
    const plugin = new OpenCodianPlugin() as WarmWiredPlugin;
    plugin.app = { workspace: { getActiveViewOfType: () => null } } as never;
    plugin.settings = { ...DEFAULT_SETTINGS };
    const resolveTarget = jest.spyOn(
      plugin as unknown as { resolveInlineCompletionTarget: () => unknown },
      'resolveInlineCompletionTarget',
    );

    plugin.configureInlineCompletion();

    expect(resolveTarget).not.toHaveBeenCalled();
    expect(plugin.inlineCompletionPool?.sessionCount()).toBe(0);
  });

  it('keeps the shared pool alive while either R-C3 or R-F4 remains enabled', () => {
    const plugin = new OpenCodianPlugin() as WarmWiredPlugin;
    const disposeAll = jest.fn().mockResolvedValue(undefined);
    const resetUnsupported = jest.fn();
    const prewarmExclusive = jest.fn().mockResolvedValue(undefined);
    plugin.inlineCompletionPool = { disposeAll, resetUnsupported, prewarmExclusive } as never;

    plugin.settings = { ...DEFAULT_SETTINGS, inlineCompletionEnabled: true };
    plugin.onChatWarmSessionSettingChanged(false);
    expect(disposeAll).not.toHaveBeenCalled();

    plugin.settings = { ...DEFAULT_SETTINGS, chatWarmSessionEnabled: true };
    plugin.onInlineCompletionSettingChanged(false);
    expect(disposeAll).not.toHaveBeenCalled();

    plugin.settings = { ...DEFAULT_SETTINGS };
    plugin.onChatWarmSessionSettingChanged(false);
    expect(disposeAll).toHaveBeenCalledTimes(1);

    plugin.settings = { ...DEFAULT_SETTINGS, chatWarmSessionEnabled: true };
    plugin.onChatWarmSessionSettingChanged(true);
    expect(resetUnsupported).toHaveBeenCalledTimes(1);
    expect(prewarmExclusive).toHaveBeenCalledTimes(1);
  });
});
