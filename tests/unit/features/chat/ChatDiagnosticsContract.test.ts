/* eslint-disable max-lines, max-lines-per-function -- Chat-diagnostics characterization captures the fail-closed host-adapter boundary and the delete-conversation no-trace-interaction invariant before Task 12 extraction. */
/**
 * Phase 3 Task 10 — ChatDiagnosticsContract characterization.
 *
 * Captures the chat-side diagnostics routing behavior after Task 12
 * (`ChatDiagnosticsCoordinator`) extraction:
 *
 *   1. Codex/Claude host adapters are the fail-closed boundary: every trace
 *      read/call runs inside safeTrace() and returns a safe fallback on throw,
 *      so a trace bug can never escape into the header render, send path, or
 *      tab cleanup.
 *   2. claim/cancel reach the underlying trace service per-tab.
 *   3. isDiagnosticsEnabled gates claim/cancel/export.
 *   4. delete-conversation performs NO trace interaction (the plan's explicit
 *      invariant — Task 12 must not invent a seam that does not exist).
 *
 * The units under test are the host adapters, the OpenCode coordinator routing,
 * and the delete-conversation path through StorageService.
 */
import type { Menu } from 'obsidian';

import type { ClaudeDiagnosticsHostAdapterHost } from '../../../../src/features/chat/services/ClaudeDiagnosticsHostAdapter';
import { ClaudeDiagnosticsHostAdapter } from '../../../../src/features/chat/services/ClaudeDiagnosticsHostAdapter';
import type { CodexDiagnosticsHostAdapterHost } from '../../../../src/features/chat/services/CodexDiagnosticsHostAdapter';
import { CodexDiagnosticsHostAdapter } from '../../../../src/features/chat/services/CodexDiagnosticsHostAdapter';

// ---------------------------------------------------------------------------
// Minimal trace-service stubs. The adapters only call a handful of methods, so
// we stub exactly those and instrument them to detect calls / inject throws.
// ---------------------------------------------------------------------------

interface TraceServiceStub {
  getCaptureState: jest.Mock;
  claimDeepCapture: jest.Mock;
  cancelDeepCapture: jest.Mock;
  armDeepCapture: jest.Mock;
  getStorageStatus: jest.Mock;
  resolveTraceId: jest.Mock;
  listRecentTraces: jest.Mock;
}

function createTraceServiceStub(overrides: Partial<TraceServiceStub> = {}): TraceServiceStub {
  return {
    getCaptureState: jest.fn().mockReturnValue('off'),
    claimDeepCapture: jest.fn().mockReturnValue(undefined),
    cancelDeepCapture: jest.fn().mockReturnValue(true),
    armDeepCapture: jest.fn().mockReturnValue({ runId: 'run-1', tabId: 'tab-1', armedAt: 1, expiresAt: 2 }),
    getStorageStatus: jest.fn().mockReturnValue({
      mode: 'disk',
      rootDirectory: '/tmp/diag',
      queuedEvents: 0,
      approximateBytes: 0,
      droppedEvents: 0,
      lastError: undefined,
    }),
    resolveTraceId: jest.fn().mockReturnValue(undefined),
    listRecentTraces: jest.fn().mockReturnValue([]),
    ...overrides,
  };
}

function createMenuStub(): Menu {
  return {
    addItem: jest.fn().mockReturnThis(),
    showAtMouseEvent: jest.fn(),
    addSections: jest.fn(),
    showAtPosition: jest.fn(),
  } as unknown as Menu;
}

function readOpenCodianViewSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  return fs.readFileSync(
    path.resolve(__dirname, '../../../../src/features/chat/OpenCodianView.ts'),
    'utf8',
  );
}

function readBoundedOpenCodianViewBlock(startMarker: string, endMarker: string): string {
  const source = readOpenCodianViewSource();
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function readChatRuntimeCompositionSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  return fs.readFileSync(
    path.resolve(__dirname, '../../../../src/features/chat/runtime/ChatRuntimeComposition.ts'),
    'utf8',
  );
}

