import { setIcon } from 'obsidian';

import type { AgentBackendKind } from '../../../core/types/chat';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import { getOpenCodianWordmarkDataUrl } from '../../../shared/brandingWordmark';
import { renderAgentSwitcherBackendIcon } from '../../settings/AgentSwitcherFloatingIcons';
import { LspStatusIndicator, type LspStatusSummary } from '../ui/LspStatusIndicator';
import { LspStatusRefreshCoordinator } from './LspStatusRefreshCoordinator';

const logger = createLogger('OpenCodianView');

/** Logo SVG for light theme (dark logo on light bg) - from opencode-logo-light.svg */
const LOGO_SVG_LIGHT = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_light)"><mask id="mask0_light" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_light)"><path d="M180 240H60V120H180V240Z" fill="#CFCECD"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#211E1E"/></g></g><defs><clipPath id="clip0_light"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;

/** Logo SVG for dark theme (light logo on dark bg) - from opencode-logo-dark.svg */
const LOGO_SVG_DARK = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_dark)"><mask id="mask0_dark" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_dark)"><path d="M180 240H60V120H180V240Z" fill="#4B4646"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC"/></g></g><defs><clipPath id="clip0_dark"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;
const SERVER_STATUS_CLASS_NAMES = [
  'is-checking',
  'is-disabled',
  'is-running',
  'is-starting',
  'is-offline',
  'is-external',
] as const;

type ServerStatusTranslationKey =
  | 'chat.serverStatus.checking'
  | 'chat.serverStatus.disabled'
  | 'chat.serverStatus.running'
  | 'chat.serverStatus.starting'
  | 'chat.serverStatus.offline'
  | 'chat.serverStatus.external';

const SERVER_STATUS_KEY_BY_AVAILABILITY: Record<ChatServerAvailability, ServerStatusTranslationKey> = {
  checking: 'chat.serverStatus.checking',
  disabled: 'chat.serverStatus.disabled',
  running: 'chat.serverStatus.running',
  starting: 'chat.serverStatus.starting',
  offline: 'chat.serverStatus.offline',
  external: 'chat.serverStatus.external',
};
const SERVER_STATUS_LABEL_FALLBACK_GLYPH_WIDTH_PX = 7;
const SERVER_STATUS_INLINE_CHROME_WIDTH_PX = 46;
const SERVER_STATUS_MIN_EXPANDED_WIDTH_PX = 72;
const SERVER_STATUS_MAX_EXPANDED_WIDTH_PX = 220;

function readOpenCodianPlugin(): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).app?.plugins?.plugins?.opencodian ?? null;
  } catch {
    return null;
  }
}

function readActiveBackendFromPlugin(): AgentBackendKind {
  const value = (readOpenCodianPlugin() as { settings?: { activeBackend?: string } } | null)?.settings?.activeBackend;
  if (
    value === 'opencode'
    || value === 'claude-code'
    || value === 'codex'
    || value === 'copilot'
    || value === 'pi'
  ) {
    return value;
  }
  return 'opencode';
}

interface HeaderActionButtonConfig {
  actionId: string;
  iconName: string;
  getTooltipLabel: () => string;
  onClick: (event: MouseEvent) => void;
}

export type ChatServerAvailability =
  | 'checking'
  | 'disabled'
  | 'running'
  | 'starting'
  | 'offline'
  | 'external';

