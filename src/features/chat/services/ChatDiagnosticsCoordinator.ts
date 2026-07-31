import type {
  OpenCodeSessionTraceService,
  OpenCodeSessionTraceSettings,
} from '../../../core/opencode/diagnostics/OpenCodeSessionTraceService';
import { t } from '../../../i18n';
import type { DiagnosticRunToken } from '../runtime/SendPipelineTypes';
import {
  CodexDiagnosticsHostAdapter,
  type CodexDiagnosticsHostAdapterHost,
  type CodexDiagnosticsState,
} from './CodexDiagnosticsHostAdapter';

export type OpenCodeDiagnosticsState =
  | 'disabled'
  | 'degraded'
  | 'normal'
  | 'armed'
  | 'capturing'
  | 'warning'
  | 'critical';

export type OpenCodeTraceServicePort = Pick<
  OpenCodeSessionTraceService,
  'getCaptureState' | 'armDeepCapture' | 'cancelDeepCapture' | 'claimDeepCapture'
> & {
  readonly store: Pick<
    OpenCodeSessionTraceService['store'],
    'getStatus' | 'resolveTraceId' | 'listSummaries'
  >;
  readonly reportBuilder: Pick<OpenCodeSessionTraceService['reportBuilder'], 'buildSmartReport'>;
};

type OpenCodeDiagnosticsUserContext = Parameters<
  OpenCodeSessionTraceService['reportBuilder']['buildSmartReport']
>[1];

export interface OpenCodeDiagnosticsMenuItem {
  setTitle(title: string): OpenCodeDiagnosticsMenuItem;
  setIcon(icon: string): OpenCodeDiagnosticsMenuItem;
  onClick(callback: () => void | Promise<void>): OpenCodeDiagnosticsMenuItem;
}

export interface OpenCodeDiagnosticsMenu {
  addItem(callback: (item: OpenCodeDiagnosticsMenuItem) => unknown): unknown;
  showAtMouseEvent(event: MouseEvent): unknown;
}

export interface ChatDiagnosticsCoordinatorHost {
  getOpenCodeSessionTraceSettings(): Pick<OpenCodeSessionTraceSettings, 'enabled'>;
  getOpenCodeTraceService(): OpenCodeTraceServicePort | undefined;
  getActiveTabId(): string | null;
  getSessionIdForTab(tabId: string): string | null;
  refreshHeaderChrome(): void;
  createMenu(): OpenCodeDiagnosticsMenu;
  promptDiagnosticsUserContext(): Promise<OpenCodeDiagnosticsUserContext>;
  writeTextToClipboard(text: string): Promise<void>;
  showNotice(message: string): void;
}

/**
 * Owns OpenCode and Codex diagnostics operations at the chat surface boundary.
 *
 * The coordinator intentionally receives only narrow ports. Trace failures are
 * absorbed without logging so diagnostic data never escapes through an error
 * message, and the normal chat path remains available.
 */
export class ChatDiagnosticsCoordinator {
  private readonly codexDiagnosticsAdapter: CodexDiagnosticsHostAdapter;

  constructor(
    private readonly host: ChatDiagnosticsCoordinatorHost,
    codexDiagnosticsHost: CodexDiagnosticsHostAdapterHost,
  ) {
    this.codexDiagnosticsAdapter = new CodexDiagnosticsHostAdapter(codexDiagnosticsHost);
  }

