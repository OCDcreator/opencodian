/**
 * CodexDiagnosticsHostAdapter — owns the Codex diagnostics host-callback
 * behavior that previously lived inline inside `OpenCodianView.ts`.
 *
 * Extracted to keep `OpenCodianView.ts` a thin shell (owner-guard
 * RULE_3_NET_NEW_OWNERSHIP). The adapter takes the dependencies it needs via a
 * host object and exposes the read/route/claim/cancel/export/prompt methods
 * the view delegates to. Behavior is byte-for-byte identical to the prior
 * inline implementation; only the location changed.
 *
 * All host-callback reads/calls run inside a safe boundary so a throwing
 * trace service can never interrupt the header render, the chat send path, or
 * tab recovery.
 */
import type { Menu } from 'obsidian';

import type { CodexSessionTraceService } from '../../../core/agents/backend/diagnostics/CodexSessionTraceService';
import type { Conversation } from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TraceStoreStatus } from '../../../shared/diagnostics/types';
import type { DiagnosticRunToken } from '../runtime/SendPipelineTypes';

const logger = createLogger('CodexDiagnosticsHostAdapter');

/**
 * Degraded trace-store status used as the safe fallback when reading the live
 * status throws. Marked `mode: 'memory'` + `lastError` so the adapter's
 * severity resolution treats it as `'degraded'`, matching the behavior of the
 * prior inline implementation when the store was unreadable.
 */
const DEGRADED_STORE_STATUS: TraceStoreStatus = {
  mode: 'memory',
  rootDirectory: '',
  queuedEvents: 0,
  approximateBytes: 0,
  droppedEvents: 0,
  lastError: 'unreadable',
};

export type CodexDiagnosticsState =
  | 'disabled'
  | 'degraded'
  | 'armed'
  | 'capturing'
  | 'normal'
  | 'warning'
  | 'critical';

export interface CodexSessionTraceSettingsLike {
  enabled: boolean;
}

/**
 * Dependencies the adapter reads from the owning view. All members are
 * callbacks so the adapter always sees live state without holding a direct
 * reference to the plugin/view.
 */
export interface CodexDiagnosticsHostAdapterHost {
  /** Live Codex trace service, or undefined when tracing is not constructed. */
  getCodexTraceService(): CodexSessionTraceService | undefined;
  /** Live Codex session-trace settings snapshot. */
  getCodexSessionTraceSettings(): CodexSessionTraceSettingsLike;
  /** The currently active conversation, or null. */
  getCurrentConversation(): Conversation | null;
  /** Re-renders the header diagnostics chrome after a state mutation. */
  refreshHeaderChrome(): void;
  /** Constructs a new Obsidian `Menu`. Abstracted so tests can stub it. */
  createMenu(): Menu;
  /** Shows an Obsidian `Notice`. Abstracted so tests can stub it. */
  showNotice(message: string): void;
}

export class CodexDiagnosticsHostAdapter {
  constructor(private readonly host: CodexDiagnosticsHostAdapterHost) {}

  /**
   * Resolves the Codex diagnostics badge state for the active tab. Mirrors the
   * prior inline implementation: 'disabled' when tracing is off, 'degraded'
   * when the store is unhealthy, otherwise the live capture state or the
   * severity derived from unread anomalies.
   */
  getDiagnosticsState(tabId: string | null): CodexDiagnosticsState {
    const service = this.safeTrace(() => this.host.getCodexTraceService(), undefined);
    const settings = this.safeTrace(() => this.host.getCodexSessionTraceSettings(), { enabled: false });
    if (!settings.enabled || !service) return 'disabled';
    const storeStatus = this.safeTrace(
      () => service.store.getStatus(),
      DEGRADED_STORE_STATUS,
    );
    if (storeStatus.mode === 'memory' || storeStatus.lastError) return 'degraded';
    if (!tabId) return 'normal';
    const captureState = this.safeTrace(() => service.getCaptureState(tabId), 'off');
    if (captureState !== 'off') return captureState;
    const conversation = this.safeTrace(() => this.host.getCurrentConversation(), null);
    const backendSessionId = conversation
      ? getConversationBackendSessionId(conversation)
      : undefined;
    const traceId = backendSessionId
      ? this.safeTrace(() => service.store.resolveTraceId(backendSessionId), undefined)
      : undefined;
    const summary = traceId
      ? this.safeTrace(
        () => service.store.listSummaries(100).find((item) => item.traceId === traceId),
        undefined,
      )
      : undefined;
    if (!summary?.unreadAnomalyCount) return 'normal';
    return summary.highestUnreadSeverity === 'critical' || summary.highestUnreadSeverity === 'error'
      ? 'critical'
      : 'warning';
  }

  /**
   * Builds and shows the Codex diagnostics context menu (cancel/arming/copy).
   * Routes the menu show through the safe boundary so a trace throw cannot
   * interrupt the header click.
   */
  showDiagnostics(event: MouseEvent, tabId: string): void {
    this.safeTrace(() => this.buildAndShowDiagnosticsMenu(event, tabId), undefined);
  }

