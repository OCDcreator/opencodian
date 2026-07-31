import type { Menu } from 'obsidian';

import type { ClaudeSessionTraceService } from '../../../core/agents/backend/diagnostics/ClaudeSessionTraceService';
import type {
  OpenCodeSessionTraceService,
  OpenCodeSessionTraceSettings,
} from '../../../core/opencode/diagnostics/OpenCodeSessionTraceService';
import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import type { DiagnosticRunToken } from '../runtime/SendPipelineTypes';
import {
  ClaudeDiagnosticsHostAdapter,
  type ClaudeDiagnosticsHostAdapterHost,
  type ClaudeDiagnosticsState,
} from './ClaudeDiagnosticsHostAdapter';
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
 * Chat-owned inputs used to assemble a diagnostics coordinator. This surface
 * deliberately excludes every backend trace service: app composition supplies
 * those through the opaque factory below.
 */
export interface ChatDiagnosticsCoordinatorViewHost {
  getOpenCodeSessionTraceSettings(): Pick<OpenCodeSessionTraceSettings, 'enabled'>;
  getCodexSessionTraceSettings(): { enabled: boolean };
  getClaudeSessionTraceSettings(): { enabled: boolean };
  getActiveTabId(): string | null;
  getSessionIdForTab(tabId: string): string | null;
  getCurrentConversation(): Conversation | null;
  refreshHeaderChrome(): void;
  createOpenCodeDiagnosticsMenu(): OpenCodeDiagnosticsMenu;
  createBackendDiagnosticsMenu(): Menu;
  promptDiagnosticsUserContext(): Promise<OpenCodeDiagnosticsUserContext>;
  writeTextToClipboard(text: string): Promise<void>;
  showNotice(message: string): void;
}

/**
 * App-composition trace ports. The explicit backend getters prevent a generic
 * backend lookup or merged diagnostics state from leaking into the chat view.
 */
export interface ChatDiagnosticsBackendPorts {
  getOpenCodeTraceService(): OpenCodeTraceServicePort | undefined;
  getCodexTraceService(): ReturnType<CodexDiagnosticsHostAdapterHost['getCodexTraceService']>;
  getClaudeTraceService(): ClaudeSessionTraceService | undefined;
}

/** Opaque assembly seam injected by app composition into OpenCodianView. */
export interface ChatDiagnosticsCoordinatorFactory {
  create(host: ChatDiagnosticsCoordinatorViewHost): ChatDiagnosticsCoordinator;
}

const noTraceBackendPorts: ChatDiagnosticsBackendPorts = {
  getOpenCodeTraceService: () => undefined,
  getCodexTraceService: () => undefined,
  getClaudeTraceService: () => undefined,
};

function createFailClosedCodexDiagnosticsHost(): CodexDiagnosticsHostAdapterHost {
  return {
    getCodexTraceService: () => undefined,
    getCodexSessionTraceSettings: () => ({ enabled: false }),
    getCurrentConversation: () => null,
    refreshHeaderChrome: () => undefined,
    createMenu: () => ({}) as Menu,
    showNotice: () => undefined,
  };
}

function createFailClosedClaudeDiagnosticsHost(): ClaudeDiagnosticsHostAdapterHost {
  return {
    getClaudeTraceService: () => undefined,
    getClaudeSessionTraceSettings: () => ({ enabled: false }),
    getCurrentConversation: () => null,
    refreshHeaderChrome: () => undefined,
    createMenu: () => ({}) as Menu,
    showNotice: () => undefined,
  };
}

/**
 * Creates a backend-specific coordinator factory. The factory closes over the
 * app-owned trace ports, while the view supplies only live chat/UI state.
 */
