import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import {
  getDefaultChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getDefaultThemeSettings,
  type InputPanelGlassRefractionSvgFilterSettings,
  type InputPanelThemeId,
} from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { setLocale } from '../../../../src/i18n';

type InputPanelThemeViewHarness = {
  composerShellEl: HTMLElement | null;
  sendBtn: HTMLElement | null;
  plugin: {
    settings: {
      chatAppearance: ReturnType<typeof getDefaultChatAppearanceSettings>;
      inputPanelTheme: InputPanelThemeId;
      inputPanelGlassRefraction: ReturnType<typeof getDefaultInputPanelGlassRefractionSettings>;
      inputPanelGlassRefractionSvgFilter: InputPanelGlassRefractionSvgFilterSettings;
    };
  };
  applyInputPanelThemeState: () => void;
  applyInputActionButtonStyleState: () => void;
  updateSendButtonState: () => void;
};

describe('OpenCodianView input panel theme', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
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
      },
      openCodeService: {},
      storage: {},
    } as never) as unknown as InputPanelThemeViewHarness;
  }

  it('keeps preset mode free of glass-refraction classes and extra glass nodes', () => {
    const view = createView('preset');
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    view.composerShellEl = shellEl;

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
    view.composerShellEl = shellEl;

    view.applyInputPanelThemeState();

    expect(shellEl.classList.contains(className)).toBe(true);
  });

  it('applies the glass class without mounting extra runtime nodes', () => {
    const view = createView('glass-refraction-glass');
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    view.composerShellEl = shellEl;

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
    view.composerShellEl = shellEl;
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
    view.composerShellEl = shellEl;
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
    view.composerShellEl = shellEl;

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
    view.composerShellEl = shellEl;

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
    view.sendBtn = document.body.createEl('button', { cls: 'opencodian-tooltip-trigger' });
    const streamingSpy = jest.spyOn(
      view as unknown as { isActiveTabStreaming: () => boolean },
      'isActiveTabStreaming',
    );

    streamingSpy.mockReturnValue(false);
    view.updateSendButtonState();
    expect(view.sendBtn?.getAttribute('data-tooltip')).toBe('发送消息');

    streamingSpy.mockReturnValue(true);
    view.updateSendButtonState();
    expect(view.sendBtn?.getAttribute('data-tooltip')).toBe('停止生成');
  });
});
