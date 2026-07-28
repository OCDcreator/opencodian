/* eslint-disable max-lines -- SettingsCodexAccountSurface owns the four Codex account/capability product surfaces (identity, usage, rate limits, provider capabilities) as a single cohesive product area, elevated from the older JSON-dump readbacks. */
/**
 * SettingsCodexAccountSurface — product-grade Codex account & capability surface.
 *
 * Owns the four official app-server surfaces that have a genuine product fit:
 *   - `account/read`            → account identity card (auth mode / plan / email)
 *   - `account/usage/read`      → token usage summary (stat tiles + daily buckets)
 *   - `account/rateLimits/read` → rate-limit summary rows
 *   - `modelProvider/capabilities/read` → provider capability chips
 *
 * These render as real settings cards (badges, stat tiles, chips, honest
 * auth-required states), NOT as button-triggered JSON dumps. Each card
 * auto-loads when the surface is attached and exposes its own refresh action.
 *
 * Honesty rules:
 *   - When the active account uses API-key auth, usage and rate-limit cards
 *     render a clear, product-grade "ChatGPT auth required" state with a
 *     `codex login` hint — never a raw error string and never silent.
 *   - No login/logout/auth.json mutation happens here. Identity is read-only.
 */

import type { AgentConnectionStatus, Disposable } from '../../core/agents/backend/AgentService';
import type {
  AppServerAccountRateLimitsResult,
  AppServerAccountUsageResult,
  AppServerModelProviderCapabilities,
} from '../../core/agents/backend/CodexAppServerClient';
import {
  type GlobalCodexConfigSummary,
  readGlobalCodexConfigSummary,
} from '../../core/agents/backend/CodexGlobalConfigSummaryReader';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

export interface SettingsCodexAccountSurfaceOptions {
  plugin: OpenCodianPlugin;
}

/** Normalized identity derived from either app-server `account/read` or CLI fallback. */
interface NormalizedAccountIdentity {
  authMode: 'chatgpt' | 'apikey' | 'unknown';
  email: string | null;
  planType: string | null;
  requiresOpenaiAuth: boolean | null;
  source: 'app-server' | 'cli-doctor' | 'none';
}

/** Auth source inferred from plugin settings (the existing apiKey field). */
export type CodexAuthSource = 'plugin-api-key' | 'env-or-chatgpt';

type AccountInfoAdapter = {
  getAccountInfo?: () => Promise<unknown | null>;
};
type UsageAdapter = {
  getAccountUsage?: () => Promise<AppServerAccountUsageResult>;
};
type RateLimitsAdapter = {
  getAccountRateLimits?: () => Promise<AppServerAccountRateLimitsResult>;
};
type CapabilitiesAdapter = {
  getModelProviderCapabilities?: () => Promise<AppServerModelProviderCapabilities | null>;
};
type StatusAwareAdapter = {
  onStatusChange?: (handler: (status: AgentConnectionStatus) => void) => Disposable;
};

type CodexAccountCardKind = 'identity' | 'usage' | 'rate-limits' | 'capabilities';

export class SettingsCodexAccountSurface {
  private readonly plugin: OpenCodianPlugin;
  private identityOutputEl: HTMLElement | null = null;
  private usageOutputEl: HTMLElement | null = null;
  private rateLimitsOutputEl: HTMLElement | null = null;
  private capabilitiesOutputEl: HTMLElement | null = null;
  private providerConfigurationStatusEl: HTMLElement | null = null;
  private globalConfigSummaryEl: HTMLElement | null = null;
  private globalConfigSummaryGeneration = 0;
  private statusSubscription: Disposable | null = null;
  private readonly refreshEpochs: Record<CodexAccountCardKind, number> = {
    identity: 0,
    usage: 0,
    'rate-limits': 0,
    capabilities: 0,
  };

  constructor(options: SettingsCodexAccountSurfaceOptions) {
    this.plugin = options.plugin;
  }

  /**
   * Mount the four product cards and kick off an initial best-effort load.
   * `authSource` is inferred once by the caller from the plugin apiKey field.
   */
  attach(containerEl: HTMLElement, authSource: CodexAuthSource): void {
    this.dispose();
    this.authSource = authSource;
    this.providerConfigurationStatusEl = this.createProviderConfigurationStatus(containerEl);
    this.renderProviderConfigurationStatus();
    this.globalConfigSummaryEl = this.createGlobalConfigSummaryCard(containerEl);
    this.identityOutputEl = this.createCard(
      containerEl,
      'identity',
      t('settings.codex.accountSurface.identity.name'),
      () => {
        const epoch = this.beginRefresh('identity');
        void this.refreshIdentity(epoch);
      },
    );
    this.usageOutputEl = this.createCard(
      containerEl,
      'usage',
      t('settings.codex.accountSurface.usage.name'),
      () => {
        const epoch = this.beginRefresh('usage');
        void this.refreshUsage(epoch);
      },
    );
    this.rateLimitsOutputEl = this.createCard(
      containerEl,
      'rate-limits',
      t('settings.codex.accountSurface.rateLimits.name'),
      () => {
        const epoch = this.beginRefresh('rate-limits');
        void this.refreshRateLimits(epoch);
      },
    );
    this.capabilitiesOutputEl = this.createCard(
      containerEl,
      'capabilities',
      t('settings.codex.accountSurface.capabilities.name'),
      () => {
        const epoch = this.beginRefresh('capabilities');
        void this.refreshCapabilities(epoch);
      },
    );

    this.subscribeToCodexConnection();
    void this.refreshAll();
    void this.refreshGlobalConfigSummary();
  }

