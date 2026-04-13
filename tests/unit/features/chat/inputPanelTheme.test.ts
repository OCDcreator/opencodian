import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import {
  getDefaultChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getDefaultInputPanelLiquidGlassSettings,
  getDefaultThemeSettings,
  type InputPanelGlassRefractionSvgFilterSettings,
  type InputPanelThemeId,
} from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { setLocale } from '../../../../src/i18n';
import { registerBuiltinGlassAdapters } from '../../../../src/utils/glass/builtin-adapters';

type InputPanelThemeViewHarness = {
  chatContainerEl: HTMLElement | null;
  inputContainer: HTMLElement | null;
  plugin: {
    settings: {
      chatAppearance: ReturnType<typeof getDefaultChatAppearanceSettings>;
      inputPanelTheme: InputPanelThemeId;
      inputPanelGlassRefraction: ReturnType<typeof getDefaultInputPanelGlassRefractionSettings>;
      inputPanelGlassRefractionSvgFilter: InputPanelGlassRefractionSvgFilterSettings;
      inputPanelLiquidGlass: ReturnType<typeof getDefaultInputPanelLiquidGlassSettings>;
    };
  };
  applyInputPanelThemeState: () => void;
  applyInputActionButtonStyleState: () => void;
  updateSendButtonState: () => void;
};

class ResizeObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();

  constructor(_callback: ResizeObserverCallback) {}
}

