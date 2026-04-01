import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { getDefaultChatAppearanceSettings, getDefaultThemeSettings } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

type GlassViewHarness = {
  composerShellEl: HTMLElement | null;
  plugin: {
    settings: {
      experimentalComposerGlassRefractionEnabled: boolean;
    };
  };
  initializeComposerGlassRefraction: (composerShellEl: HTMLElement) => void;
  applyComposerGlassRefractionState: () => void;
};

describe('OpenCodianView composer glass refraction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function createView(enabled: boolean): GlassViewHarness {
    return new OpenCodianView(new WorkspaceLeaf(), {
      settings: {
        effortLevel: 'medium',
        thinkingBudget: 0,
        locale: 'en',
        theme: getDefaultThemeSettings(),
        chatAppearance: getDefaultChatAppearanceSettings(),
        experimentalComposerGlassRefractionEnabled: enabled,
      },
      openCodeService: {},
      storage: {},
    } as never) as unknown as GlassViewHarness;
  }

  it('adds the glass layer and active class when enabled', () => {
    const view = createView(true);
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    view.composerShellEl = shellEl;

    view.initializeComposerGlassRefraction(shellEl);

    expect(shellEl.classList.contains('opencodian-composer-shell--glass-refract')).toBe(true);
    expect(shellEl.querySelector('.opencodian-composer-glass-fx')).not.toBeNull();
    expect(shellEl.querySelector('.opencodian-composer-glass-fx-refract')).not.toBeNull();
    expect(document.querySelectorAll('#opencodian-glass-svg-defs')).toHaveLength(1);
  });

  it('toggles the active class without duplicating svg defs', () => {
    const view = createView(false);
    const shellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    view.composerShellEl = shellEl;

    view.initializeComposerGlassRefraction(shellEl);
    expect(shellEl.classList.contains('opencodian-composer-shell--glass-refract')).toBe(false);
    expect(document.querySelectorAll('#opencodian-glass-svg-defs')).toHaveLength(0);

    view.plugin.settings.experimentalComposerGlassRefractionEnabled = true;
    view.applyComposerGlassRefractionState();

    expect(shellEl.classList.contains('opencodian-composer-shell--glass-refract')).toBe(true);
    expect(document.querySelectorAll('#opencodian-glass-svg-defs')).toHaveLength(1);

    view.plugin.settings.experimentalComposerGlassRefractionEnabled = false;
    view.applyComposerGlassRefractionState();
    expect(shellEl.classList.contains('opencodian-composer-shell--glass-refract')).toBe(false);

    const secondView = createView(true);
    const secondShellEl = document.body.createDiv({ cls: 'opencodian-composer-shell' });
    secondView.composerShellEl = secondShellEl;
    secondView.initializeComposerGlassRefraction(secondShellEl);

    expect(document.querySelectorAll('#opencodian-glass-svg-defs')).toHaveLength(1);
  });
});
