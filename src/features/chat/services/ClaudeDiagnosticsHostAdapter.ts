/**
 * Claude Code session-trace host callbacks. This mirrors the Codex host
 * adapter while keeping all diagnostics failures outside the chat path.
 */
import type { Menu } from 'obsidian';

import type { ClaudeSessionTraceService } from '../../../core/agents/backend/diagnostics/ClaudeSessionTraceService';
import type { Conversation } from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TraceStoreStatus } from '../../../shared/diagnostics/types';
import type { DiagnosticRunToken } from '../runtime/SendPipelineTypes';

const logger = createLogger('ClaudeDiagnosticsHostAdapter');

const DEGRADED_STORE_STATUS: TraceStoreStatus = {
  mode: 'memory',
  rootDirectory: '',
  queuedEvents: 0,
  approximateBytes: 0,
  droppedEvents: 0,
  lastError: 'unreadable',
};

export type ClaudeDiagnosticsState =
  | 'disabled'
  | 'degraded'
  | 'armed'
  | 'capturing'
  | 'normal'
  | 'warning'
  | 'critical';

export interface ClaudeSessionTraceSettingsLike {
  enabled: boolean;
}

export interface ClaudeDiagnosticsHostAdapterHost {
  getClaudeTraceService(): ClaudeSessionTraceService | undefined;
  getClaudeSessionTraceSettings(): ClaudeSessionTraceSettingsLike;
  getCurrentConversation(): Conversation | null;
  refreshHeaderChrome(): void;
  createMenu(): Menu;
  showNotice(message: string): void;
}

export class ClaudeDiagnosticsHostAdapter {
  constructor(private readonly host: ClaudeDiagnosticsHostAdapterHost) {}

  getDiagnosticsState(tabId: string | null): ClaudeDiagnosticsState {
    const service = this.safeTrace(() => this.host.getClaudeTraceService(), undefined);
    const settings = this.safeTrace(() => this.host.getClaudeSessionTraceSettings(), { enabled: false });
    if (!settings.enabled || !service) return 'disabled';
    const storeStatus = this.safeTrace(() => service.getStorageStatus(), DEGRADED_STORE_STATUS);
    if (storeStatus.mode === 'memory' || storeStatus.lastError) return 'degraded';
    if (!tabId) return 'normal';
    const captureState = this.safeTrace(() => service.getCaptureState(tabId), 'off');
    if (captureState !== 'off') return captureState;
    const conversation = this.safeTrace(() => this.host.getCurrentConversation(), null);
    const sessionId = conversation ? getConversationBackendSessionId(conversation) : undefined;
    const traceId = this.safeTrace(() => service.resolveTraceId(sessionId), undefined);
    const summary = traceId
      ? this.safeTrace(() => service.listRecentTraces(100).find((item) => item.traceId === traceId), undefined)
      : undefined;
    if (!summary?.unreadAnomalyCount) return 'normal';
    return summary.highestUnreadSeverity === 'critical' || summary.highestUnreadSeverity === 'error'
      ? 'critical'
      : 'warning';
  }

  showDiagnostics(event: MouseEvent, tabId: string): void {
    this.safeTrace(() => this.buildAndShowDiagnosticsMenu(event, tabId), undefined);
  }

