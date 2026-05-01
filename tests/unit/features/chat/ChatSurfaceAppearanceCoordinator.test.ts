import { getDefaultChatAppearanceSettings } from '../../../../src/core/types';
import {
  ChatSurfaceAppearanceCoordinator,
  type ChatSurfaceAppearanceCoordinatorHost,
} from '../../../../src/features/chat/services/ChatSurfaceAppearanceCoordinator';

type MockedChatSurfaceAppearanceHost = {
  [Key in keyof ChatSurfaceAppearanceCoordinatorHost]:
    ChatSurfaceAppearanceCoordinatorHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ChatSurfaceAppearanceCoordinatorHost[Key];
};

function createHost(
  overrides: Partial<ChatSurfaceAppearanceCoordinatorHost> = {},
): MockedChatSurfaceAppearanceHost {
  const containerEl = document.createElement('div');
  containerEl.classList.add('opencodian-container');
  const themeBackgroundImageEl = document.createElement('div');
  themeBackgroundImageEl.classList.add('opencodian-theme-background-image');
  const messagesContainer = document.createElement('div');
  messagesContainer.classList.add('opencodian-messages');

  return {
    getChatContainerEl: jest.fn().mockReturnValue(containerEl),
    getThemeBackgroundImageEl: jest.fn().mockReturnValue(themeBackgroundImageEl),
    getMessagesContainerEl: jest.fn().mockReturnValue(messagesContainer),
    getChatAppearanceSettings: jest.fn().mockReturnValue(getDefaultChatAppearanceSettings()),
    getActiveThemePresetId: jest.fn().mockReturnValue(null),
    getChatScrollMode: jest.fn().mockReturnValue('sticky-mask'),
    resolveChatThemeBackgroundDataUrl: jest.fn().mockResolvedValue(null),
    applyConversationVisualState: jest.fn(),
    syncInputPanelAppearance: jest.fn(),
    ...overrides,
  };
}

describe('ChatSurfaceAppearanceCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncAppearanceState', () => {
    it('applies CSS variables to chat container', () => {
      const host = createHost();
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      coordinator.syncAppearanceState();

      const containerEl = host.getChatContainerEl();
      expect(containerEl.style.getPropertyValue('--opencodian-messages-pad-top')).toBe('12px');
    });

    it('applies theme preset class and CSS variables when preset is active', () => {
      const host = createHost({
        getActiveThemePresetId: jest.fn().mockReturnValue('dark'),
      });
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      coordinator.syncAppearanceState();

      expect(host.getActiveThemePresetId).toHaveBeenCalled();
    });

    it('removes previous theme classes before applying new preset', () => {
      const host = createHost();
      const containerEl = host.getChatContainerEl();
      containerEl.addClass('opencodian-theme-glass');

      const coordinator = new ChatSurfaceAppearanceCoordinator(host);
      coordinator.syncAppearanceState();

      expect(containerEl.hasClass('opencodian-theme-glass')).toBe(false);
    });

    it('injects custom CSS into a style element', () => {
      const settings = getDefaultChatAppearanceSettings();
      settings.advanced.customCssDeclarations = '--foo: bar;';
      const host = createHost({
        getChatAppearanceSettings: jest.fn().mockReturnValue(settings),
      });
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      coordinator.syncAppearanceState();

      const containerEl = host.getChatContainerEl();
      const styleEl = containerEl.querySelector('style.opencodian-chat-appearance-style');
      expect(styleEl).not.toBeNull();
      expect(styleEl!.textContent).toContain('--foo: bar');
    });

    it('updates style element text content on subsequent calls', () => {
      const host = createHost();
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      const settingsWithCss = getDefaultChatAppearanceSettings();
      settingsWithCss.advanced.customCssDeclarations = '--foo: bar;';
      host.getChatAppearanceSettings.mockReturnValue(settingsWithCss);
      coordinator.syncAppearanceState();

      const containerEl = host.getChatContainerEl();
      const styleEl = containerEl.querySelector('style.opencodian-chat-appearance-style');
      expect(styleEl).not.toBeNull();
      expect(styleEl!.textContent).toContain('--foo: bar');

      const settingsWithoutCss = getDefaultChatAppearanceSettings();
      settingsWithoutCss.advanced.customCssDeclarations = '--baz: qux;';
      host.getChatAppearanceSettings.mockReturnValue(settingsWithoutCss);
      coordinator.syncAppearanceState();

      expect(styleEl!.textContent).toContain('--baz: qux');
      expect(styleEl!.textContent).not.toContain('--foo: bar');
    });

    it('delegates conversation visual state and input panel appearance', () => {
      const host = createHost();
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      coordinator.syncAppearanceState();

      expect(host.applyConversationVisualState).toHaveBeenCalled();
      expect(host.syncInputPanelAppearance).toHaveBeenCalled();
    });
  });

  describe('syncScrollMode', () => {
    it('applies sticky-mask class by default', () => {
      const host = createHost();
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      coordinator.syncScrollMode();

      const messagesEl = host.getMessagesContainerEl();
      expect(messagesEl.hasClass('opencodian-messages--sticky-mask')).toBe(true);
    });

    it('applies natural class when scroll mode is natural', () => {
      const host = createHost({ getChatScrollMode: jest.fn().mockReturnValue('natural') });
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      coordinator.syncScrollMode();

      const messagesEl = host.getMessagesContainerEl();
      expect(messagesEl.hasClass('opencodian-messages--natural')).toBe(true);
      expect(messagesEl.hasClass('opencodian-messages--sticky-mask')).toBe(false);
    });

    it('applies sticky-basic class when scroll mode is sticky-basic', () => {
      const host = createHost({ getChatScrollMode: jest.fn().mockReturnValue('sticky-basic') });
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      coordinator.syncScrollMode();

      const messagesEl = host.getMessagesContainerEl();
      expect(messagesEl.hasClass('opencodian-messages--sticky-basic')).toBe(true);
    });

    it('removes previous scroll mode classes before applying new one', () => {
      const host = createHost();
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);
      const messagesEl = host.getMessagesContainerEl();
      messagesEl.addClass('opencodian-messages--natural');

      coordinator.syncScrollMode();

      expect(messagesEl.hasClass('opencodian-messages--natural')).toBe(false);
      expect(messagesEl.hasClass('opencodian-messages--sticky-mask')).toBe(true);
    });
  });

  describe('applyScrollModeToMessagesEl', () => {
    it('applies correct class to provided element', () => {
      const host = createHost({ getChatScrollMode: jest.fn().mockReturnValue('sticky-basic') });
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);
      const messagesEl = document.createElement('div');

      coordinator.applyScrollModeToMessagesEl(messagesEl);

      expect(messagesEl.hasClass('opencodian-messages--sticky-basic')).toBe(true);
    });
  });

  describe('scheduleSurfaceColorSync', () => {
    it('does not throw when scheduling', () => {
      const host = createHost();
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      expect(() => coordinator.scheduleSurfaceColorSync()).not.toThrow();
    });
  });

  describe('clearSurfaceSyncTimers', () => {
    it('clears pending rAF and timeout', () => {
      const host = createHost();
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);

      coordinator.scheduleSurfaceColorSync();
      coordinator.clearSurfaceSyncTimers();

      expect(() => coordinator.clearSurfaceSyncTimers()).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('clears timers and removes style element', () => {
      const settings = getDefaultChatAppearanceSettings();
      settings.advanced.customCssDeclarations = '--foo: bar;';
      const host = createHost({
        getChatAppearanceSettings: jest.fn().mockReturnValue(settings),
      });
      const coordinator = new ChatSurfaceAppearanceCoordinator(host);
      coordinator.syncAppearanceState();

      const containerEl = host.getChatContainerEl();
      expect(containerEl.querySelector('style.opencodian-chat-appearance-style')).not.toBeNull();

      coordinator.destroy();

      expect(containerEl.querySelector('style.opencodian-chat-appearance-style')).toBeNull();
    });
  });
});