  getOpenCodeDiagnosticsState(): OpenCodeDiagnosticsState {
    try {
      if (!this.host.getOpenCodeSessionTraceSettings().enabled) return 'disabled';

      const service = this.host.getOpenCodeTraceService();
      if (!service) return 'degraded';
      const storeStatus = service.store.getStatus();
      if (storeStatus.mode === 'memory' || storeStatus.lastError) return 'degraded';

      const tabId = this.host.getActiveTabId();
      if (!tabId) return 'normal';
      const captureState = service.getCaptureState(tabId);
      if (captureState !== 'off') return captureState;

      const sessionId = this.host.getSessionIdForTab(tabId);
      const traceId = sessionId ? service.store.resolveTraceId(sessionId) : undefined;
      const summary = traceId
        ? service.store.listSummaries(100).find((item) => item.traceId === traceId)
        : undefined;
      if (!summary?.unreadAnomalyCount) return 'normal';
      return summary.highestUnreadSeverity === 'critical' || summary.highestUnreadSeverity === 'error'
        ? 'critical'
        : 'warning';
    } catch {
      return 'degraded';
    }
  }

  showOpenCodeDiagnostics(event: MouseEvent): void {
    try {
      const tabId = this.host.getActiveTabId();
      if (!tabId) return;
      const service = this.host.getOpenCodeTraceService();
      if (!service) return;

      const sessionId = this.host.getSessionIdForTab(tabId) ?? undefined;
      const menu = this.host.createMenu();
      const captureState = service.getCaptureState(tabId);
      if (captureState === 'armed') {
        menu.addItem((item) => item
          .setTitle(t('chat.opencodeDiagnostics.cancelCapture'))
          .setIcon('circle-stop')
          .onClick(() => {
            try {
              service.cancelDeepCapture(tabId);
              this.host.refreshHeaderChrome();
            } catch {
              return;
            }
          }));
      } else {
        menu.addItem((item) => item
          .setTitle(t('chat.opencodeDiagnostics.captureNext'))
          .setIcon('radio')
          .onClick(() => {
            try {
              service.armDeepCapture(tabId, sessionId);
              this.host.refreshHeaderChrome();
              this.host.showNotice(t('chat.opencodeDiagnostics.captureArmed'));
            } catch {
              return;
            }
          }));
      }
      menu.addItem((item) => item
        .setTitle(t('chat.opencodeDiagnostics.copySession'))
        .setIcon('copy')
        .onClick(async () => {
          try {
            const traceId = sessionId ? service.store.resolveTraceId(sessionId) : undefined;
            const userContext = await this.host.promptDiagnosticsUserContext();
            const report = await service.reportBuilder.buildSmartReport(
              traceId,
              userContext,
              { selection: 'current-session' },
            );
            await this.host.writeTextToClipboard(report);
            this.host.refreshHeaderChrome();
            this.host.showNotice(t('chat.opencodeDiagnostics.copySuccess'));
          } catch {
            return;
          }
        }));
      menu.showAtMouseEvent(event);
    } catch {
      return;
    }
  }

  claimOpenCodeDiagnosticRunToken(
    tabId: string | null,
    sessionId: string | null | undefined,
  ): DiagnosticRunToken | undefined {
    if (!tabId) return undefined;
    try {
      return this.host.getOpenCodeTraceService()?.claimDeepCapture(tabId, sessionId ?? undefined);
    } catch {
      return undefined;
    }
  }

  cancelOpenCodeDiagnosticCapture(tabId: string | null): void {
    if (!tabId) return;
    try {
      this.host.getOpenCodeTraceService()?.cancelDeepCapture(tabId);
    } catch {
      return;
    }
  }

  getCodexDiagnosticsState(tabId: string | null): CodexDiagnosticsState {
    return this.codexDiagnosticsAdapter.getDiagnosticsState(tabId);
  }

  showCodexDiagnostics(event: MouseEvent, tabId: string): void {
    this.codexDiagnosticsAdapter.showDiagnostics(event, tabId);
  }

  claimCodexDiagnosticRunToken(
    tabId: string | null,
    threadId?: string,
  ): DiagnosticRunToken | undefined {
    return this.codexDiagnosticsAdapter.claimDiagnosticRunToken(tabId, threadId);
  }

  cancelCodexDiagnosticCapture(tabId: string): void {
    this.codexDiagnosticsAdapter.cancelDiagnosticCapture(tabId);
  }
}