function createCanvasContextMock(): CanvasRenderingContext2D {
  return {
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    } as ImageData),
    putImageData: jest.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('OpenCodianView input panel theme', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    registerBuiltinGlassAdapters();
  });

  afterEach(() => {
    setLocale('en');
    jest.restoreAllMocks();
  });

  function createView(inputPanelTheme: InputPanelThemeId): InputPanelThemeViewHarness {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
        theme: getDefaultThemeSettings(),
        chatAppearance: getDefaultChatAppearanceSettings(),
        inputPanelTheme,
        inputPanelGlassRefraction: getDefaultInputPanelGlassRefractionSettings(),
        inputPanelGlassRefractionSvgFilter: getDefaultInputPanelGlassRefractionSvgFilterSettings(),
        inputPanelLiquidGlass: getDefaultInputPanelLiquidGlassSettings(),
      },
      openCodeService: {},
      storage: {},
    } as never) as unknown as InputPanelThemeViewHarness;
  }

  function attachComposerShell(
    view: InputPanelThemeViewHarness,
    {
      shellEl,
      inputWrapperEl = null,
      sendBtn = null,
    }: {
      shellEl: HTMLElement;
      inputWrapperEl?: HTMLElement | null;
      sendBtn?: HTMLElement | null;
    },
  ): void {
    const coordinator = (view as unknown as {
      composerInputShellCoordinator: {
        composerShellEl: HTMLElement | null;
        inputWrapperEl: HTMLElement | null;
        sendBtnEl: HTMLElement | null;
      };
    }).composerInputShellCoordinator;
    coordinator.composerShellEl = shellEl;
    coordinator.inputWrapperEl = inputWrapperEl;
    coordinator.sendBtnEl = sendBtn;
  }

  it('keeps preset mode free of glass-refraction classes and extra glass nodes', () => {
    const view = createView('preset');
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    attachComposerShell(view, { shellEl });

    view.applyInputPanelThemeState();

    expect(shellEl.classList.contains('opencodian-composer-shell--gr-glass')).toBe(false);
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-card')).toBe(false);
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-pill')).toBe(false);
    expect(document.body.querySelector('.opencodian-composer-glass-fx')).toBeNull();
    expect(shellEl.querySelector('.opencodian-composer-svg-filter-layer')).toBeNull();
    expect(shellEl.querySelector('.opencodian-composer-glass-surface')).toBeNull();
  });

  it.each([
    ['glass-refraction-glass', 'opencodian-composer-shell--gr-glass'],
    ['glass-refraction-card', 'opencodian-composer-shell--gr-card'],
    ['glass-refraction-pill', 'opencodian-composer-shell--gr-pill'],
  ] as const)('applies %s as %s', (theme, className) => {
    const view = createView(theme);
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    attachComposerShell(view, { shellEl });

    view.applyInputPanelThemeState();

    expect(shellEl.classList.contains(className)).toBe(true);
  });

  it('applies the glass class without mounting extra runtime nodes', () => {
    const view = createView('glass-refraction-glass');
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    attachComposerShell(view, { shellEl });

    view.applyInputPanelThemeState();

    expect(shellEl.classList.contains('opencodian-composer-shell--gr-glass')).toBe(true);
    expect(document.body.querySelector('.opencodian-composer-glass-fx')).toBeNull();
    expect(shellEl.querySelector('.opencodian-composer-svg-filter-layer')).toBeNull();
    expect(shellEl.querySelector('.opencodian-composer-glass-surface')).toBeNull();
    expect(shellEl.dataset.opencodianGlassFilter).toBeUndefined();
  });

  it('mounts the subtle svg refraction filter layer and syncs project-default scales', () => {
    const view = createView('glass-refraction-glass');
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    attachComposerShell(view, { shellEl });
    view.plugin.settings.inputPanelGlassRefractionSvgFilter = {
      preset: 'subtle',
      subtleScale: 8,
      strongScale: 16,
    };

    view.applyInputPanelThemeState();

    expect(shellEl.classList.contains('opencodian-composer-shell--gr-glass')).toBe(true);
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-svg-filter-subtle')).toBe(true);
    expect(shellEl.querySelector('.opencodian-composer-svg-filter-layer')).not.toBeNull();
    expect(
      document.querySelector('#opencodian-glass-refract feDisplacementMap')?.getAttribute('scale'),
    ).toBe('8');
    expect(
      document.querySelector('#opencodian-glass-refract-strong feDisplacementMap')?.getAttribute('scale'),
    ).toBe('16');
  });

  it('updates the strong svg refraction scale and removes the layer when disabled', () => {
    const view = createView('glass-refraction-card');
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    attachComposerShell(view, { shellEl });
    view.plugin.settings.inputPanelGlassRefractionSvgFilter = {
      preset: 'strong',
      subtleScale: 8,
      strongScale: 21,
    };

    view.applyInputPanelThemeState();
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-svg-filter-strong')).toBe(true);
    expect(
      document.querySelector('#opencodian-glass-refract-strong feDisplacementMap')?.getAttribute('scale'),
    ).toBe('21');
    expect(shellEl.querySelector('.opencodian-composer-svg-filter-layer')).not.toBeNull();

    view.plugin.settings.inputPanelGlassRefractionSvgFilter = {
      preset: 'none',
      subtleScale: 8,
      strongScale: 21,
    };
    view.applyInputPanelThemeState();

    expect(shellEl.classList.contains('opencodian-composer-shell--gr-svg-filter-strong')).toBe(false);
    expect(shellEl.querySelector('.opencodian-composer-svg-filter-layer')).toBeNull();
  });

  it('replaces existing glass-refraction classes when switching themes', () => {
    const view = createView('glass-refraction-glass');
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    attachComposerShell(view, { shellEl });

    view.applyInputPanelThemeState();
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-glass')).toBe(true);

    view.plugin.settings.inputPanelTheme = 'glass-refraction-card';
    view.applyInputPanelThemeState();
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-glass')).toBe(false);
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-card')).toBe(true);
    expect(document.body.querySelector('.opencodian-composer-glass-fx')).toBeNull();
    expect(shellEl.querySelector('.opencodian-composer-glass-surface')).toBeNull();
    expect(shellEl.dataset.opencodianGlassFilter).toBeUndefined();

    view.plugin.settings.inputPanelTheme = 'preset';
    view.applyInputPanelThemeState();
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-card')).toBe(false);
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-pill')).toBe(false);
  });

  it('toggles the etched action button class from chat appearance settings', () => {
    const view = createView('preset');
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    attachComposerShell(view, { shellEl });

    view.applyInputActionButtonStyleState();
    expect(shellEl.classList.contains('opencodian-composer-shell--action-buttons-etched')).toBe(false);

    view.plugin.settings.chatAppearance.input.actionButtonStyle = 'etched';
    view.applyInputActionButtonStyleState();
    expect(shellEl.classList.contains('opencodian-composer-shell--action-buttons-etched')).toBe(true);

    view.plugin.settings.chatAppearance.input.actionButtonStyle = 'default';
    view.applyInputActionButtonStyleState();
    expect(shellEl.classList.contains('opencodian-composer-shell--action-buttons-etched')).toBe(false);
  });

  it('localizes the send button tooltip label for both idle and streaming states', () => {
    setLocale('zh');
    const view = createView('preset');
    const sendBtn = document.body.createEl('button', { cls: 'opencodian-tooltip-trigger' });
    attachComposerShell(view, {
      shellEl: document.body.createDiv({ cls: 'opencodian-composer-shell' }),
      sendBtn,
    });
    const streamingSpy = jest.spyOn(
      view as unknown as { isActiveTabStreaming: () => boolean },
      'isActiveTabStreaming',
    );

    streamingSpy.mockReturnValue(false);
    view.updateSendButtonState();
    expect(sendBtn.getAttribute('data-tooltip')).toBe('发送消息');

    streamingSpy.mockReturnValue(true);
    view.updateSendButtonState();
    expect(sendBtn.getAttribute('data-tooltip')).toBe('停止生成');
  });

  it('mounts shuding liquid glass with upstream defaults and cleans it up on theme switch', () => {
    const originalCss = globalThis.CSS;
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalDevicePixelRatio = window.devicePixelRatio;
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: {
        supports: jest.fn().mockReturnValue(true),
      },
    });
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createCanvasContextMock());
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,input-panel');

    try {
      const view = createView('liquid-glass-shuding');
      const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
      shellEl.style.width = '432px';
      shellEl.style.height = '74px';
      shellEl.style.borderRadius = '20px';
      Object.defineProperty(shellEl, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 432,
          bottom: 74,
          width: 432,
          height: 74,
          toJSON: () => ({}),
        } as DOMRect),
      });
      const inputWrapperEl = shellEl.createDiv({ cls: 'opencodian-input-wrapper' });
      attachComposerShell(view, { shellEl, inputWrapperEl });

      view.applyInputPanelThemeState();

      const filterLayerEl = shellEl.querySelector<HTMLElement>('.opencodian-composer-svg-filter-layer');
      expect(shellEl.classList.contains('opencodian-composer-shell--liquid-glass')).toBe(true);
      expect(shellEl.dataset.opencodianLgShuding).toBe('mounted');
      expect(filterLayerEl).not.toBeNull();
      expect(filterLayerEl?.dataset.opencodianLgShudingUrlSupported).toBe('true');
      expect(filterLayerEl?.dataset.opencodianLgShudingOwner).toBeTruthy();
      expect(shellEl.style.width).toBe('432px');
      expect(shellEl.style.height).toBe('74px');
      expect(shellEl.style.borderRadius).toBe('20px');

      view.plugin.settings.inputPanelTheme = 'glass-refraction-card';
      view.applyInputPanelThemeState();

      expect(shellEl.classList.contains('opencodian-composer-shell--liquid-glass')).toBe(false);
      expect(shellEl.dataset.opencodianLgShuding).toBeUndefined();
      expect(shellEl.querySelector('.opencodian-composer-svg-filter-layer')).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'CSS', {
        configurable: true,
        value: originalCss,
      });
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        value: originalResizeObserver,
      });
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        value: originalDevicePixelRatio,
      });
    }
  });

});