export interface ChatHeaderPresenterHost {
  setTooltipLabel(
    element: HTMLElement,
    label: string,
    position?: 'bottom' | 'left' | 'right' | 'top',
  ): void;
  registerCssChangeListener(listener: () => void): void;
  resolveAssetUrl(relativePath: string): string | null;
  scheduleChatSurfaceColorSync(): void;
  scheduleComposerLayoutSync(): void;
  resolveServerAvailability(): Promise<ChatServerAvailability>;
  isLocalServerMode(): boolean;
  isOpenCodeBackend(): boolean;
  getActiveBackendDisplayName?(): string;
  /** Canonical active backend kind for stable attributes and CSS hooks. Optional; when absent the presenter reads from the live plugin settings. */
  getActiveBackendKind?(): AgentBackendKind;
  refreshContextUsageIndicator(): void;
  onServerAvailabilityRefreshed?(): void;
  openServerSettings(): void;
  openLspSettings?(): void;
  createConversationInNewTab(): Promise<void>;
  createConversationInCurrentTab(): Promise<void>;
  showConversationHistory(event: MouseEvent): void;
  openConversationSessionSettings(): void;
  showOpenCodeDiagnostics?(event: MouseEvent): void;
  getOpenCodeDiagnosticsState?(): 'disabled' | 'normal' | 'armed' | 'capturing' | 'warning' | 'critical' | 'degraded';
  showCodexDiagnostics?(event: MouseEvent, tabId: string): void;
  getCodexDiagnosticsState?(tabId: string): 'disabled' | 'degraded' | 'armed' | 'capturing' | 'normal' | 'warning' | 'critical';
  /** Active chat tab id for the codex diagnostics routing; null when tabs are unavailable. */
  getActiveDiagnosticsTabId?(): string | null;
  openSettings(): void;
}

export class ChatHeaderPresenter {
  private headerTabBarSlotEl: HTMLElement | null = null;
  private logoContainerEl: HTMLElement | null = null;
  private titleWordmarkEl: HTMLImageElement | null = null;
  private serverStatusBadgeEl: HTMLButtonElement | null = null;
  private serverStatusIconEl: HTMLElement | null = null;
  private serverStatusTextEl: HTMLElement | null = null;
  private headerActionsEl: HTMLElement | null = null;
  private headerStatusGroupEl: HTMLElement | null = null;
  private lspStatusIndicator: LspStatusIndicator | null = null;
  private newConversationBtnEl: HTMLElement | null = null;
  private newConversationCurrentTabBtnEl: HTMLElement | null = null;
  private historyBtnEl: HTMLElement | null = null;
  private conversationSessionSettingsBtnEl: HTMLElement | null = null;
  private diagnosticsBtnEl: HTMLElement | null = null;
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
    this.headerActionsEl = actionsEl;
    const statusGroupEl = actionsEl.createDiv({ cls: 'opencodian-header-action-group opencodian-header-status-group' });
    const conversationGroupEl = actionsEl.createDiv({ cls: 'opencodian-header-action-group opencodian-header-conversation-group' });
    const configGroupEl = actionsEl.createDiv({ cls: 'opencodian-header-action-group opencodian-header-config-group' });
    this.headerStatusGroupEl = statusGroupEl;
    this.buildStatusBadge(statusGroupEl);
    this.refreshBackendChrome();
    this.newConversationCurrentTabBtnEl = this.buildActionButton(conversationGroupEl, {
      actionId: 'new-current-tab',
      iconName: 'opencodian-message-square-plus',
      getTooltipLabel: () => t('chat.tab.newCurrentTooltip'),
      onClick: () => {
        void this.host.createConversationInCurrentTab();
      },
    });
    this.newConversationBtnEl = this.buildActionButton(conversationGroupEl, {
      actionId: 'new-tab',
      iconName: 'opencodian-circle-plus',
      getTooltipLabel: () => t('chat.tab.newTooltip'),
      onClick: () => {
        void this.host.createConversationInNewTab();
      },
    });
    this.newConversationBtnEl.addClass('opencodian-header-btn--new-tab');
    this.historyBtnEl = this.buildActionButton(conversationGroupEl, {
      actionId: 'history',
      iconName: 'history',
      getTooltipLabel: () => t('chat.history.open'),
      onClick: (event) => {
        this.host.showConversationHistory(event);
      },
    });
    this.conversationSessionSettingsBtnEl = this.buildActionButton(configGroupEl, {
      actionId: 'session-settings',
      iconName: 'sliders-horizontal',
      getTooltipLabel: () => t('chat.sessionSettings.open'),
      onClick: () => {
        this.host.openConversationSessionSettings();
      },
    });
    this.diagnosticsBtnEl = this.buildActionButton(configGroupEl, {
      actionId: 'opencode-diagnostics',
      iconName: 'activity',
      getTooltipLabel: () => t('chat.opencodeDiagnostics.open'),
      onClick: (event) => this.routeDiagnosticsClick(event),
    });
    this.refreshBackendChrome();
    this.settingsBtnEl = this.buildActionButton(configGroupEl, {
      actionId: 'settings',
      iconName: 'settings',
      getTooltipLabel: () => t('chat.settings.open'),
      onClick: () => {
        this.host.openSettings();
      },
    });