export function createChatDiagnosticsCoordinatorFactory(
  ports: ChatDiagnosticsBackendPorts = noTraceBackendPorts,
): ChatDiagnosticsCoordinatorFactory {
  return {
    create(viewHost: ChatDiagnosticsCoordinatorViewHost): ChatDiagnosticsCoordinator {
      return new ChatDiagnosticsCoordinator({
        getOpenCodeSessionTraceSettings: () => viewHost.getOpenCodeSessionTraceSettings(),
        getOpenCodeTraceService: () => ports.getOpenCodeTraceService(),
        getActiveTabId: () => viewHost.getActiveTabId(),
        getSessionIdForTab: (tabId) => viewHost.getSessionIdForTab(tabId),
        refreshHeaderChrome: () => viewHost.refreshHeaderChrome(),
        createMenu: () => viewHost.createOpenCodeDiagnosticsMenu(),
        promptDiagnosticsUserContext: () => viewHost.promptDiagnosticsUserContext(),
        writeTextToClipboard: (text) => viewHost.writeTextToClipboard(text),
        showNotice: (message) => viewHost.showNotice(message),
      }, {
        getCodexTraceService: () => ports.getCodexTraceService(),
        getCodexSessionTraceSettings: () => viewHost.getCodexSessionTraceSettings(),
        getCurrentConversation: () => viewHost.getCurrentConversation(),
        refreshHeaderChrome: () => viewHost.refreshHeaderChrome(),
        createMenu: () => viewHost.createBackendDiagnosticsMenu(),
        showNotice: (message) => viewHost.showNotice(message),
      }, {
        getClaudeTraceService: () => ports.getClaudeTraceService(),
        getClaudeSessionTraceSettings: () => viewHost.getClaudeSessionTraceSettings(),
        getCurrentConversation: () => viewHost.getCurrentConversation(),
        refreshHeaderChrome: () => viewHost.refreshHeaderChrome(),
        createMenu: () => viewHost.createBackendDiagnosticsMenu(),
        showNotice: (message) => viewHost.showNotice(message),
      });
    },
  };
}

/** Default for direct view construction and tests before app composition. */
export const failClosedChatDiagnosticsCoordinatorFactory =
  createChatDiagnosticsCoordinatorFactory();

/**
 * Owns OpenCode, Codex, and Claude diagnostics operations at the chat surface boundary.
 *
 * The coordinator intentionally receives only narrow ports. Trace failures are
 * absorbed without logging so diagnostic data never escapes through an error
 * message, and the normal chat path remains available.
 */
export class ChatDiagnosticsCoordinator {
  private readonly codexDiagnosticsAdapter: CodexDiagnosticsHostAdapter;
  private readonly claudeDiagnosticsAdapter: ClaudeDiagnosticsHostAdapter;

  constructor(
    private readonly host: ChatDiagnosticsCoordinatorHost,
    codexDiagnosticsHost: CodexDiagnosticsHostAdapterHost = createFailClosedCodexDiagnosticsHost(),
    claudeDiagnosticsHost: ClaudeDiagnosticsHostAdapterHost = createFailClosedClaudeDiagnosticsHost(),
  ) {
    this.codexDiagnosticsAdapter = new CodexDiagnosticsHostAdapter(codexDiagnosticsHost);
    this.claudeDiagnosticsAdapter = new ClaudeDiagnosticsHostAdapter(claudeDiagnosticsHost);
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

  getClaudeDiagnosticsState(tabId: string | null): ClaudeDiagnosticsState {
    return this.claudeDiagnosticsAdapter.getDiagnosticsState(tabId);
  }

  showClaudeDiagnostics(event: MouseEvent, tabId: string): void {
    this.claudeDiagnosticsAdapter.showDiagnostics(event, tabId);
  }

  claimClaudeDiagnosticRunToken(
    tabId: string | null,
    sessionId?: string,
  ): DiagnosticRunToken | undefined {
    return this.claudeDiagnosticsAdapter.claimDiagnosticRunToken(tabId, sessionId);
  }

  cancelClaudeDiagnosticCapture(tabId: string): void {
    this.claudeDiagnosticsAdapter.cancelDiagnosticCapture(tabId);
  }
}
