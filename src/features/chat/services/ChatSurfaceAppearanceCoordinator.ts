import {
  getThemePresetDefinition,
  THEME_PRESET_CSS_VARIABLE_NAMES,
  THEME_STYLE_CONTAINER_CLASSES,
} from '../../../core/theme';
import type { ChatAppearanceSettings } from '../../../core/types';
import type { ThemePresetId } from '../../../core/types/settings';
import {
  buildChatAppearanceCustomCss,
  getChatAppearanceCssVariables,
} from '../chatAppearance';
import { SESSION_TREE_BASE_CSS } from './ChildSessionGraphCoordinator';

export interface ChatSurfaceAppearanceCoordinatorHost {
  getChatContainerEl(): HTMLElement | null;
  getThemeBackgroundImageEl(): HTMLDivElement | null;
  getMessagesContainerEl(): HTMLElement | null;
  getChatAppearanceSettings(): ChatAppearanceSettings;
  getActiveThemePresetId(): ThemePresetId | null | undefined;
  getChatScrollMode(): 'natural' | 'sticky-basic' | 'sticky-mask';
  resolveChatThemeBackgroundDataUrl(): Promise<string | null>;
  applyConversationVisualState(): void;
  syncInputPanelAppearance(): void;
}

export class ChatSurfaceAppearanceCoordinator {
  private chatAppearanceStyleEl: HTMLStyleElement | null = null;
  private themeBackgroundRequestId = 0;
  private chatSurfaceSyncFrameId: number | null = null;
  private chatSurfaceSyncTimeoutId: number | null = null;

  constructor(private readonly host: ChatSurfaceAppearanceCoordinatorHost) {}

  syncAppearanceState(): void {
    const chatContainerEl = this.host.getChatContainerEl();
    if (!chatContainerEl) {
      return;
    }

    const activePreset = getThemePresetDefinition(this.host.getActiveThemePresetId());
    for (const containerClass of THEME_STYLE_CONTAINER_CLASSES) {
      chatContainerEl.removeClass(containerClass);
    }
    for (const cssVar of THEME_PRESET_CSS_VARIABLE_NAMES) {
      chatContainerEl.style.removeProperty(cssVar);
    }
    if (activePreset) {
      chatContainerEl.addClass(activePreset.containerClass);
      for (const [cssVar, cssValue] of Object.entries(activePreset.cssVariables)) {
        chatContainerEl.style.setProperty(cssVar, cssValue);
      }
    }

    const cssVariables = getChatAppearanceCssVariables(this.host.getChatAppearanceSettings());
    for (const [cssVar, cssValue] of Object.entries(cssVariables)) {
      chatContainerEl.style.setProperty(cssVar, cssValue);
    }

    this.host.applyConversationVisualState();

    this.themeBackgroundRequestId += 1;
    chatContainerEl.removeClass('opencodian-container--theme-background');
    this.host.getThemeBackgroundImageEl()?.style.removeProperty('background-image');
    void this.applyThemeBackgroundImage(this.themeBackgroundRequestId);

    const customCss = buildChatAppearanceCustomCss(
      this.host.getChatAppearanceSettings().advanced.customCssDeclarations,
    );
    const combinedCss = `${SESSION_TREE_BASE_CSS}\n${customCss}`.trim();

    if (combinedCss) {
      if (!this.chatAppearanceStyleEl) {
        this.chatAppearanceStyleEl = document.createElement('style');
        this.chatAppearanceStyleEl.className = 'opencodian-chat-appearance-style';
        chatContainerEl.appendChild(this.chatAppearanceStyleEl);
      }
      this.chatAppearanceStyleEl.textContent = combinedCss;
    } else if (this.chatAppearanceStyleEl) {
      this.chatAppearanceStyleEl.remove();
      this.chatAppearanceStyleEl = null;
    }

    this.host.syncInputPanelAppearance();
  }

  syncScrollMode(): void {
    this.syncChatSurfaceColor();

    const messagesEl = this.host.getMessagesContainerEl();
    if (messagesEl) {
      this.applyScrollModeToMessagesEl(messagesEl);
    }
  }

  applyScrollModeToMessagesEl(messagesEl: HTMLElement): void {
    messagesEl.removeClass('opencodian-messages--sticky-basic');
    messagesEl.removeClass('opencodian-messages--sticky-mask');
    messagesEl.removeClass('opencodian-messages--natural');

    const scrollMode = this.host.getChatScrollMode();
    if (scrollMode === 'natural') {
      messagesEl.addClass('opencodian-messages--natural');
    } else if (scrollMode === 'sticky-basic') {
      messagesEl.addClass('opencodian-messages--sticky-basic');
    } else {
      messagesEl.addClass('opencodian-messages--sticky-mask');
    }
  }

  scheduleSurfaceColorSync(): void {
    this.clearSurfaceSyncTimers();

    this.chatSurfaceSyncFrameId = window.requestAnimationFrame(() => {
      this.chatSurfaceSyncFrameId = window.requestAnimationFrame(() => {
        this.syncChatSurfaceColor();
        this.chatSurfaceSyncFrameId = null;
      });
    });

    this.chatSurfaceSyncTimeoutId = window.setTimeout(() => {
      this.syncChatSurfaceColor();
      this.chatSurfaceSyncTimeoutId = null;
    }, 80);
  }

  clearSurfaceSyncTimers(): void {
    if (this.chatSurfaceSyncFrameId !== null) {
      window.cancelAnimationFrame(this.chatSurfaceSyncFrameId);
      this.chatSurfaceSyncFrameId = null;
    }

    if (this.chatSurfaceSyncTimeoutId !== null) {
      window.clearTimeout(this.chatSurfaceSyncTimeoutId);
      this.chatSurfaceSyncTimeoutId = null;
    }
  }

  destroy(): void {
    this.clearSurfaceSyncTimers();
    this.chatAppearanceStyleEl?.remove();
    this.chatAppearanceStyleEl = null;
  }

  private async applyThemeBackgroundImage(requestId: number): Promise<void> {
    const chatContainerEl = this.host.getChatContainerEl();
    const themeBackgroundImageEl = this.host.getThemeBackgroundImageEl();
    if (!chatContainerEl || !themeBackgroundImageEl) {
      return;
    }

    const backgroundSettings = this.host.getChatAppearanceSettings().background;
    if (!backgroundSettings.imagePath) {
      return;
    }

    const dataUrl = await this.host.resolveChatThemeBackgroundDataUrl();
    if (
      !this.host.getChatContainerEl() ||
      !this.host.getThemeBackgroundImageEl() ||
      requestId !== this.themeBackgroundRequestId ||
      !dataUrl
    ) {
      return;
    }

    themeBackgroundImageEl.style.backgroundImage = `url(${JSON.stringify(dataUrl)})`;
    chatContainerEl.addClass('opencodian-container--theme-background');
  }

  syncChatSurfaceColor(): void {
    const chatContainerEl = this.host.getChatContainerEl();
    if (!chatContainerEl) {
      return;
    }

    let currentEl: HTMLElement | null = chatContainerEl;
    let resolvedColor = '';

    while (currentEl) {
      const backgroundColor = window.getComputedStyle(currentEl).backgroundColor;
      if (backgroundColor && backgroundColor !== 'transparent' && backgroundColor !== 'rgba(0, 0, 0, 0)') {
        resolvedColor = backgroundColor;
        break;
      }
      currentEl = currentEl.parentElement;
    }

    if (!resolvedColor) {
      resolvedColor = 'var(--background-secondary)';
    }

    chatContainerEl.style.setProperty('--opencodian-chat-surface', resolvedColor);
  }
}
