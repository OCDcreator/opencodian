import { setIcon } from 'obsidian';

import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import { LspStatusIndicator, type LspStatusSummary } from '../ui/LspStatusIndicator';
import { LspStatusRefreshCoordinator } from './LspStatusRefreshCoordinator';

const logger = createLogger('OpenCodianView');

/** Logo SVG for light theme (dark logo on light bg) - from opencode-logo-light.svg */
const LOGO_SVG_LIGHT = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_light)"><mask id="mask0_light" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_light)"><path d="M180 240H60V120H180V240Z" fill="#CFCECD"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#211E1E"/></g></g><defs><clipPath id="clip0_light"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;

/** Logo SVG for dark theme (light logo on dark bg) - from opencode-logo-dark.svg */
const LOGO_SVG_DARK = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_dark)"><mask id="mask0_dark" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_dark)"><path d="M180 240H60V120H180V240Z" fill="#4B4646"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC"/></g></g><defs><clipPath id="clip0_dark"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;
const TITLE_WORDMARK_LIGHT_ASSET_PATH = 'assets/branding/opencodian-wordmark-light.svg';
const TITLE_WORDMARK_DARK_ASSET_PATH = 'assets/branding/opencodian-wordmark-dark.svg';
const SERVER_STATUS_CLASS_NAMES = [
  'is-checking',
  'is-running',
  'is-starting',
  'is-offline',
  'is-external',
] as const;

type ServerStatusTranslationKey =
  | 'chat.serverStatus.checking'
  | 'chat.serverStatus.running'
  | 'chat.serverStatus.starting'
  | 'chat.serverStatus.offline'
  | 'chat.serverStatus.external';

const SERVER_STATUS_KEY_BY_AVAILABILITY: Record<ChatServerAvailability, ServerStatusTranslationKey> = {
  checking: 'chat.serverStatus.checking',
  running: 'chat.serverStatus.running',
  starting: 'chat.serverStatus.starting',
  offline: 'chat.serverStatus.offline',
  external: 'chat.serverStatus.external',
};

export type ChatServerAvailability = 'checking' | 'running' | 'starting' | 'offline' | 'external';

export interface ChatHeaderPresenterHost {
  setTooltipLabel(
    element: HTMLElement,
    label: string,
    position?: 'bottom' | 'top' | 'right',
  ): void;
  registerCssChangeListener(listener: () => void): void;
  resolveAssetUrl(relativePath: string): string | null;
  scheduleChatSurfaceColorSync(): void;
  scheduleComposerLayoutSync(): void;
  resolveServerAvailability(): Promise<ChatServerAvailability>;
  isLocalServerMode(): boolean;
  refreshContextUsageIndicator(): void;
  openServerSettings(): void;
  openLspSettings?(): void;
  createConversationInNewTab(): Promise<void>;
  createConversationInCurrentTab(): Promise<void>;
  showConversationHistory(event: MouseEvent): void;
  openConversationSessionSettings(): void;
  openSettings(): void;
}

export class ChatHeaderPresenter {
  private headerTabBarSlotEl: HTMLElement | null = null;
  private logoContainerEl: HTMLElement | null = null;
  private titleWordmarkEl: HTMLImageElement | null = null;
  private serverStatusBadgeEl: HTMLElement | null = null;
  private serverStatusTextEl: HTMLElement | null = null;
  private lspStatusIndicator: LspStatusIndicator | null = null;
  private newConversationBtnEl: HTMLElement | null = null;
  private newConversationCurrentTabBtnEl: HTMLElement | null = null;
  private historyBtnEl: HTMLElement | null = null;
  private conversationSessionSettingsBtnEl: HTMLElement | null = null;
  private settingsBtnEl: HTMLElement | null = null;
  private serverStatusIntervalId: number | null = null;
  private lspStatusRefreshCoordinator: LspStatusRefreshCoordinator | null = null;
  private openLspSettingsCallback: (() => void) | null = null;
  private isRefreshingServerStatus = false;
  private lastServerAvailability: ChatServerAvailability | null = null;
  private hasRegisteredCssChangeListener = false;

  constructor(private readonly host: ChatHeaderPresenterHost) {}