  dispose(): void {
    this.invalidateAllRefreshes();
    this.globalConfigSummaryGeneration += 1;
    this.statusSubscription?.dispose();
    this.statusSubscription = null;
    this.identityOutputEl = null;
    this.usageOutputEl = null;
    this.rateLimitsOutputEl = null;
    this.capabilitiesOutputEl = null;
    this.providerConfigurationStatusEl = null;
    this.globalConfigSummaryEl = null;
  }

  private authSource: CodexAuthSource = 'env-or-chatgpt';

  /** Update the read-only auth-source summary after a legacy credential clear. */
  updateAuthSource(authSource: CodexAuthSource): void {
    this.authSource = authSource;
    this.renderProviderConfigurationStatus();
  }

  private createProviderConfigurationStatus(containerEl: HTMLElement): HTMLElement {
    const statusEl = containerEl.createDiv({
      cls: 'opencodian-codex-provider-configuration-status',
      attr: {
        'data-codex-provider-configuration-status': 'true',
        'data-provider-config-state': 'external-managed',
        role: 'status',
        'aria-live': 'polite',
      },
    });
    return statusEl;
  }

  private renderProviderConfigurationStatus(): void {
    const statusEl = this.providerConfigurationStatusEl;
    if (!statusEl) {
      return;
    }
    statusEl.empty();
    statusEl.setAttribute('data-provider-config-state', 'external-managed');
    statusEl.createDiv({
      cls: 'opencodian-codex-provider-configuration-status-header',
    }).createEl('h4', {
      cls: 'opencodian-codex-provider-configuration-status-title',
      text: t('settings.codex.accountSurface.providerConfiguration.name'),
    });
    statusEl.createSpan({
      cls: 'opencodian-codex-provider-configuration-status-state',
      text: t('settings.codex.accountSurface.providerConfiguration.externalManaged'),
    });
    statusEl.createDiv({
      cls: 'opencodian-codex-provider-configuration-status-description',
      text: t('settings.codex.accountSurface.providerConfiguration.description'),
    });
    const sourceEl = statusEl.createDiv({
      cls: 'opencodian-codex-provider-configuration-status-source',
      attr: { 'data-codex-auth-source': this.authSource },
    });
    sourceEl.createSpan({
      cls: 'opencodian-codex-provider-configuration-status-source-label',
      text: t('settings.codex.accountSurface.providerConfiguration.authSourceLabel'),
    });
    sourceEl.createSpan({
      cls: 'opencodian-codex-provider-configuration-status-source-value',
      text: this.authSource === 'plugin-api-key'
        ? t('settings.codex.accountSurface.providerConfiguration.authSourceLegacy')
        : t('settings.codex.accountSurface.providerConfiguration.authSourceEnv'),
    });
    statusEl.createDiv({
      cls: 'opencodian-codex-provider-configuration-status-capabilities',
      text: t('settings.codex.accountSurface.providerConfiguration.capabilitiesReadback'),
    });
    // Provider posture B: #23417 upstream blocker explanation.
    statusEl.createDiv({
      cls: 'opencodian-codex-provider-configuration-status-upstream',
    }).createEl('a', {
      cls: 'opencodian-codex-provider-configuration-status-upstream-link',
      attr: {
        href: 'https://github.com/openai/codex/issues/23417',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      text: t('settings.codex.accountSurface.providerConfiguration.upstreamIssue'),
    });
  }

  // ─── Global config summary card (read-only, no writes) ────────

  private createGlobalConfigSummaryCard(containerEl: HTMLElement): HTMLElement {
    const cardEl = containerEl.createDiv({
      cls: 'opencodian-codex-account-card opencodian-codex-global-config-summary-card',
      attr: {
        'data-codex-account-card': 'global-config-summary',
        'data-settings-surface': 'codex-account-card',
      },
    });

    const headerEl = cardEl.createDiv({ cls: 'opencodian-codex-account-card-header' });
    headerEl.createEl('h4', {
      cls: 'opencodian-codex-account-card-title',
      text: t('settings.codex.accountSurface.globalConfig.name'),
    });

    const refreshTooltip = t('settings.codex.accountSurface.refreshTooltip');
    const refreshButtonEl = headerEl.createEl('button', {
      cls: 'opencodian-codex-account-card-refresh',
      text: t('settings.codex.accountSurface.refresh'),
      attr: { type: 'button', title: refreshTooltip, 'aria-label': `${refreshTooltip}: ${t('settings.codex.accountSurface.globalConfig.name')}` },
    });
    refreshButtonEl.addEventListener('click', () => {
      void this.refreshGlobalConfigSummary();
    });

    const bodyEl = cardEl.createDiv({
      cls: 'opencodian-codex-account-card-body',
      attr: {
        'data-codex-global-config-summary': 'true',
        'data-proof-state': 'readback',
      },
    });
    bodyEl.createEl('p', {
      cls: 'opencodian-codex-account-card-loading',
      text: t('settings.codex.accountSurface.loading'),
    });
    return bodyEl;
  }

  /** Read the global config summary once. No polling or watching. */
  private async refreshGlobalConfigSummary(): Promise<void> {
    const el = this.globalConfigSummaryEl;
    if (!el) {
      return;
    }
    const generation = ++this.globalConfigSummaryGeneration;
    let summary: GlobalCodexConfigSummary;
    try {
      summary = await readGlobalCodexConfigSummary();
    } catch {
      summary = {
        fileState: 'read-failed',
        filePath: '',
        lastSuccessfulRead: null,
        model: null,
        modelProvider: null,
        openaiBaseUrl: null,
        providers: [],
      };
    }
    if (generation !== this.globalConfigSummaryGeneration || this.globalConfigSummaryEl !== el) {
      return;
    }
    this.renderGlobalConfigSummary(el, summary);
  }

  private renderGlobalConfigSummary(el: HTMLElement, summary: GlobalCodexConfigSummary): void {
    el.empty();
    el.setAttribute('data-global-config-state', summary.fileState);

    el.createDiv({
      cls: 'opencodian-codex-global-config-summary-readonly-note',
      text: t('settings.codex.accountSurface.globalConfig.readonlyNote'),
    });

    if (summary.fileState !== 'readable') {
      const stateText = summary.fileState === 'missing'
        ? t('settings.codex.accountSurface.globalConfig.stateMissing')
        : summary.fileState === 'parse-failed'
          ? t('settings.codex.accountSurface.globalConfig.stateParseFailed')
          : t('settings.codex.accountSurface.globalConfig.stateReadFailed');
      el.createDiv({
        cls: 'opencodian-codex-global-config-summary-state',
        text: stateText,
      });
      return;
    }

    // File path (read-only display).
    el.createDiv({
      cls: 'opencodian-codex-global-config-summary-path',
    }).createSpan({
      cls: 'opencodian-codex-global-config-summary-path-value',
      text: summary.filePath,
    });

    if (summary.lastSuccessfulRead) {
      el.createDiv({
        cls: 'opencodian-codex-global-config-summary-last-read',
        text: t('settings.codex.accountSurface.globalConfig.lastRead', { time: summary.lastSuccessfulRead }),
      });
    }

    // Top-level fields.
    const topLevel = el.createDiv({ cls: 'opencodian-codex-global-config-summary-top-level' });
    this.appendSummaryRow(topLevel, 'settings.codex.accountSurface.globalConfig.fieldModel', summary.model);
    this.appendSummaryRow(topLevel, 'settings.codex.accountSurface.globalConfig.fieldModelProvider', summary.modelProvider);
    this.appendSummaryRow(topLevel, 'settings.codex.accountSurface.globalConfig.fieldOpenaiBaseUrl', summary.openaiBaseUrl);

    // Provider table.
    if (summary.providers.length > 0) {
      const tableEl = el.createDiv({ cls: 'opencodian-codex-global-config-summary-providers' });
      tableEl.createEl('h5', {
        cls: 'opencodian-codex-global-config-summary-providers-title',
        text: t('settings.codex.accountSurface.globalConfig.providersTitle'),
      });
      for (const provider of summary.providers) {
        const rowEl = tableEl.createDiv({
          cls: 'opencodian-codex-global-config-summary-provider-row',
          attr: provider.isDeclaredDefault ? { 'data-declared-default': 'true' } : undefined,
        });
        rowEl.createSpan({
          cls: 'opencodian-codex-global-config-summary-provider-id',
          text: provider.id,
        });
        rowEl.createSpan({
          cls: 'opencodian-codex-global-config-summary-provider-name',
          text: provider.name,
        });
        rowEl.createSpan({
          cls: 'opencodian-codex-global-config-summary-provider-base-url',
          text: provider.baseUrl ?? '—',
        });
        rowEl.createSpan({
          cls: 'opencodian-codex-global-config-summary-provider-wire-api',
          text: provider.wireApi ?? '—',
        });
        if (provider.isDeclaredDefault) {
          rowEl.createSpan({
            cls: 'opencodian-codex-global-config-summary-provider-default-badge',
            text: t('settings.codex.accountSurface.globalConfig.declaredDefault'),
          });
        }
      }
    }
  }

  private appendSummaryRow(parent: HTMLElement, labelKey: string, value: string | null): void {
    const row = parent.createDiv({ cls: 'opencodian-codex-global-config-summary-row' });
    row.createSpan({
      cls: 'opencodian-codex-global-config-summary-row-label',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      text: t(labelKey as any),
    });
    row.createSpan({
      cls: 'opencodian-codex-global-config-summary-row-value',
      text: value ?? '—',
    });
  }

  // ─── Card scaffolding ───────────────────────────────────────────

  private createCard(
    containerEl: HTMLElement,
    kind: 'identity' | 'usage' | 'rate-limits' | 'capabilities',
    title: string,
    onRefresh: () => void,
  ): HTMLElement {
    const cardEl = containerEl.createDiv({
      cls: 'opencodian-codex-account-card',
      attr: {
        'data-codex-account-card': kind,
        'data-settings-surface': 'codex-account-card',
      },
    });

    const headerEl = cardEl.createDiv({
      cls: 'opencodian-codex-account-card-header',
    });
    headerEl.createEl('h4', {
      cls: 'opencodian-codex-account-card-title',
      text: title,
    });

    const refreshTooltip = t('settings.codex.accountSurface.refreshTooltip');
    const refreshButtonEl = headerEl.createEl('button', {
      cls: 'opencodian-codex-account-card-refresh',
      text: t('settings.codex.accountSurface.refresh'),
      attr: { type: 'button', title: refreshTooltip, 'aria-label': `${refreshTooltip}: ${title}` },
    });
    refreshButtonEl.addEventListener('click', () => onRefresh());

    const bodyEl = cardEl.createDiv({
      cls: 'opencodian-codex-account-card-body',
      attr: {
        [`data-codex-${kind === 'rate-limits' ? 'rate-limits' : kind}-readback`]: 'true',
        'data-proof-state': 'readback',
      },
    });

    bodyEl.createEl('p', {
      cls: 'opencodian-codex-account-card-loading',
      text: t('settings.codex.accountSurface.loading'),
    });

    return bodyEl;
  }

  // ─── Refresh orchestration ──────────────────────────────────────

  /** Public entry for the group-level "refresh all" action. */
  refreshAllNow(): void {
    void this.refreshAll();
  }

  private async refreshAll(): Promise<void> {
    const epochs = {
      identity: this.beginRefresh('identity'),
      usage: this.beginRefresh('usage'),
      'rate-limits': this.beginRefresh('rate-limits'),
      capabilities: this.beginRefresh('capabilities'),
    };
    await Promise.all([
      this.refreshIdentity(epochs.identity),
      this.refreshCapabilities(epochs.capabilities),
      this.refreshUsage(epochs.usage),
      this.refreshRateLimits(epochs['rate-limits']),
    ]);
  }

  private beginRefresh(kind: CodexAccountCardKind): number {
    this.refreshEpochs[kind] += 1;
    return this.refreshEpochs[kind];
  }

  private invalidateAllRefreshes(): void {
    for (const kind of Object.keys(this.refreshEpochs) as CodexAccountCardKind[]) {
      this.refreshEpochs[kind] += 1;
    }
  }

  private isCurrentRefresh(kind: CodexAccountCardKind, epoch: number, el: HTMLElement | null): el is HTMLElement {
    return epoch === this.refreshEpochs[kind] && el !== null;
  }

  private subscribeToCodexConnection(): void {
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as StatusAwareAdapter | null;
    if (typeof adapter?.onStatusChange !== 'function') {
      return;
    }
    this.statusSubscription = adapter.onStatusChange((status) => {
      if (status === 'connected') {
        void this.refreshAll();
      }
    });
  }

  // ─── Identity card ──────────────────────────────────────────────

  private async refreshIdentity(epoch: number): Promise<void> {
    const el = this.identityOutputEl;
    if (!this.isCurrentRefresh('identity', epoch, el)) return;
    this.renderLoading(el);
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as AccountInfoAdapter | null;
    if (typeof adapter?.getAccountInfo !== 'function') {
      this.renderIdentityUnavailable(el, 'no-adapter');
      return;
    }
    let raw: unknown | null;
    try {
      raw = await adapter.getAccountInfo();
    } catch {
      if (!this.isCurrentRefresh('identity', epoch, el)) return;
      this.renderIdentityUnavailable(el, 'failed');
      return;
    }
    if (!this.isCurrentRefresh('identity', epoch, el)) return;
    if (raw === null) {
      this.renderIdentityUnavailable(el, 'none');
      return;
    }
    this.renderIdentity(el, this.normalizeIdentity(raw));
  }

  private normalizeIdentity(raw: unknown): NormalizedAccountIdentity {
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      // App-server shape: { account: { type, email?, planType? }, requiresOpenaiAuth }
      if (obj.account && typeof obj.account === 'object') {
        const acc = obj.account as Record<string, unknown>;
        const typeRaw = String(acc.type ?? '').toLowerCase();
        const authMode: NormalizedAccountIdentity['authMode'] =
          typeRaw === 'chatgpt' ? 'chatgpt' : typeRaw.includes('api') ? 'apikey' : 'unknown';
        return {
          authMode,
          email: typeof acc.email === 'string' && acc.email.length > 0 ? acc.email : null,
          planType: typeof acc.planType === 'string' && acc.planType.length > 0 ? acc.planType : null,
          requiresOpenaiAuth: typeof obj.requiresOpenaiAuth === 'boolean' ? obj.requiresOpenaiAuth : null,
          source: 'app-server',
        };
      }
      // CLI doctor shape: { 'stored auth mode', 'stored ChatGPT tokens', 'stored API key', ... }
      const storedMode = String(obj['stored auth mode'] ?? '').toLowerCase();
      if (storedMode.length > 0 || 'stored API key' in obj) {
        const authMode: NormalizedAccountIdentity['authMode'] =
          storedMode === 'chatgpt' ? 'chatgpt' : storedMode.includes('api') ? 'apikey' : 'unknown';
        return {
          authMode,
          email: null,
          planType: null,
          requiresOpenaiAuth: storedMode === 'api_key' || storedMode === 'apikey' ? true : null,
          source: 'cli-doctor',
        };
      }
    }
    return { authMode: 'unknown', email: null, planType: null, requiresOpenaiAuth: null, source: 'none' };
  }