  private buildAndShowDiagnosticsMenu(event: MouseEvent, tabId: string): void {
    if (!this.isDiagnosticsEnabled()) return;
    const service = this.host.getClaudeTraceService();
    if (!service || !tabId) return;
    const conversation = this.host.getCurrentConversation();
    const sessionId = conversation ? getConversationBackendSessionId(conversation) : undefined;
    const menu = this.host.createMenu();
    const captureState = service.getCaptureState(tabId);
    if (captureState === 'armed' || captureState === 'capturing') {
      menu.addItem((item) => item
        .setTitle(t('chat.claudeDiagnostics.cancelCapture'))
        .setIcon('circle-stop')
        .onClick(() => {
          const cancelled = this.safeTrace(() => service.cancelDeepCapture(tabId), false);
          if (cancelled) this.safeTrace(() => this.host.refreshHeaderChrome(), undefined);
        }));
    } else {
      menu.addItem((item) => item
        .setTitle(t('chat.claudeDiagnostics.captureNext'))
        .setIcon('radio')
        .onClick(() => {
          const token = this.safeTrace(() => service.armDeepCapture(tabId, sessionId), undefined);
          if (!token) return;
          const armed = token.expiresAt > Date.now();
          this.safeTrace(() => this.host.refreshHeaderChrome(), undefined);
          if (armed) this.safeTrace(() => this.host.showNotice(t('chat.claudeDiagnostics.captureArmed')), undefined);
        }));
    }
    menu.addItem((item) => item
      .setTitle(t('chat.claudeDiagnostics.copySession'))
      .setIcon('copy')
      .onClick(async () => {
        if (conversation) await this.exportConversationDiagnostics(conversation);
        this.safeTrace(() => this.host.refreshHeaderChrome(), undefined);
      }));
    menu.showAtMouseEvent(event);
  }

  claimDiagnosticRunToken(tabId: string | null, sessionId?: string): DiagnosticRunToken | undefined {
    if (!tabId) return undefined;
    return this.safeTrace(
      () => this.host.getClaudeTraceService()?.claimDeepCapture(tabId, sessionId),
      undefined,
    );
  }

  cancelDiagnosticCapture(tabId: string): void {
    if (!this.isDiagnosticsEnabled()) return;
    this.safeTrace(() => this.host.getClaudeTraceService()?.cancelDeepCapture(tabId), undefined);
  }

  async exportConversationDiagnostics(conversation: Conversation): Promise<void> {
    if (!this.isDiagnosticsEnabled()) return;
    const service = this.safeTrace(() => this.host.getClaudeTraceService(), undefined);
    const sessionId = getConversationBackendSessionId(conversation);
    if (!service || !sessionId) {
      this.safeTrace(() => this.host.showNotice(t('settings.debug.claude.exportUnavailable')), undefined);
      return;
    }
    const report = await this.safeTraceAsync(async () => {
      service.flushRingBuffer(sessionId, 'manual-export');
      await service.store.flush();
      const traceId = service.resolveTraceId(sessionId);
      const userContext = await this.promptDiagnosticsUserContext();
      return service.buildSmartReport(traceId, userContext, { selection: 'current-session' });
    }, undefined);
    if (!report) {
      this.safeTrace(() => this.host.showNotice(t('settings.debug.claude.exportUnavailable')), undefined);
      return;
    }
    const copied = await this.safeTraceAsync(async () => {
      await navigator.clipboard.writeText(report);
      return true;
    }, false);
    this.safeTrace(
      () => this.host.showNotice(t(copied
        ? 'settings.debug.claude.actions.copySuccess'
        : 'settings.debug.actions.copyFailed')),
      undefined,
    );
  }

  async promptDiagnosticsUserContext(): Promise<{
    actual?: string;
    expected?: string;
    reproduction?: string;
  }> {
    const actual = window.prompt(t('chat.claudeDiagnostics.actualPrompt')) ?? undefined;
    const expected = window.prompt(t('chat.claudeDiagnostics.expectedPrompt')) ?? undefined;
    const reproduction = window.prompt(t('chat.claudeDiagnostics.reproductionPrompt')) ?? undefined;
    return { actual, expected, reproduction };
  }

  private isDiagnosticsEnabled(): boolean {
    return this.safeTrace(() => this.host.getClaudeSessionTraceSettings().enabled, false);
  }

  private safeTrace<T>(run: () => T, fallback: T): T {
    try {
      return run();
    } catch {
      logger.warn('trace hook threw; falling back without trace data');
      return fallback;
    }
  }

  private async safeTraceAsync<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch {
      logger.warn('trace hook rejected; falling back without trace data');
      return fallback;
    }
  }
}