  build(headerEl: HTMLElement): void {
    const titleEl = headerEl.createDiv({ cls: 'opencodian-title' });

    this.logoContainerEl = titleEl.createDiv({ cls: 'opencodian-logo' });
    this.titleWordmarkEl = titleEl.createEl('img', {
      cls: 'opencodian-title-text',
      attr: {
        alt: 'OpenCodian',
        draggable: 'false',
      },
    });
    this.syncThemeAssets();

    this.headerTabBarSlotEl = headerEl.createDiv({
      cls: 'opencodian-tab-bar-slot opencodian-tab-bar-slot--header',
    });

    if (!this.hasRegisteredCssChangeListener) {
      this.host.registerCssChangeListener(() => {
        this.syncThemeAssets();
        this.host.scheduleChatSurfaceColorSync();
        this.host.scheduleComposerLayoutSync();
      });
      this.hasRegisteredCssChangeListener = true;
    }

    const actionsEl = headerEl.createDiv({ cls: 'opencodian-header-actions' });
    this.buildStatusBadge(actionsEl);
    this.lspStatusIndicator = new LspStatusIndicator(actionsEl, {
      onClick: () => (this.openLspSettingsCallback ?? this.host.openLspSettings)?.(),
      setTooltipLabel: (element, label, position) => this.host.setTooltipLabel(element, label, position),
    });
    this.lspStatusIndicator.load();
    this.newConversationBtnEl = this.buildActionButton(
      actionsEl,
      'opencodian-circle-plus',
      () => t('chat.tab.newTooltip'),
      () => {
        void this.host.createConversationInNewTab();
      },
    );
    this.newConversationBtnEl.addClass('opencodian-header-btn--new-tab');
    this.newConversationCurrentTabBtnEl = this.buildActionButton(
      actionsEl,
      'opencodian-message-square-plus',
      () => t('chat.tab.newCurrentTooltip'),
      () => {
        void this.host.createConversationInCurrentTab();
      },
    );
    this.historyBtnEl = this.buildActionButton(
      actionsEl,
      'history',
      () => t('chat.history.open'),
      (event) => {
        this.host.showConversationHistory(event);
      },
    );
    this.conversationSessionSettingsBtnEl = this.buildActionButton(
      actionsEl,
      'sliders-horizontal',
      () => t('chat.sessionSettings.open'),
      () => {
        this.host.openConversationSessionSettings();
      },
    );
    this.settingsBtnEl = this.buildActionButton(
      actionsEl,
      'settings',
      () => t('chat.settings.open'),
      () => {
        this.host.openSettings();
      },
    );

    this.applyLocaleTexts();
  }

  getTabBarSlotEl(): HTMLElement | null {
    return this.headerTabBarSlotEl;
  }

  applyLocaleTexts(): void {
    if (this.serverStatusBadgeEl) {
      this.host.setTooltipLabel(this.serverStatusBadgeEl, t('chat.serverStatus.openSettings'), 'bottom');
    }

    if (this.newConversationBtnEl) {
      this.host.setTooltipLabel(this.newConversationBtnEl, t('chat.tab.newTooltip'), 'bottom');
    }

    if (this.newConversationCurrentTabBtnEl) {
      this.host.setTooltipLabel(this.newConversationCurrentTabBtnEl, t('chat.tab.newCurrentTooltip'), 'bottom');
    }

    if (this.historyBtnEl) {
      this.host.setTooltipLabel(this.historyBtnEl, t('chat.history.open'), 'bottom');
    }

    if (this.conversationSessionSettingsBtnEl) {
      this.host.setTooltipLabel(
        this.conversationSessionSettingsBtnEl,
        t('chat.sessionSettings.open'),
        'bottom',
      );
    }

    if (this.settingsBtnEl) {
      this.host.setTooltipLabel(this.settingsBtnEl, t('chat.settings.open'), 'bottom');
    }

    if (this.serverStatusTextEl) {
      this.serverStatusTextEl.setText(this.getServerStatusLabel(this.lastServerAvailability ?? 'checking'));
    }

    this.lspStatusIndicator?.refreshLocale();
  }

  updateLspStatus(status: LspStatusSummary): void {
    this.lspStatusIndicator?.update(status);
  }

  startLspStatusLoop(
    getStatus: () => Promise<unknown>,
    openSettings: () => void,
  ): void {
    this.openLspSettingsCallback = openSettings;
    this.lspStatusRefreshCoordinator?.stop();
    this.lspStatusRefreshCoordinator = new LspStatusRefreshCoordinator(
      getStatus,
      (status) => this.updateLspStatus(status),
    );
    this.lspStatusRefreshCoordinator.start();
  }

  startServerStatusLoop(): void {
    void this.refreshServerStatusBadge();
    this.stopServerStatusLoop();
    this.serverStatusIntervalId = window.setInterval(() => {
      void this.refreshServerStatusBadge();
    }, 5000);
  }

  stopServerStatusLoop(): void {
    if (this.serverStatusIntervalId) {
      window.clearInterval(this.serverStatusIntervalId);
      this.serverStatusIntervalId = null;
    }
  }