  private renderIdentity(el: HTMLElement, identity: NormalizedAccountIdentity): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    el.setAttribute('data-auth-mode', identity.authMode);
    el.setAttribute('data-auth-source', this.authSource);

    const isChatgpt = identity.authMode === 'chatgpt';
    const isApiKey = identity.authMode === 'apikey';
    const authModeText = isChatgpt
      ? t('settings.codex.accountSurface.identity.modeChatgpt')
      : isApiKey
        ? t('settings.codex.accountSurface.identity.modeApiKey')
        : t('settings.codex.accountSurface.identity.modeUnknown');
    const authTitleText = isChatgpt
      ? t('settings.codex.accountSurface.identity.authTitleChatgpt')
      : isApiKey
        ? t('settings.codex.accountSurface.identity.authTitleApiKey')
        : t('settings.codex.accountSurface.identity.authTitleUnknown');

    const overviewEl = el.createDiv({ cls: 'opencodian-codex-account-identity-overview' });

    const primaryEl = overviewEl.createDiv({ cls: 'opencodian-codex-account-identity-primary' });
    const badgeEl = primaryEl.createDiv({
      cls: `opencodian-codex-account-badge ${isChatgpt ? 'is-chatgpt' : 'is-apikey'}`,
      attr: { 'data-auth-badge': identity.authMode },
    });
    badgeEl.createSpan({ text: authModeText });
    primaryEl.createEl('h5', {
      cls: 'opencodian-codex-account-identity-title',
      text: authTitleText,
    });