function readBoundedChatRuntimeCompositionBlock(startMarker: string, endMarker: string): string {
  const source = readChatRuntimeCompositionSource();
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function readChatDiagnosticsCoordinatorSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  return fs.readFileSync(
    path.resolve(__dirname, '../../../../src/features/chat/services/ChatDiagnosticsCoordinator.ts'),
    'utf8',
  );
}

function expectSourceOrder(source: string, snippets: readonly string[]): void {
  let cursor = 0;
  for (const snippet of snippets) {
    const next = source.indexOf(snippet, cursor);
    expect(next).toBeGreaterThanOrEqual(0);
    cursor = next + snippet.length;
  }
}

describe('Phase 3 Task 10 — ChatDiagnosticsContract (characterization)', () => {
  // ---------------------------------------------------------------------------
  // Step 3: fail-closed behavior of the host adapters.
  //
  // safeTrace() wraps every trace read/call in try/catch and returns a safe
  // fallback (undefined / false / 'off' / DEGRADED_STORE_STATUS). A throwing
  // trace service must never propagate into the chat path. This is THE
  // availability contract Task 12 must preserve.
  // ---------------------------------------------------------------------------

  describe('Claude host adapter fail-closed boundary', () => {
    function createAdapter(host: Partial<ClaudeDiagnosticsHostAdapterHost> & { getClaudeTraceService: () => unknown }) {
      return new ClaudeDiagnosticsHostAdapter({
        getClaudeTraceService: host.getClaudeTraceService,
        getClaudeSessionTraceSettings: host.getClaudeSessionTraceSettings ?? (() => ({ enabled: true })),
        getCurrentConversation: host.getCurrentConversation ?? (() => null),
        refreshHeaderChrome: host.refreshHeaderChrome ?? jest.fn(),
        createMenu: host.createMenu ?? (() => createMenuStub()),
        showNotice: host.showNotice ?? jest.fn(),
      });
    }

    it('getDiagnosticsState returns disabled when the trace service throws on read', () => {
      const adapter = createAdapter({
        getClaudeTraceService: () => { throw new Error('trace service unreadable'); },
      });
      // isDiagnosticsEnabled falls back to false → state is 'disabled'.
      expect(adapter.getDiagnosticsState('tab-1')).toBe('disabled');
    });

    it('getDiagnosticsState returns degraded when getStorageStatus throws', () => {
      const service = createTraceServiceStub({ getStorageStatus: jest.fn(() => { throw new Error('disk gone'); }) });
      const adapter = createAdapter({ getClaudeTraceService: () => service });
      expect(adapter.getDiagnosticsState('tab-1')).toBe('degraded');
    });

    it('getDiagnosticsState returns off→normal when captureState is off and store is healthy', () => {
      const service = createTraceServiceStub({ getCaptureState: jest.fn().mockReturnValue('off') });
      const adapter = createAdapter({ getClaudeTraceService: () => service });
      // No tabId → 'normal' (healthy store, no capture).
      expect(adapter.getDiagnosticsState(null)).toBe('normal');
      // tabId with capture off → 'normal'.
      expect(adapter.getDiagnosticsState('tab-1')).toBe('normal');
    });

    it('claimDiagnosticRunToken returns undefined (no throw) when the trace service throws', () => {
      const adapter = createAdapter({
        getClaudeTraceService: () => { throw new Error('claim failed'); },
      });
      expect(adapter.claimDiagnosticRunToken('tab-1', 'sess')).toBeUndefined();
    });

    it('claimDiagnosticRunToken forwards to the trace service when healthy', () => {
      const token = { runId: 'run-1', tabId: 'tab-1', armedAt: 1, expiresAt: 2 };
      const service = createTraceServiceStub({ claimDeepCapture: jest.fn().mockReturnValue(token) });
      const adapter = createAdapter({ getClaudeTraceService: () => service });
      expect(adapter.claimDiagnosticRunToken('tab-1', 'sess')).toEqual(token);
      expect(service.claimDeepCapture).toHaveBeenCalledWith('tab-1', 'sess');
    });

    it('claimDiagnosticRunToken returns undefined when tabId is null/empty', () => {
      const service = createTraceServiceStub();
      const adapter = createAdapter({ getClaudeTraceService: () => service });
      expect(adapter.claimDiagnosticRunToken(null, 'sess')).toBeUndefined();
      expect(service.claimDeepCapture).not.toHaveBeenCalled();
    });

    it('cancelDiagnosticCapture is a no-op (no throw) when diagnostics are disabled', () => {
      const service = createTraceServiceStub();
      const adapter = createAdapter({
        getClaudeTraceService: () => service,
        getClaudeSessionTraceSettings: () => ({ enabled: false }),
      });
      adapter.cancelDiagnosticCapture('tab-1');
      expect(service.cancelDeepCapture).not.toHaveBeenCalled();
    });

    it('cancelDiagnosticCapture forwards to the trace service when enabled and does not throw on service error', () => {
      const service = createTraceServiceStub({ cancelDeepCapture: jest.fn(() => { throw new Error('cancel failed'); }) });
      const adapter = createAdapter({ getClaudeTraceService: () => service });
      expect(() => adapter.cancelDiagnosticCapture('tab-1')).not.toThrow();
      expect(service.cancelDeepCapture).toHaveBeenCalledWith('tab-1');
    });
  });

  describe('Codex host adapter fail-closed boundary', () => {
    function createAdapter(host: Partial<CodexDiagnosticsHostAdapterHost> & { getCodexTraceService: () => unknown }) {
      return new CodexDiagnosticsHostAdapter({
        getCodexTraceService: host.getCodexTraceService,
        getCodexSessionTraceSettings: host.getCodexSessionTraceSettings ?? (() => ({ enabled: true })),
        getCurrentConversation: host.getCurrentConversation ?? (() => null),
        refreshHeaderChrome: host.refreshHeaderChrome ?? jest.fn(),
        createMenu: host.createMenu ?? (() => createMenuStub()),
        showNotice: host.showNotice ?? jest.fn(),
      });
    }

    it('getDiagnosticsState returns disabled when the trace service throws', () => {
      const adapter = createAdapter({
        getCodexTraceService: () => { throw new Error('unreadable'); },
      });
      expect(adapter.getDiagnosticsState('tab-1')).toBe('disabled');
    });

    it('claimDiagnosticRunToken returns undefined when the trace service throws', () => {
      const adapter = createAdapter({
        getCodexTraceService: () => { throw new Error('claim failed'); },
      });
      expect(adapter.claimDiagnosticRunToken('tab-1', 'thread')).toBeUndefined();
    });

    it('cancelDiagnosticCapture is a no-op when diagnostics disabled', () => {
      const service = createTraceServiceStub();
      const adapter = createAdapter({
        getCodexTraceService: () => service,
        getCodexSessionTraceSettings: () => ({ enabled: false }),
      });
      adapter.cancelDiagnosticCapture('tab-1');
      expect(service.cancelDeepCapture).not.toHaveBeenCalled();
    });

    it('cancelDiagnosticCapture forwards and swallows service errors', () => {
      const service = createTraceServiceStub({ cancelDeepCapture: jest.fn(() => { throw new Error('boom'); }) });
      const adapter = createAdapter({ getCodexTraceService: () => service });
      expect(() => adapter.cancelDiagnosticCapture('tab-1')).not.toThrow();
      expect(service.cancelDeepCapture).toHaveBeenCalledWith('tab-1');
    });
  });

  // ---------------------------------------------------------------------------
  // Step 3 (cont.): header/menu route behavior — actual menu actions.
  //
  // The adapters build a menu via showDiagnostics(event, tabId). The menu items
  // (cancel/arming/copy) invoke trace mutations through safeTrace. We capture
  // the menu's addItem callbacks and execute them to prove the actions reach
  // the trace service and that a throwing service does not escape the menu.
  // ---------------------------------------------------------------------------

  interface CapturedMenuItem { title: string; onClick: () => void | Promise<void>; }
  function createCapturingMenu(): { menu: Menu; items: CapturedMenuItem[] } {
    const items: CapturedMenuItem[] = [];
    const menu = {
      addItem: jest.fn().mockImplementation((cb: (item: { setTitle: (t: string) => unknown; setIcon: (i: string) => unknown; onClick: (fn: () => void | Promise<void>) => unknown }) => void) => {
        const item = {
          setTitle: jest.fn().mockImplementation(function (this: CapturedMenuItem, title: string) { (this as unknown as CapturedMenuItem).title = title; return this; }),
          setIcon: jest.fn().mockReturnThis(),
          onClick: jest.fn().mockImplementation((fn: () => void | Promise<void>) => { items.push({ title: '', onClick: fn }); return item; }),
        };
        cb(item);
        return menu;
      }),
      showAtMouseEvent: jest.fn(),
      showAtPosition: jest.fn(),
      addSections: jest.fn(),
    } as unknown as Menu;
    return { menu, items };
  }

  describe('header/menu route behavior — Codex adapter executes menu actions', () => {
    function createCodexAdapterWithMenu(hostOverrides: Partial<CodexDiagnosticsHostAdapterHost> = {}) {
      const service = createTraceServiceStub();
      const { menu, items } = createCapturingMenu();
      const refreshHeaderChrome = jest.fn();
      const showNotice = jest.fn();
      const adapter = new CodexDiagnosticsHostAdapter({
        getCodexTraceService: () => service,
        getCodexSessionTraceSettings: () => ({ enabled: true }),
        getCurrentConversation: () => null,
        refreshHeaderChrome,
        createMenu: () => menu,
        showNotice,
        ...hostOverrides,
      });
      return { adapter, service, items, refreshHeaderChrome, showNotice, menu };
    }

    it('showDiagnostics with captureState=armed builds a cancel menu item that calls cancelDeepCapture', () => {
      const { adapter, service, items } = createCodexAdapterWithMenu();
      service.getCaptureState.mockReturnValue('armed');
      adapter.showDiagnostics({ clientX: 0, clientY: 0 } as MouseEvent, 'tab-1');
      // The cancel item was added; executing its onClick cancels capture.
      const cancelItem = items.find((i) => i.onClick);
      expect(cancelItem).toBeDefined();
      cancelItem!.onClick();
      expect(service.cancelDeepCapture).toHaveBeenCalledWith('tab-1');
    });

    it('showDiagnostics with captureState=off builds an arm menu item that calls armDeepCapture', () => {
      const { adapter, service, items, refreshHeaderChrome } = createCodexAdapterWithMenu();
      service.getCaptureState.mockReturnValue('off');
      adapter.showDiagnostics({ clientX: 0, clientY: 0 } as MouseEvent, 'tab-1');
      const armItem = items.find((i) => i.onClick);
      expect(armItem).toBeDefined();
      armItem!.onClick();
      // The arm action MUST reach the trace service's armDeepCapture (not just
      // refresh the header chrome — that would be a no-op shim).
      expect(service.armDeepCapture).toHaveBeenCalledWith('tab-1', undefined);
      expect(refreshHeaderChrome).toHaveBeenCalled();
    });

    it('showDiagnostics does not throw and builds no menu items when the service is absent', () => {
      const { menu, items } = createCapturingMenu();
      const adapter = new CodexDiagnosticsHostAdapter({
        getCodexTraceService: () => undefined,
        getCodexSessionTraceSettings: () => ({ enabled: true }),
        getCurrentConversation: () => null,
        refreshHeaderChrome: jest.fn(),
        createMenu: () => menu,
        showNotice: jest.fn(),
      });
      expect(() => adapter.showDiagnostics({ clientX: 0, clientY: 0 } as MouseEvent, 'tab-1')).not.toThrow();
      expect(items.length).toBe(0);
    });

    it('showDiagnostics does not throw and builds no menu items when diagnostics are disabled', () => {
      const service = createTraceServiceStub();
      const { menu, items } = createCapturingMenu();
      const adapter = new CodexDiagnosticsHostAdapter({
        getCodexTraceService: () => service,
        getCodexSessionTraceSettings: () => ({ enabled: false }),
        getCurrentConversation: () => null,
        refreshHeaderChrome: jest.fn(),
        createMenu: () => menu,
        showNotice: jest.fn(),
      });
      expect(() => adapter.showDiagnostics({ clientX: 0, clientY: 0 } as MouseEvent, 'tab-1')).not.toThrow();
      expect(items.length).toBe(0);
    });
  });

  describe('header/menu route behavior — coordinator routing (source contract)', () => {
    function readHeaderDiagnosticsBlock(): string {
      return readBoundedOpenCodianViewBlock(
        'getOpenCodeDiagnosticsState: () => this.chatDiagnosticsCoordinator.getOpenCodeDiagnosticsState(),',
        'openSettings: () => {',
      );
    }

    it('routes all backend header state and menu operations through the coordinator', () => {
      const block = readHeaderDiagnosticsBlock();
      expectSourceOrder(block, [
        'getOpenCodeDiagnosticsState: () => this.chatDiagnosticsCoordinator.getOpenCodeDiagnosticsState(),',
        'showOpenCodeDiagnostics: (event) => this.chatDiagnosticsCoordinator.showOpenCodeDiagnostics(event),',
        'getCodexDiagnosticsState: (tabId) => this.chatDiagnosticsCoordinator.getCodexDiagnosticsState(tabId),',
        'showCodexDiagnostics: (event, tabId) => this.chatDiagnosticsCoordinator.showCodexDiagnostics(event, tabId),',
        'getClaudeDiagnosticsState: (tabId) => this.chatDiagnosticsCoordinator.getClaudeDiagnosticsState(tabId),',
        'showClaudeDiagnostics: (event, tabId) => this.chatDiagnosticsCoordinator.showClaudeDiagnostics(event, tabId),',
      ]);
      expect(block).not.toContain('this.plugin.openCodeTraceService');
      expect(block).not.toContain('this.codexDiagnosticsAdapter');
      expect(block).not.toContain('this.claudeDiagnosticsAdapter');
    });

    it('keeps Codex and Claude adapter composition in ChatDiagnosticsCoordinator, not OpenCodianView', () => {
      const coordinatorSource = readChatDiagnosticsCoordinatorSource();
      expectSourceOrder(coordinatorSource, [
        'private readonly codexDiagnosticsAdapter: CodexDiagnosticsHostAdapter;',
        'private readonly claudeDiagnosticsAdapter: ClaudeDiagnosticsHostAdapter;',
        'codexDiagnosticsHost: CodexDiagnosticsHostAdapterHost =',
        'claudeDiagnosticsHost: ClaudeDiagnosticsHostAdapterHost =',
        'this.codexDiagnosticsAdapter = new CodexDiagnosticsHostAdapter(codexDiagnosticsHost);',
        'this.claudeDiagnosticsAdapter = new ClaudeDiagnosticsHostAdapter(claudeDiagnosticsHost);',
        'getCodexDiagnosticsState(tabId: string | null): CodexDiagnosticsState {',
        'showCodexDiagnostics(event: MouseEvent, tabId: string): void {',
        'claimCodexDiagnosticRunToken(',
        'cancelCodexDiagnosticCapture(tabId: string): void {',
        'getClaudeDiagnosticsState(tabId: string | null): ClaudeDiagnosticsState {',
        'showClaudeDiagnostics(event: MouseEvent, tabId: string): void {',
        'claimClaudeDiagnosticRunToken(',
        'cancelClaudeDiagnosticCapture(tabId: string): void {',
      ]);

      const viewSource = readOpenCodianViewSource();
      expect(viewSource).not.toContain('CodexDiagnosticsHostAdapter');
      expect(viewSource).not.toContain('codexDiagnosticsAdapter');
      expect(viewSource).not.toContain('ClaudeDiagnosticsHostAdapter');
      expect(viewSource).not.toContain('claudeDiagnosticsAdapter');
    });

    it('OpenCodianView has no direct backend trace service, store, or report-builder access', () => {
      const viewSource = readOpenCodianViewSource();
      expect(viewSource).toContain('ChatDiagnosticsCoordinatorFactory');
      expect(viewSource).toContain('failClosedChatDiagnosticsCoordinatorFactory');
      expect(viewSource).not.toMatch(/\b(?:openCodeTraceService|codexTraceService|claudeTraceService)\b/);
      expect(viewSource).not.toMatch(/\b(?:TraceStore|reportBuilder|buildSmartReport)\b/);
    });
  });

  // ---------------------------------------------------------------------------
  // Step 3 (THE plan invariant): delete-conversation performs NO trace
  // interaction.
  //
  // The plan (Task 10 step 3) explicitly requires: "assert delete-conversation
  // currently performs no trace interaction." StorageService.deleteConversation
  // only removes the conversation file + metadata sidecar. The view's delete
  // handlers delegate to plugin.deleteConversation → StorageService. Neither
  // path calls any trace service. Task 12 must NOT invent a trace flush/cancel
  // seam here.
  //
  // We prove this by source-level contract: deleteConversation touches only
  // vault.adapter.remove + conversationMetadataCache.removeConversationMeta.
  // A behavioral test would require the full Obsidian vault mock; instead we
  // pin the structural invariant that no trace symbol is referenced from the
  // delete path.
  // ---------------------------------------------------------------------------

  describe('delete-conversation performs NO trace interaction (plan invariant)', () => {
    it('StorageService.deleteConversation source references no trace/diagnostic symbol', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/core/storage/StorageService.ts'),
        'utf8',
      );
      // Extract the deleteConversation method body.
      const start = source.indexOf('async deleteConversation(');
      expect(start).toBeGreaterThan(-1);
      // Body ends at the next method's JSDoc or the closing brace before a
      // method at column 2. Take a bounded slice.
      const body = source.slice(start, start + 600);
      // The delete path must not reference any trace/diagnostic service or the
      // plugin-level diagnostic export surfaces (buildDiagnosticReport/
      // writeDiagnosticLogFile/logServerStatusSnapshot/getServerDiagnostics).
      expect(body).not.toMatch(/traceService|TraceService|tracePort|cancelDeepCapture|claimDeepCapture|armDeepCapture|flushRingBuffer|buildSmartReport|clearAll|buildDiagnosticReport|writeDiagnosticLogFile|logServerStatusSnapshot|getServerDiagnostics/);
      // It must reference only vault removal + metadata cache removal.
      expect(body).toMatch(/vault\.adapter\.remove/);
      expect(body).toMatch(/removeConversationMeta/);
    });

    it('ConversationMetadataCache.removeConversationMeta source references no trace/diagnostic symbol', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/core/storage/ConversationMetadataCache.ts'),
        'utf8',
      );
      const start = source.indexOf('async removeConversationMeta(');
      expect(start).toBeGreaterThan(-1);
      const body = source.slice(start, start + 400);
      expect(body).not.toMatch(/traceService|TraceService|tracePort|cancelDeepCapture|claimDeepCapture|armDeepCapture|buildDiagnosticReport|writeDiagnosticLogFile/);
    });

    it('OpenCodianPlugin.deleteConversation (main.ts) source references no trace/diagnostic symbol', () => {
      // The view delegates to plugin.deleteConversation, which is the entry
      // point the chat path actually calls. It must not touch any trace service.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/main.ts'),
        'utf8',
      );
      const start = source.indexOf('  async deleteConversation(id: string): Promise<void> {');
      expect(start).toBeGreaterThan(-1);
      // Bound to the next method at column 2.
      const nextMethodRel = source.slice(start + 1).search(/\n[/ ]{2}(private|public|protected|async)\b/);
      const end = nextMethodRel > 0 ? start + 1 + nextMethodRel : start + 800;
      const body = source.slice(start, end);
      expect(body).not.toMatch(/traceService|TraceService|tracePort|cancelDeepCapture|claimDeepCapture|armDeepCapture|flushRingBuffer|buildSmartReport|clearAll|buildDiagnosticReport|writeDiagnosticLogFile|logServerStatusSnapshot|getServerDiagnostics/);
      // It delegates to storage.deleteConversation (no trace interaction).
      expect(body).toMatch(/this\.storage\.deleteConversation\(id\)/);
    });
  });

  // ---------------------------------------------------------------------------
  // Step 3 (cont.): tab-cleanup capture-cancel seam.
  //
  // OpenCodianView wires tab cleanup to cancel capture per backend: OpenCode
  // Codex, and Claude through ChatDiagnosticsCoordinator's backend-specific
  // methods. Task 12 must keep these three cancel seams distinct (no merged
  // cross-backend cancel).
  // ---------------------------------------------------------------------------

  describe('tab-cleanup capture-cancel seam (three distinct backends)', () => {
    it('OpenCodianView wires three separate cancel seams (source contract)', () => {
      expect.hasAssertions();
      // Task 15: createSendPipelineHostDependencies moved to ChatRuntimeComposition; the
      // cancel seams remain in the view's createConversationTabLifecycleRecoveryHost.
      const block = readBoundedOpenCodianViewBlock(
        'private createConversationTabLifecycleRecoveryHost(): ConversationTabLifecycleRecoveryHost {',
        'private createAssistantNoticeCardRendererHost(): AssistantNoticeCardRendererHost {',
      );
      // The tab-cleanup host dependencies wire three distinct cancel callbacks.
      expectSourceOrder(block, [
        'cancelOpenCodeDiagnosticCapture: (tabId) =>',
        'this.chatDiagnosticsCoordinator.cancelOpenCodeDiagnosticCapture(tabId),',
        'cancelCodexDiagnosticCapture: (tabId) => this.chatDiagnosticsCoordinator.cancelCodexDiagnosticCapture(tabId),',
        'cancelClaudeDiagnosticCapture: (tabId) => this.chatDiagnosticsCoordinator.cancelClaudeDiagnosticCapture(tabId),',
      ]);
    });

    it('OpenCodianView wires three distinct claim seams for the send path (source contract)', () => {
      expect.hasAssertions();
      // Task 15: createSendPipelineHostDependencies moved to ChatRuntimeComposition as
      // buildSendPipelineHostDependencies; the claim seams now live there.
      const block = readBoundedChatRuntimeCompositionBlock(
        'private buildSendPipelineHostDependencies(surface: SurfaceRuntimeWiring): SendPipelineHostDependencies {',
        'sendStreamMessage: (conversation: Conversation, content: unknown, options: unknown) => {',
      );
      // Each claim callback must actually invoke its backend-specific claim,
      // not become a generic no-op during coordinator extraction.
      expectSourceOrder(block, [
        'claimOpenCodeDiagnosticRunToken: (tabId: TabId | null, sessionId: string) =>',
        'host.chatDiagnosticsCoordinator.claimOpenCodeDiagnosticRunToken(tabId, sessionId),',
        'claimCodexDiagnosticRunToken: (tabId: TabId | null, threadId?: string) =>',
        'host.chatDiagnosticsCoordinator.claimCodexDiagnosticRunToken(tabId, threadId ?? undefined),',
        'claimClaudeDiagnosticRunToken: (tabId: TabId | null, sessionId?: string) =>',
        'host.chatDiagnosticsCoordinator.claimClaudeDiagnosticRunToken(tabId, sessionId ?? undefined),',
      ]);
    });
  });
});
