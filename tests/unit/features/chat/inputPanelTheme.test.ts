import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import {
  getDefaultChatAppearanceSettings,
  getDefaultThemeSettings,
  type InputPanelThemeId,
} from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

type InputPanelThemeViewHarness = {
  composerShellEl: HTMLElement | null;
  plugin: {
    settings: {
      inputPanelTheme: InputPanelThemeId;
    };
  };
  applyInputPanelThemeState: () => void;
};

describe('OpenCodianView input panel theme', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
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
      },
      openCodeService: {},
      storage: {},
    } as never) as unknown as InputPanelThemeViewHarness;
  }

  it('keeps preset mode free of glass-refraction classes and experimental fx dom', () => {
    const view = createView('preset');
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    view.composerShellEl = shellEl;

    view.applyInputPanelThemeState();

    expect(shellEl.classList.contains('opencodian-composer-shell--gr-glass')).toBe(false);
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-card')).toBe(false);
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-pill')).toBe(false);
    expect(shellEl.querySelector('.opencodian-composer-glass-fx')).toBeNull();
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

    view.plugin.settings.inputPanelTheme = 'preset';
    view.applyInputPanelThemeState();
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-card')).toBe(false);
    expect(shellEl.classList.contains('opencodian-composer-shell--gr-pill')).toBe(false);
  });
});