    const detailEl = overviewEl.createDiv({ cls: 'opencodian-codex-account-identity-detail' });
    detailEl.createSpan({
      cls: 'opencodian-codex-account-identity-detail-label',
      text: t('settings.codex.accountSurface.identity.sourcePrefix'),
    });
    detailEl.createSpan({
      cls: 'opencodian-codex-account-identity-detail-value',
      text:
        this.authSource === 'plugin-api-key'
          ? t('settings.codex.accountSurface.identity.sourcePluginKey')
          : t('settings.codex.accountSurface.identity.sourceEnvOrChatgpt'),
    });

    const hasMeta = identity.email || identity.planType;
    if (hasMeta) {
      const metaEl = overviewEl.createDiv({ cls: 'opencodian-codex-account-identity-meta' });
      if (identity.email) {
        metaEl.createSpan({
          cls: 'opencodian-codex-account-identity-chip',
          attr: { 'data-meta': 'email' },
          text: identity.email,
        });
      }
      if (identity.planType) {
        metaEl.createSpan({
          cls: 'opencodian-codex-account-identity-chip',
          attr: { 'data-meta': 'plan' },
          text: this.formatPlan(identity.planType),
        });
      }
    }

    if (identity.requiresOpenaiAuth === true) {
      const noteEl = el.createDiv({
        cls: 'opencodian-codex-account-card-notice',
        attr: { 'data-auth-required-notice': 'true' },
      });
      noteEl.createSpan({
        text: t('settings.codex.accountSurface.identity.usageAuthNote'),
      });
      const codeEl = noteEl.createEl('code', {
        cls: 'opencodian-codex-account-card-code',
        text: 'codex login',
      });
      codeEl.setAttribute('aria-label', 'codex login');
    }
  }

  private renderIdentityUnavailable(el: HTMLElement, reason: 'no-adapter' | 'failed' | 'none'): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    el.setAttribute('data-auth-mode', 'unknown');
    const text =
      reason === 'failed'
        ? t('settings.codex.accountSurface.identity.failed')
        : t('settings.codex.accountSurface.identity.unavailable');
    el.createEl('p', {
      cls: 'opencodian-codex-account-card-muted',
      text,
    });
  }

  // ─── Usage card ─────────────────────────────────────────────────

  private async refreshUsage(epoch: number): Promise<void> {
    const el = this.usageOutputEl;
    if (!this.isCurrentRefresh('usage', epoch, el)) return;
    this.renderLoading(el);
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as UsageAdapter | null;
    if (typeof adapter?.getAccountUsage !== 'function') {
      this.renderUsageUnavailable(el, 'no-adapter');
      return;
    }
    let result: AppServerAccountUsageResult;
    try {
      result = await adapter.getAccountUsage();
    } catch {
      if (!this.isCurrentRefresh('usage', epoch, el)) return;
      this.renderUsageUnavailable(el, 'failed');
      return;
    }
    if (!this.isCurrentRefresh('usage', epoch, el)) return;
    if (result.usage === null) {
      this.renderUsageAuthOrUnavailable(el, result.errorReason);
      return;
    }
    this.renderUsage(el, result.usage);
  }

  private renderUsage(el: HTMLElement, usage: NonNullable<AppServerAccountUsageResult['usage']>): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    el.setAttribute('data-usage-state', 'data');

    const summary = usage.summary as Record<string, unknown> | undefined;
    const tilesEl = el.createDiv({ cls: 'opencodian-codex-account-tiles' });

    const lifetimeTokens = this.readNumber(summary?.lifetimeTokens);
    const peakDaily = this.readNumber(summary?.peakDailyTokens);
    const longestTurnSec = this.readNumber(summary?.longestRunningTurnSec);
    const currentStreak = this.readNumber(summary?.currentStreakDays);
    const longestStreak = this.readNumber(summary?.longestStreakDays);

    this.appendStatTile(tilesEl, t('settings.codex.accountSurface.usage.lifetimeTokens'), this.formatTokens(lifetimeTokens));
    this.appendStatTile(tilesEl, t('settings.codex.accountSurface.usage.peakDaily'), this.formatTokens(peakDaily));
    this.appendStatTile(tilesEl, t('settings.codex.accountSurface.usage.longestTurn'), this.formatDuration(longestTurnSec));
    this.appendStatTile(tilesEl, t('settings.codex.accountSurface.usage.currentStreak'), this.formatStreak(currentStreak));
    this.appendStatTile(tilesEl, t('settings.codex.accountSurface.usage.longestStreak'), this.formatStreak(longestStreak));

    const buckets = Array.isArray(usage.dailyUsageBuckets) ? usage.dailyUsageBuckets : [];
    if (buckets.length > 0) {
      this.renderUsageBuckets(el, buckets);
    }
  }

  private renderUsageBuckets(el: HTMLElement, buckets: Array<Record<string, unknown>>): void {
    const wrapEl = el.createDiv({ cls: 'opencodian-codex-account-usage-buckets' });
    wrapEl.createEl('p', {
      cls: 'opencodian-codex-account-usage-buckets-title',
      text: t('settings.codex.accountSurface.usage.recentDays'),
    });
    const barsEl = wrapEl.createDiv({ cls: 'opencodian-codex-account-usage-bars' });
    const labelsEl = wrapEl.createDiv({ cls: 'opencodian-codex-account-usage-labels' });
    const recent = buckets.slice(-14);
    const values = recent.map((b) => this.readNumber(b.tokens) ?? 0);
    const max = Math.max(1, ...values);
    for (const bucket of recent) {
      const tokens = this.readNumber(bucket.tokens) ?? 0;
      const date = typeof bucket.startDate === 'string' ? bucket.startDate : '';
      const heightPct = Math.max(4, Math.round((tokens / max) * 100));
      barsEl.createDiv({
        cls: 'opencodian-codex-account-usage-bar',
        attr: {
          'data-bucket-date': date,
          'data-bucket-tokens': String(tokens),
          title: `${date} · ${tokens.toLocaleString()}`,
          style: `height:${heightPct}%`,
        },
      });
      labelsEl.createSpan({
        cls: 'opencodian-codex-account-usage-bar-label',
        text: date.length >= 5 ? date.slice(5) : date,
      });
    }
  }

  private renderUsageAuthOrUnavailable(el: HTMLElement, errorReason: string | undefined): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    const authRequired = /authentication required/i.test(errorReason ?? '');
    if (authRequired) {
      el.setAttribute('data-usage-state', 'auth-required');
      this.renderAuthRequiredNotice(
        el,
        t('settings.codex.accountSurface.usage.authRequiredTitle'),
      );
      return;
    }
    el.setAttribute('data-usage-state', 'unavailable');
    el.createEl('p', {
      cls: 'opencodian-codex-account-card-muted',
      text: errorReason
        ? t('settings.codex.accountSurface.usage.errorReason', { reason: errorReason })
        : t('settings.codex.accountSurface.usage.unavailable'),
    });
  }

  private renderUsageUnavailable(el: HTMLElement, reason: 'no-adapter' | 'failed'): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    el.setAttribute('data-usage-state', 'unavailable');
    el.createEl('p', {
      cls: 'opencodian-codex-account-card-muted',
      text: reason === 'failed'
        ? t('settings.codex.accountSurface.usage.failed')
        : t('settings.codex.accountSurface.usage.unavailable'),
    });
  }

  // ─── Rate limits card ───────────────────────────────────────────

  private async refreshRateLimits(epoch: number): Promise<void> {
    const el = this.rateLimitsOutputEl;
    if (!this.isCurrentRefresh('rate-limits', epoch, el)) return;
    this.renderLoading(el);
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as RateLimitsAdapter | null;
    if (typeof adapter?.getAccountRateLimits !== 'function') {
      this.renderRateLimitsUnavailable(el, 'no-adapter');
      return;
    }
    let result: AppServerAccountRateLimitsResult;
    try {
      result = await adapter.getAccountRateLimits();
    } catch {
      if (!this.isCurrentRefresh('rate-limits', epoch, el)) return;
      this.renderRateLimitsUnavailable(el, 'failed');
      return;
    }
    if (!this.isCurrentRefresh('rate-limits', epoch, el)) return;
    if (result.rateLimits === null) {
      this.renderRateLimitsAuthOrUnavailable(el, result.errorReason);
      return;
    }
    this.renderRateLimits(el, result.rateLimits);
  }

  private renderRateLimits(el: HTMLElement, limits: NonNullable<AppServerAccountRateLimitsResult['rateLimits']>): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    el.setAttribute('data-rate-limits-state', 'data');

    const main = limits.rateLimits as Record<string, unknown> | undefined;
    const entries = main && typeof main === 'object' ? Object.entries(main) : [];
    if (entries.length === 0) {
      el.createEl('p', {
        cls: 'opencodian-codex-account-card-muted',
        text: t('settings.codex.accountSurface.rateLimits.empty'),
      });
      return;
    }

    const rowsEl = el.createDiv({ cls: 'opencodian-codex-account-rows' });
    for (const [key, value] of entries) {
      this.appendRow(rowsEl, this.humanizeRateLimitKey(key), this.formatRateLimitValue(value));
    }

    const byId = limits.rateLimitsByLimitId;
    if (byId && typeof byId === 'object' && Object.keys(byId).length > 0) {
      const detailEl = el.createDiv({ cls: 'opencodian-codex-account-rate-limit-groups' });
      detailEl.createEl('p', {
        cls: 'opencodian-codex-account-usage-buckets-title',
        text: t('settings.codex.accountSurface.rateLimits.byTier'),
      });
      for (const [tierId, tierLimits] of Object.entries(byId)) {
        const groupEl = detailEl.createDiv({
          cls: 'opencodian-codex-account-rate-limit-group',
          attr: { 'data-tier-id': tierId },
        });
        groupEl.createEl('p', {
          cls: 'opencodian-codex-account-rate-limit-group-title',
          text: tierId,
        });
        const tierRows = groupEl.createDiv({ cls: 'opencodian-codex-account-rows' });
        const tierObj = tierLimits as Record<string, unknown> | undefined;
        if (tierObj && typeof tierObj === 'object') {
          for (const [key, value] of Object.entries(tierObj)) {
            this.appendRow(tierRows, this.humanizeRateLimitKey(key), this.formatRateLimitValue(value));
          }
        }
      }
    }
  }

  private renderRateLimitsAuthOrUnavailable(el: HTMLElement, errorReason: string | undefined): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    const authRequired = /authentication required/i.test(errorReason ?? '');
    if (authRequired) {
      el.setAttribute('data-rate-limits-state', 'auth-required');
      this.renderAuthRequiredNotice(
        el,
        t('settings.codex.accountSurface.rateLimits.authRequiredTitle'),
      );
      return;
    }
    el.setAttribute('data-rate-limits-state', 'unavailable');
    el.createEl('p', {
      cls: 'opencodian-codex-account-card-muted',
      text: errorReason
        ? t('settings.codex.accountSurface.rateLimits.errorReason', { reason: errorReason })
        : t('settings.codex.accountSurface.rateLimits.unavailable'),
    });
  }

  private renderRateLimitsUnavailable(el: HTMLElement, reason: 'no-adapter' | 'failed'): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    el.setAttribute('data-rate-limits-state', 'unavailable');
    el.createEl('p', {
      cls: 'opencodian-codex-account-card-muted',
      text: reason === 'failed'
        ? t('settings.codex.accountSurface.rateLimits.failed')
        : t('settings.codex.accountSurface.rateLimits.unavailable'),
    });
  }

  // ─── Capabilities card ──────────────────────────────────────────

  private async refreshCapabilities(epoch: number): Promise<void> {
    const el = this.capabilitiesOutputEl;
    if (!this.isCurrentRefresh('capabilities', epoch, el)) return;
    this.renderLoading(el);
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as CapabilitiesAdapter | null;
    if (typeof adapter?.getModelProviderCapabilities !== 'function') {
      this.renderCapabilitiesUnavailable(el, 'no-adapter');
      return;
    }
    let capabilities: AppServerModelProviderCapabilities | null;
    try {
      capabilities = await adapter.getModelProviderCapabilities();
    } catch {
      if (!this.isCurrentRefresh('capabilities', epoch, el)) return;
      this.renderCapabilitiesUnavailable(el, 'failed');
      return;
    }
    if (!this.isCurrentRefresh('capabilities', epoch, el)) return;
    if (capabilities === null) {
      this.renderCapabilitiesUnavailable(el, 'none');
      return;
    }
    this.renderCapabilities(el, capabilities);
  }

  private renderCapabilities(el: HTMLElement, caps: AppServerModelProviderCapabilities): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    el.setAttribute('data-capabilities-state', 'data');

    const entries = [
      { key: 'webSearch', label: t('settings.codex.accountSurface.capabilities.webSearch'), desc: t('settings.codex.accountSurface.capabilities.webSearchDesc') },
      { key: 'imageGeneration', label: t('settings.codex.accountSurface.capabilities.imageGeneration'), desc: t('settings.codex.accountSurface.capabilities.imageGenDesc') },
      { key: 'namespaceTools', label: t('settings.codex.accountSurface.capabilities.namespaceTools'), desc: t('settings.codex.accountSurface.capabilities.namespaceToolsDesc') },
    ] as const;

    const chipsEl = el.createDiv({ cls: 'opencodian-codex-account-capability-chips' });
    for (const { key, label, desc } of entries) {
      const enabled = caps[key] === true;
      const chipEl = chipsEl.createDiv({
        cls: `opencodian-codex-account-capability-chip ${enabled ? 'is-enabled' : 'is-disabled'}`,
        attr: {
          [`data-capability-${key}`]: String(enabled),
          'data-proof-state': 'readback',
        },
      });
      chipEl.createDiv({
        cls: 'opencodian-codex-account-capability-chip-icon',
        text: enabled ? '✓' : '—',
      });
      const textWrap = chipEl.createDiv({ cls: 'opencodian-codex-account-capability-chip-text' });
      textWrap.createEl('p', {
        cls: 'opencodian-codex-account-capability-chip-label',
        text: label,
      });
      textWrap.createEl('p', {
        cls: 'opencodian-codex-account-capability-chip-desc',
        text: desc,
      });
      chipEl.createDiv({
        cls: 'opencodian-codex-account-capability-chip-status',
        text: enabled
          ? t('settings.codex.accountSurface.capabilities.enabled')
          : t('settings.codex.accountSurface.capabilities.disabled'),
      });
    }
  }

  private renderCapabilitiesUnavailable(el: HTMLElement, reason: 'no-adapter' | 'failed' | 'none'): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    el.setAttribute('data-capabilities-state', reason === 'failed' ? 'failed' : 'unavailable');
    el.createEl('p', {
      cls: 'opencodian-codex-account-card-muted',
      text: reason === 'failed'
        ? t('settings.codex.accountSurface.capabilities.failed')
        : t('settings.codex.accountSurface.capabilities.unavailable'),
    });
  }

  // ─── Shared render helpers ──────────────────────────────────────

  private renderLoading(el: HTMLElement): void {
    el.empty();
    el.setAttribute('data-proof-state', 'readback');
    el.createEl('p', {
      cls: 'opencodian-codex-account-card-loading',
      text: t('settings.codex.accountSurface.loading'),
    });
  }

  /**
   * Compact one-line auth-required notice. The identity card carries the
   * authoritative long-form explanation; usage/rate-limits only need the
   * title plus the `codex login` hint.
   */
  private renderAuthRequiredNotice(el: HTMLElement, title: string): void {
    const noticeEl = el.createDiv({
      cls: 'opencodian-codex-account-card-notice is-auth-required is-compact',
      attr: { 'data-auth-required-notice': 'true' },
    });
    noticeEl.createEl('span', {
      cls: 'opencodian-codex-account-card-notice-title',
      text: title,
    });
    noticeEl.createEl('span', {
      cls: 'opencodian-codex-account-card-notice-hint',
      text: t('settings.codex.accountSurface.authRequiredHint'),
    });
    const codeEl = noticeEl.createEl('code', {
      cls: 'opencodian-codex-account-card-code',
      text: 'codex login',
    });
    codeEl.setAttribute('aria-label', 'codex login');
  }

  private appendRow(rowsEl: HTMLElement, label: string, value: string): void {
    const rowEl = rowsEl.createDiv({ cls: 'opencodian-codex-account-row' });
    rowEl.createSpan({
      cls: 'opencodian-codex-account-row-label',
      text: label,
    });
    rowEl.createSpan({
      cls: 'opencodian-codex-account-row-value',
      text: value,
    });
  }

  private appendStatTile(tilesEl: HTMLElement, label: string, value: string): void {
    const tileEl = tilesEl.createDiv({ cls: 'opencodian-codex-account-stat-tile' });
    tileEl.createEl('p', {
      cls: 'opencodian-codex-account-stat-tile-value',
      text: value,
    });
    tileEl.createEl('p', {
      cls: 'opencodian-codex-account-stat-tile-label',
      text: label,
    });
  }

  // ─── Formatting helpers ─────────────────────────────────────────

  private readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
    return null;
  }

  private formatTokens(value: number | null): string {
    if (value === null) return t('settings.codex.accountSurface.unknown');
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return String(value);
  }

  private formatDuration(seconds: number | null): string {
    if (seconds === null) return t('settings.codex.accountSurface.unknown');
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSec = Math.round(seconds % 60);
    if (minutes < 60) return remainingSec === 0 ? `${minutes}m` : `${minutes}m ${remainingSec}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMin = minutes % 60;
    return remainingMin === 0 ? `${hours}h` : `${hours}h ${remainingMin}m`;
  }

  private formatStreak(days: number | null): string {
    if (days === null) return t('settings.codex.accountSurface.unknown');
    return t('settings.codex.accountSurface.usage.dayCount', { count: days });
  }

  private formatPlan(planType: string): string {
    return planType.charAt(0).toUpperCase() + planType.slice(1);
  }

  private humanizeRateLimitKey(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
  }

  private formatRateLimitValue(value: unknown): string {
    const num = this.readNumber(value);
    if (num !== null) return num.toLocaleString();
    return String(value);
  }
}