    this.applyLocaleTexts();
  }

  getTabBarSlotEl(): HTMLElement | null {
    return this.headerTabBarSlotEl;
  }

  applyLocaleTexts(): void {
    if (this.serverStatusBadgeEl) {
      this.host.setTooltipLabel(this.serverStatusBadgeEl, this.getStatusSettingsTooltip(), 'bottom');
    }

    if (this.newConversationBtnEl) {
      this.applyActionLabel(this.newConversationBtnEl, t('chat.tab.newTooltip'));
    }

    if (this.newConversationCurrentTabBtnEl) {
      this.applyActionLabel(this.newConversationCurrentTabBtnEl, t('chat.tab.newCurrentTooltip'));
    }

    if (this.historyBtnEl) {
      this.applyActionLabel(this.historyBtnEl, t('chat.history.open'));
    }

    if (this.conversationSessionSettingsBtnEl) {
      this.applyActionLabel(this.conversationSessionSettingsBtnEl, t('chat.sessionSettings.open'));
    }

    if (this.settingsBtnEl) {
      this.applyActionLabel(this.settingsBtnEl, t('chat.settings.open'));
    }
    if (this.diagnosticsBtnEl) {
      this.applyActionLabel(this.diagnosticsBtnEl, t('chat.opencodeDiagnostics.open'));
    }

    if (this.serverStatusTextEl) {
      this.updateServerStatusLabel(this.getServerStatusLabel(this.lastServerAvailability ?? 'checking'));
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
    if (!this.host.isOpenCodeBackend()) {
      this.lspStatusRefreshCoordinator?.stop();
      this.lspStatusRefreshCoordinator = null;
      this.openLspSettingsCallback = null;
      return;
    }

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
    this.serverStatusIconEl = null;
    this.serverStatusTextEl = null;
    this.headerActionsEl = null;
    this.headerStatusGroupEl = null;
    this.lspStatusIndicator?.unload();
    this.lspStatusIndicator = null;
    this.newConversationBtnEl = null;
    this.newConversationCurrentTabBtnEl = null;
    this.historyBtnEl = null;
    this.conversationSessionSettingsBtnEl = null;
    this.diagnosticsBtnEl = null;
    this.settingsBtnEl = null;
    this.isRefreshingServerStatus = false;
    this.lastServerAvailability = null;
  }

  refreshBackendChrome(): void {
    const statusGroupEl = this.headerStatusGroupEl ?? this.headerActionsEl;
    if (!statusGroupEl) {
      return;
    }

    const isCodexDiagnostics = this.getActiveBackendKind() === 'codex'
      && Boolean(this.host.showCodexDiagnostics && this.host.getCodexDiagnosticsState);
    if (this.host.isOpenCodeBackend() || isCodexDiagnostics) {
      this.diagnosticsBtnEl?.removeClass('is-hidden');
      if (this.diagnosticsBtnEl) {
        let state: string;
        if (isCodexDiagnostics) {
          const tabId = this.safeTrace(() => this.host.getActiveDiagnosticsTabId?.(), null);
          state = this.safeTrace(
            () => (tabId ? this.host.getCodexDiagnosticsState?.(tabId) : undefined) ?? 'normal',
            'normal',
          );
        } else {
          state = this.safeTrace(() => this.host.getOpenCodeDiagnosticsState?.() ?? 'normal', 'normal');
        }
        this.diagnosticsBtnEl.dataset.traceState = state;
      }
    } else {
      this.diagnosticsBtnEl?.addClass('is-hidden');
    }

    if (!this.host.isOpenCodeBackend()) {
      this.lspStatusRefreshCoordinator?.stop();
      this.lspStatusRefreshCoordinator = null;
      this.openLspSettingsCallback = null;
      this.lspStatusIndicator?.unload();
      this.lspStatusIndicator = null;
      statusGroupEl.querySelector('.opencodian-lsp-status')?.remove();
      return;
    }
    if (!this.lspStatusIndicator) {
      this.lspStatusIndicator = new LspStatusIndicator(statusGroupEl, {
        onClick: () => (this.openLspSettingsCallback ?? this.host.openLspSettings)?.(),
        setTooltipLabel: (element, label, position) => this.host.setTooltipLabel(element, label, position),
      });
      this.lspStatusIndicator.load();
    }
  }

  private routeDiagnosticsClick(event: MouseEvent): void {
    if (this.getActiveBackendKind() === 'codex' && this.host.showCodexDiagnostics) {
      const tabId = this.safeTrace(() => this.host.getActiveDiagnosticsTabId?.(), null);
      if (tabId) {
        this.safeTrace(() => this.host.showCodexDiagnostics?.(event, tabId), undefined);
      }
      return;
    }
    this.safeTrace(() => this.host.showOpenCodeDiagnostics?.(event), undefined);
  }

  /**
   * Runs a trace-hook read/call inside a safe boundary so a throwing trace
   * service (getCaptureState/getStatus/resolveTraceId/listSummaries) cannot
   * propagate into the header render or diagnostics click. Returns the
   * fallback on throw; behavior is unchanged when the trace service is healthy.
   */
  private safeTrace<T>(run: () => T, fallback: T): T {
    try {
      return run();
    } catch {
      logger.warn('trace hook threw; falling back without trace data');
      return fallback;
    }
  }

  private buildStatusBadge(actionsEl: HTMLElement): void {
    this.serverStatusBadgeEl = actionsEl.createEl('button', {
      cls: 'opencodian-server-status-badge is-checking',
      attr: {
        type: 'button',
        'data-status-chip': 'collapsed',
        'aria-expanded': 'false',
      },
    });
    this.serverStatusBadgeEl.addClass('opencodian-tooltip-trigger');
    this.serverStatusIconEl = this.serverStatusBadgeEl.createSpan({
      cls: 'opencodian-server-status-icon',
      attr: {
        'aria-hidden': 'true',
        'data-icon': 'inline-start',
      },
    });
    this.serverStatusIconEl.createSpan({ cls: 'opencodian-server-status-icon-fallback', text: 'O' });
    this.serverStatusBadgeEl.createSpan({ cls: 'opencodian-server-status-state', attr: { 'aria-hidden': 'true' } });
    const initialLabel = t('chat.serverStatus.checking');
    this.serverStatusTextEl = this.serverStatusBadgeEl.createSpan({
      cls: 'opencodian-server-status-text',
      text: initialLabel,
    });
    this.serverStatusTextEl.setAttribute('aria-hidden', 'true');
    this.updateServerStatusLabel(initialLabel);
    this.applyActiveBackendAttribute();
    this.serverStatusBadgeEl.addEventListener('click', () => {
      this.host.openServerSettings();
    });
  }

  private buildActionButton(
    actionsEl: HTMLElement,
    config: HeaderActionButtonConfig,
  ): HTMLElement {
    const label = config.getTooltipLabel();
    const buttonEl = actionsEl.createEl('button', {
      cls: 'opencodian-header-btn opencodian-tooltip-trigger',
      attr: {
        type: 'button',
        'data-action': config.actionId,
      },
    });
    setIcon(buttonEl, config.iconName);
    this.applyActionLabel(buttonEl, label);
    buttonEl.addEventListener('click', (event) => {
      config.onClick(event);
    });
    return buttonEl;
  }

  private applyActionLabel(buttonEl: HTMLElement, label: string): void {
    this.host.setTooltipLabel(buttonEl, label, 'bottom');
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

      this.applyActiveBackendAttribute();

      this.serverStatusBadgeEl.removeClass(...SERVER_STATUS_CLASS_NAMES);
      this.serverStatusBadgeEl.addClass(`is-${availability}`);
      this.updateServerStatusLabel(this.getServerStatusLabel(availability));
      this.host.setTooltipLabel(this.serverStatusBadgeEl, this.getStatusSettingsTooltip(), 'bottom');
      this.host.refreshContextUsageIndicator();
      this.host.onServerAvailabilityRefreshed?.();
    } finally {
      this.isRefreshingServerStatus = false;
    }
  }

  private getStatusSettingsTooltip(): string {
    return this.host.isOpenCodeBackend()
      ? t('chat.serverStatus.openSettings')
      : t('chat.serverStatus.openBackendSettings');
  }

  private applyActiveBackendAttribute(): void {
    if (!this.serverStatusBadgeEl) {
      return;
    }

    const kind = this.getActiveBackendKind();
    this.serverStatusBadgeEl.setAttribute('data-active-backend', kind);
    this.updateServerStatusIcon(kind);
  }

  private getActiveBackendKind(): AgentBackendKind {
    return this.host.getActiveBackendKind?.() ?? readActiveBackendFromPlugin();
  }

  private updateServerStatusIcon(kind: AgentBackendKind): void {
    if (!this.serverStatusIconEl) return;

    this.serverStatusIconEl.setAttribute('data-backend-icon', kind);
    this.serverStatusIconEl.removeClass('has-svg-icon', 'has-inline-brandmark', 'has-lobehub-icon');
    this.serverStatusIconEl.style.removeProperty('--opencodian-server-status-icon-url');
    this.serverStatusIconEl.empty();
    renderAgentSwitcherBackendIcon(this.serverStatusIconEl, kind);
    this.serverStatusIconEl.addClass('has-lobehub-icon');
  }

  private getServerStatusLabel(availability: ChatServerAvailability): string {
    if (!this.host.isOpenCodeBackend()) {
      const backend = this.host.getActiveBackendDisplayName?.() ?? 'Backend';
      if (availability === 'running' || availability === 'external') {
        return t('chat.serverStatus.backendConnected', {
          backend,
        });
      }
      if (availability === 'offline') {
        return t('chat.serverStatus.backendOffline', {
          backend,
        });
      }
      return t(SERVER_STATUS_KEY_BY_AVAILABILITY[availability]);
    }

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

  private updateServerStatusLabel(label: string): void {
    if (!this.serverStatusBadgeEl || !this.serverStatusTextEl) {
      return;
    }

    this.serverStatusTextEl.setText(label);
    const visibleGlyphCount = Array.from(label.trim() || label).length;
    const clampedGlyphCount = Math.min(Math.max(visibleGlyphCount, 2), 22);
    const measuredTextWidthPx = this.serverStatusTextEl.scrollWidth;
    const fallbackTextWidthPx = clampedGlyphCount * SERVER_STATUS_LABEL_FALLBACK_GLYPH_WIDTH_PX;
    const intrinsicTextWidthPx = measuredTextWidthPx > 0 ? measuredTextWidthPx : fallbackTextWidthPx;
    const expandedWidthPx = Math.min(
      SERVER_STATUS_MAX_EXPANDED_WIDTH_PX,
      Math.max(
        SERVER_STATUS_MIN_EXPANDED_WIDTH_PX,
        Math.ceil(intrinsicTextWidthPx) + SERVER_STATUS_INLINE_CHROME_WIDTH_PX,
      ),
    );
    this.serverStatusBadgeEl.style.setProperty(
      '--opencodian-server-status-label-ch',
      clampedGlyphCount.toString(),
    );
    this.serverStatusBadgeEl.style.setProperty(
      '--opencodian-server-status-expanded-width',
      `${expandedWidthPx}px`,
    );
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
    return getOpenCodianWordmarkDataUrl(isDark ? 'dark' : 'light');
  }
}