  destroy(): void {
    this.stopServerStatusLoop();
    this.lspStatusRefreshCoordinator?.stop();
    this.lspStatusRefreshCoordinator = null;
    this.openLspSettingsCallback = null;
    this.headerTabBarSlotEl = null;
    this.logoContainerEl = null;
    this.titleWordmarkEl = null;
    this.serverStatusBadgeEl = null;
    this.serverStatusTextEl = null;
    this.lspStatusIndicator?.unload();
    this.lspStatusIndicator = null;
    this.newConversationBtnEl = null;
    this.newConversationCurrentTabBtnEl = null;
    this.historyBtnEl = null;
    this.conversationSessionSettingsBtnEl = null;
    this.settingsBtnEl = null;
    this.isRefreshingServerStatus = false;
    this.lastServerAvailability = null;
  }

  private buildStatusBadge(actionsEl: HTMLElement): void {
    this.serverStatusBadgeEl = actionsEl.createDiv({ cls: 'opencodian-server-status-badge is-checking' });
    this.serverStatusBadgeEl.addClass('opencodian-tooltip-trigger');
    this.serverStatusBadgeEl.createSpan({ cls: 'opencodian-server-status-dot' });
    this.serverStatusTextEl = this.serverStatusBadgeEl.createSpan({
      cls: 'opencodian-server-status-text',
      text: t('chat.serverStatus.checking'),
    });
    this.serverStatusBadgeEl.addEventListener('click', () => {
      this.host.openServerSettings();
    });
  }

  private buildActionButton(
    actionsEl: HTMLElement,
    iconName: string,
    getTooltipLabel: () => string,
    onClick: (event: MouseEvent) => void,
  ): HTMLElement {
    const buttonEl = actionsEl.createDiv({ cls: 'opencodian-header-btn opencodian-tooltip-trigger' });
    setIcon(buttonEl, iconName);
    this.host.setTooltipLabel(buttonEl, getTooltipLabel(), 'bottom');
    buttonEl.addEventListener('click', (event) => {
      onClick(event);
    });
    return buttonEl;
  }

  async refreshServerStatusBadge(): Promise<void> {
    if (!this.serverStatusBadgeEl || !this.serverStatusTextEl || this.isRefreshingServerStatus) {
      return;
    }

    this.isRefreshingServerStatus = true;
    try {
      const availability = await this.host.resolveServerAvailability();
      if (!this.serverStatusBadgeEl || !this.serverStatusTextEl) {
        return;
      }
      if (availability !== this.lastServerAvailability) {
        logger.debug(`Chat server availability -> ${availability}`);
        this.lastServerAvailability = availability;
      }

      this.serverStatusBadgeEl.removeClass(...SERVER_STATUS_CLASS_NAMES);
      this.serverStatusBadgeEl.addClass(`is-${availability}`);
      this.serverStatusTextEl.setText(this.getServerStatusLabel(availability));
      this.host.setTooltipLabel(this.serverStatusBadgeEl, t('chat.serverStatus.openSettings'), 'bottom');
      this.host.refreshContextUsageIndicator();
    } finally {
      this.isRefreshingServerStatus = false;
    }
  }

  private getServerStatusLabel(availability: ChatServerAvailability): string {
    if (this.host.isLocalServerMode()) {
      if (availability === 'running') {
        return t('chat.serverStatus.localManaged');
      }
      if (availability === 'external') {
        return t('chat.serverStatus.localExternal');
      }
    }

    if (availability === 'running' || availability === 'external') {
      return t('chat.serverStatus.remoteConnected');
    }

    return t(SERVER_STATUS_KEY_BY_AVAILABILITY[availability]);
  }

  private syncThemeAssets(): void {
    if (this.logoContainerEl) {
      this.logoContainerEl.innerHTML = this.getLogoSvg();
    }

    if (!this.titleWordmarkEl) {
      return;
    }

    const src = this.getTitleWordmarkSrc();
    if (src) {
      this.titleWordmarkEl.setAttribute('src', src);
      return;
    }

    this.titleWordmarkEl.removeAttribute('src');
  }

  private getLogoSvg(): string {
    const isDark = document.body.classList.contains('theme-dark');
    return isDark ? LOGO_SVG_DARK : LOGO_SVG_LIGHT;
  }

  private getTitleWordmarkSrc(): string | null {
    const isDark = document.body.classList.contains('theme-dark');
    const relativePath = isDark ? TITLE_WORDMARK_DARK_ASSET_PATH : TITLE_WORDMARK_LIGHT_ASSET_PATH;
    return this.host.resolveAssetUrl(relativePath);
  }
}
