import type {
  InputPanelActionButtonStyleId,
  InputPanelGlassRefractionSvgFilterSettings,
  InputPanelThemeId,
} from '../../../../src/core/types';
import {
  InputPanelAppearanceCoordinator,
  type InputPanelAppearanceCoordinatorHost,
} from '../../../../src/features/chat/services/InputPanelAppearanceCoordinator';
import {
  getGlassAdapter,
  type GlassEffectAdapter,
  type GlassMountContext,
  registerBuiltinGlassAdapters,
  registerGlassAdapter,
  unregisterGlassAdapter,
} from '../../../../src/utils/glass';

interface FixtureOptions {
  actionButtonStyle?: InputPanelActionButtonStyleId;
  theme?: InputPanelThemeId;
  svgFilterSettings?: InputPanelGlassRefractionSvgFilterSettings;
  debugLoggingEnabled?: boolean;
}

function createFixture(options: FixtureOptions = {}) {
  const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
  const inputWrapperEl = shellEl.createDiv({ cls: 'opencodian-input-wrapper' });
  const chatContainerEl = document.body.createDiv({ cls: 'opencodian-chat-container' });
  let actionButtonStyle = options.actionButtonStyle ?? 'default';
  let theme = options.theme ?? 'preset';
  let svgFilterSettings = options.svgFilterSettings ?? {
    preset: 'none',
    subtleScale: 8,
    strongScale: 16,
  };
  let debugLoggingEnabled = options.debugLoggingEnabled ?? false;

  const host: jest.Mocked<InputPanelAppearanceCoordinatorHost> = {
    getComposerShellEl: jest.fn(() => shellEl),
    getInputWrapperEl: jest.fn(() => inputWrapperEl),
    getChatContainerEl: jest.fn(() => chatContainerEl),
    getMessagesShellEl: jest.fn(() => null),
    getMessagesContainerEl: jest.fn(() => null),
    getInputPanelTheme: jest.fn(() => theme),
    getInputActionButtonStyle: jest.fn(() => actionButtonStyle),
    getInputPanelGlassRefractionSvgFilterSettings: jest.fn(() => svgFilterSettings),
    getLiquidGlassAdapterSettings: jest.fn(() => ({ blur: 12 })),
    scheduleChatSurfaceColorSync: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    isDebugLoggingEnabled: jest.fn(() => debugLoggingEnabled),
    resolveAssetUrl: jest.fn((relativePath: string) => `asset://${relativePath}`),
    getLogPreview: jest.fn((text: string) => text),
    stringifyLogPayload: jest.fn((payload: unknown) => JSON.stringify(payload)),
  };

  return {
    coordinator: new InputPanelAppearanceCoordinator(host),
    host,
    shellEl,
    inputWrapperEl,
    setActionButtonStyle: (next: InputPanelActionButtonStyleId) => {
      actionButtonStyle = next;
    },
    setTheme: (next: InputPanelThemeId) => {
      theme = next;
    },
    setSvgFilterSettings: (next: InputPanelGlassRefractionSvgFilterSettings) => {
      svgFilterSettings = next;
    },
    setDebugLoggingEnabled: (enabled: boolean) => {
      debugLoggingEnabled = enabled;
    },
  };
}

describe('InputPanelAppearanceCoordinator', () => {
  const originalShudingAdapter = getGlassAdapter('shuding');

  beforeEach(() => {
    document.body.innerHTML = '';
    registerBuiltinGlassAdapters();
  });

  afterEach(() => {
    if (originalShudingAdapter) {
      registerGlassAdapter(originalShudingAdapter);
    } else {
      unregisterGlassAdapter('shuding');
    }
    jest.restoreAllMocks();
  });

  it('syncs action-button/theme state and schedules sticky/layout follow-up together', () => {
    const fixture = createFixture({
      actionButtonStyle: 'etched',
      theme: 'glass-refraction-glass',
      svgFilterSettings: {
        preset: 'subtle',
        subtleScale: 8,
        strongScale: 16,
      },
    });

    fixture.coordinator.syncAppearanceState();

    expect(
      fixture.shellEl.classList.contains('opencodian-composer-shell--action-buttons-etched'),
    ).toBe(true);
    expect(fixture.shellEl.classList.contains('opencodian-composer-shell--gr-glass')).toBe(true);
    expect(
      fixture.shellEl.classList.contains('opencodian-composer-shell--gr-svg-filter-subtle'),
    ).toBe(true);
    expect(fixture.shellEl.querySelector('.opencodian-composer-svg-filter-layer')).not.toBeNull();
    expect(fixture.host.scheduleChatSurfaceColorSync).toHaveBeenCalledTimes(1);
    expect(fixture.host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);

    fixture.setTheme('preset');
    fixture.setActionButtonStyle('default');
    fixture.setSvgFilterSettings({
      preset: 'none',
      subtleScale: 8,
      strongScale: 16,
    });

    fixture.coordinator.syncAppearanceState();

    expect(
      fixture.shellEl.classList.contains('opencodian-composer-shell--action-buttons-etched'),
    ).toBe(false);
    expect(fixture.shellEl.classList.contains('opencodian-composer-shell--gr-glass')).toBe(false);
    expect(fixture.shellEl.querySelector('.opencodian-composer-svg-filter-layer')).toBeNull();
    expect(fixture.host.scheduleChatSurfaceColorSync).toHaveBeenCalledTimes(2);
    expect(fixture.host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(2);
  });

  it('routes liquid-glass mount and destroy through the extracted runtime seam', () => {
    const mount = jest.fn((ctx: GlassMountContext) => {
      ctx.shellEl.dataset.testGlassMounted = 'true';
      ctx.filterLayerEl.dataset.testGlassMounted = 'true';
    });
    const unmount = jest.fn((ctx: GlassMountContext) => {
      delete ctx.shellEl.dataset.testGlassMounted;
    });
    const adapter: GlassEffectAdapter = {
      id: 'shuding',
      displayName: 'Test adapter',
      description: 'test',
      paramDefs: [],
      mount,
      unmount,
    };
    registerGlassAdapter(adapter);

    const fixture = createFixture({
      theme: 'liquid-glass-shuding',
    });

    fixture.coordinator.syncAppearanceState();

    expect(mount).toHaveBeenCalledTimes(1);
    expect(
      fixture.shellEl.classList.contains('opencodian-composer-shell--liquid-glass'),
    ).toBe(true);
    expect(fixture.shellEl.dataset.testGlassMounted).toBe('true');
    expect(fixture.shellEl.querySelector('.opencodian-composer-svg-filter-layer')).not.toBeNull();
    expect(fixture.host.scheduleChatSurfaceColorSync).toHaveBeenCalledTimes(1);
    expect(fixture.host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);

    fixture.coordinator.destroy();

    expect(unmount).toHaveBeenCalledTimes(1);
    expect(fixture.shellEl.dataset.testGlassMounted).toBeUndefined();
    expect(fixture.shellEl.querySelector('.opencodian-composer-svg-filter-layer')).toBeNull();
  });
});
