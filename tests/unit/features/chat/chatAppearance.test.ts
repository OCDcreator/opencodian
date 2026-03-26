import { getDefaultChatAppearanceSettings } from '../../../../src/core/types';
import { buildChatAppearanceCustomCss, getChatAppearanceCssVariables } from '../../../../src/features/chat/chatAppearance';

describe('chatAppearance utilities', () => {
  it('should map chat appearance settings to CSS variables', () => {
    const appearance = getDefaultChatAppearanceSettings();
    appearance.layout.messagesPaddingTop = 20;
    appearance.assistant.backgroundOpacity = 55;
    appearance.input.shadowBlur = 30;
    appearance.scrollbar.width = 10;
    appearance.scrollbar.thumbHoverOpacity = 90;

    const cssVariables = getChatAppearanceCssVariables(appearance);

    expect(cssVariables['--opencodian-messages-pad-top']).toBe('20px');
    expect(cssVariables['--opencodian-assistant-bg-opacity']).toBe('55%');
    expect(cssVariables['--opencodian-input-shadow-blur']).toBe('30px');
    expect(cssVariables['--opencodian-scrollbar-width']).toBe('10px');
    expect(cssVariables['--opencodian-scrollbar-thumb-hover-opacity']).toBe('90%');
  });

  it('should build scoped custom CSS for valid declarations only', () => {
    expect(buildChatAppearanceCustomCss('--foo: 1;')).toContain('.opencodian-container');
    expect(buildChatAppearanceCustomCss('')).toBe('');
    expect(buildChatAppearanceCustomCss('.opencodian-container { color: red; }')).toBe('');
  });
});