  private buildAndShowDiagnosticsMenu(event: MouseEvent, tabId: string): void {
    if (!this.isDiagnosticsEnabled()) return;
    const service = this.host.getCodexTraceService();
    if (!service || !tabId) return;
    const conversation = this.host.getCurrentConversation();
    const backendSessionId = conversation
      ? getConversationBackendSessionId(conversation) ?? undefined
      : undefined;
    const menu = this.host.createMenu();
    const captureState = service.getCaptureState(tabId);
    if (captureState === 'armed' || captureState === 'capturing') {
      menu.addItem((item) => item
        .setTitle(t('chat.opencodeDiagnostics.cancelCapture'))
        .setIcon('circle-stop')
        .onClick(async () => {
          const cancelled = this.safeTrace(() => {
            service.cancelDeepCapture(tabId);
            return true;
          }, false);
          if (cancelled) {
            this.safeTrace(() => this.host.refreshHeaderChrome(), undefined);
          }
        }));
    } else {
      menu.addItem((item) => item
        .setTitle(t('chat.opencodeDiagnostics.captureNext'))
        .setIcon('radio')
        .onClick(async () => {
          const token = this.safeTrace(
            () => service.armDeepCapture(tabId, backendSessionId),
            undefined,
          );
          if (!token) return;
          const armed = Boolean(token && token.expiresAt > Date.now());
          this.safeTrace(() => this.host.refreshHeaderChrome(), undefined);
          if (armed) {
            this.safeTrace(() => this.host.showNotice(t('chat.opencodeDiagnostics.captureArmed')), undefined);
          }
        }));
    }
    menu.addItem((item) => item
      .setTitle(t('chat.opencodeDiagnostics.copySession'))
      .setIcon('copy')
      .onClick(async () => {
        if (conversation) {
          await this.exportConversationDiagnostics(conversation);
        }
        this.safeTrace(() => this.host.refreshHeaderChrome(), undefined);
      }));
    menu.showAtMouseEvent(event);
  }

  /**
   * Claims a Codex diagnostic deep-capture token for the outgoing send. Used
   * by the send pipeline host callback. Returns undefined when no token can be
   * claimed (no tab, no service, or the arm window has elapsed).
   */
  claimDiagnosticRunToken(tabId: string | null, threadId?: string): DiagnosticRunToken | undefined {
    if (!tabId) return undefined;
    return this.safeTrace(
      () => this.host.getCodexTraceService()?.claimDeepCapture(tabId, threadId ?? undefined),
      undefined,
    );
  }

  /** Cancels any armed/claimed deep capture for the tab (tab recovery path). */
  cancelDiagnosticCapture(tabId: string): void {
    if (!this.isDiagnosticsEnabled()) return;
    this.safeTrace(() => this.host.getCodexTraceService()?.cancelDeepCapture(tabId), undefined);
  }

  /**
   * Flushes, resolves the trace id, prompts for context, builds the smart
   * report, and copies it to the clipboard. Shows an unavailable notice when
   * the service or thread id is missing.
   */
  async exportConversationDiagnostics(conversation: Conversation): Promise<void> {
    if (!this.isDiagnosticsEnabled()) return;
    const service = this.safeTrace(() => this.host.getCodexTraceService(), undefined);
    const threadId = getConversationBackendSessionId(conversation);
    if (!service || !threadId) {
      this.safeTrace(() => this.host.showNotice(t('settings.debug.codex.exportUnavailable')), undefined);
      return;
    }
    const report = await this.safeTraceAsync(async () => {
      service.flushRingBuffer(threadId, 'manual-export');
      await service.store.flush();
      const traceId = service.store.resolveTraceId(threadId);
      const userContext = await this.promptDiagnosticsUserContext();
      return service.reportBuilder.buildSmartReport(traceId, userContext, { selection: 'current-session' });
    }, undefined);
    if (report === undefined) {
      this.safeTrace(() => this.host.showNotice(t('settings.debug.codex.exportUnavailable')), undefined);
      return;
    }
    const copied = await this.safeTraceAsync(async () => {
      await navigator.clipboard.writeText(report);
      return true;
    }, false);
    this.safeTrace(
      () => this.host.showNotice(t(copied
        ? 'settings.debug.codex.actions.copySuccess'
        : 'settings.debug.actions.copyFailed')),
      undefined,
    );
  }

  /**
   * Shared actual/expected/reproduction prompt used by the Codex "copy session
   * diagnostics" action. The prompts are generic enough to reuse the existing
   * `chat.opencodeDiagnostics.*Prompt` keys.
   */
  async promptDiagnosticsUserContext(): Promise<{
    actual?: string;
    expected?: string;
    reproduction?: string;
  }> {
    const actual = window.prompt(t('chat.opencodeDiagnostics.actualPrompt')) ?? undefined;
    const expected = window.prompt(t('chat.opencodeDiagnostics.expectedPrompt')) ?? undefined;
    const reproduction = window.prompt(t('chat.opencodeDiagnostics.reproductionPrompt')) ?? undefined;
    return { actual, expected, reproduction };
  }

  private isDiagnosticsEnabled(): boolean {
    return this.safeTrace(() => this.host.getCodexSessionTraceSettings().enabled, false);
  }

  /**
   * Runs a trace-hook read/call inside a safe boundary so a throwing trace
   * service can never interrupt the header render, chat send path, or tab
   * recovery. Returns the fallback on throw; behavior is unchanged when the
   * trace service is healthy.
   */
  private safeTrace<T>(run: () => T, fallback: T): T {
    try {
      return run();
    } catch {
      logger.warn('trace hook threw; falling back without trace data');
      return fallback;
    }
  }

  /** Async counterpart for deferred menu callbacks and trace-store I/O. */
  private async safeTraceAsync<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch {
      logger.warn('trace hook rejected; falling back without trace data');
      return fallback;
    }
  }
}
