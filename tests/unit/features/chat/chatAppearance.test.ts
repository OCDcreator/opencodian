import {
  getDefaultChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
} from '../../../../src/core/types';
import {
  buildChatAppearanceCustomCss,
  getChatAppearanceCssVariables,
  getInputPanelGlassRefractionCssVariables,
} from '../../../../src/features/chat/chatAppearance';

describe('chatAppearance utilities', () => {
  it('should map chat appearance settings to CSS variables', () => {
    const appearance = getDefaultChatAppearanceSettings();
    appearance.layout.messagesPaddingTop = 20;
    appearance.background.fitMode = 'fit-height';
    appearance.background.opacity = 80;
    appearance.background.edgeFade = 36;
    appearance.assistant.backgroundOpacity = 55;
    appearance.input.backgroundOpacity = 66;
    appearance.input.shadowBlur = 30;
    appearance.scrollbar.width = 10;
    appearance.scrollbar.thumbHoverOpacity = 90;

    const cssVariables = getChatAppearanceCssVariables(appearance);

    expect(cssVariables['--opencodian-messages-pad-top']).toBe('20px');
    expect(cssVariables['--opencodian-theme-bg-size']).toBe('auto 100%');
    expect(cssVariables['--opencodian-theme-bg-opacity']).toBe('0.8');
    expect(cssVariables['--opencodian-theme-bg-edge-fade']).toBe('36px');
    expect(cssVariables['--opencodian-assistant-bg-opacity']).toBe('55%');
    expect(cssVariables['--opencodian-input-bg-opacity']).toBe('66%');
    expect(cssVariables['--opencodian-input-shadow-blur']).toBe('30px');
    expect(cssVariables['--opencodian-scrollbar-width']).toBe('10px');
    expect(cssVariables['--opencodian-scrollbar-thumb-hover-opacity']).toBe('90%');
  });

  it('should map glass refraction tuning settings to CSS variables', () => {
    const settings = getDefaultInputPanelGlassRefractionSettings();
    settings.card.blur = 24;
    settings.card.backgroundOpacity = 40;
    settings.pill.brightness = 108;

    const cssVariables = getInputPanelGlassRefractionCssVariables(settings);

    expect(cssVariables['--opencodian-gr-glass-blur']).toBe('26px');
    expect(cssVariables['--opencodian-gr-card-blur']).toBe('24px');
    expect(cssVariables['--opencodian-gr-card-bg-alpha']).toBe('0.4');
    expect(cssVariables['--opencodian-gr-pill-brightness']).toBe('108%');
  });

  it('should build scoped custom CSS for valid declarations only', () => {
    expect(buildChatAppearanceCustomCss('--foo: 1;')).toContain('.opencodian-container');
    expect(buildChatAppearanceCustomCss('')).toBe('');
    expect(buildChatAppearanceCustomCss('.opencodian-container { color: red; }')).toBe('');
  });
});
