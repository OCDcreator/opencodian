/* eslint-disable max-lines, max-lines-per-function -- Chat-diagnostics characterization captures the fail-closed host-adapter boundary and the delete-conversation no-trace-interaction invariant before Task 12 extraction. */
/**
 * Phase 3 Task 10 — ChatDiagnosticsContract characterization.
 *
 * Captures the CURRENT chat-side diagnostics behavior that Task 12
 * (ChatDiagnosticsCoordinator) must preserve:
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
 * The units under test are the host adapters (already extracted) plus the
 * delete-conversation path through StorageService. This suite does NOT move
 * production code.
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
  getStorageStatus: jest.Mock;
  resolveTraceId: jest.Mock;
  listRecentTraces: jest.Mock;
}

function createTraceServiceStub(overrides: Partial<TraceServiceStub> = {}): TraceServiceStub {
  return {
    getCaptureState: jest.fn().mockReturnValue('off'),
    claimDeepCapture: jest.fn().mockReturnValue(undefined),
    cancelDeepCapture: jest.fn().mockReturnValue(true),
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
  // Step 3 (cont.): header/menu route behavior.
  //
  // The adapters build a menu from the trace service state. When the service is
  // absent or disabled, no menu actions invoke trace mutations. This captures
  // the header/menu routing seam.
  // ---------------------------------------------------------------------------

  describe('header/menu routing (Claude)', () => {
    it('does not invoke trace mutations when the service is absent', () => {
      const refreshHeaderChrome = jest.fn();
      const adapter = new ClaudeDiagnosticsHostAdapter({
        getClaudeTraceService: () => undefined,
        getClaudeSessionTraceSettings: () => ({ enabled: true }),
        getCurrentConversation: () => null,
        refreshHeaderChrome,
        createMenu: () => createMenuStub(),
        showNotice: jest.fn(),
      });
      // State with no service → disabled, no refresh.
      expect(adapter.getDiagnosticsState('tab-1')).toBe('disabled');
      // cancel is inert (disabled short-circuits before touching the absent service).
      expect(() => adapter.cancelDiagnosticCapture('tab-1')).not.toThrow();
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
      // The delete path must not reference any trace/diagnostic service.
      expect(body).not.toMatch(/traceService|TraceService|tracePort|cancelDeepCapture|claimDeepCapture|armDeepCapture|flushRingBuffer|buildSmartReport|clearAll/);
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
      expect(body).not.toMatch(/traceService|TraceService|tracePort|cancelDeepCapture|claimDeepCapture|armDeepCapture/);
    });
  });

  // ---------------------------------------------------------------------------
  // Step 3 (cont.): tab-cleanup capture-cancel seam.
  //
  // OpenCodianView (lines 3266-3270) wires tab cleanup to cancel capture per
  // backend: OpenCode → openCodeTraceService.cancelDeepCapture(tabId); Codex →
  // codexDiagnosticsAdapter.cancelDiagnosticCapture(tabId); Claude →
  // claudeDiagnosticsAdapter.cancelDiagnosticCapture(tabId). Task 12 must keep
  // these three cancel seams distinct (no merged cross-backend cancel).
  // ---------------------------------------------------------------------------

  describe('tab-cleanup capture-cancel seam (three distinct backends)', () => {
    it('OpenCodianView wires three separate cancel seams (source contract)', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/chat/OpenCodianView.ts'),
        'utf8',
      );
      // The tab-cleanup host dependencies wire three distinct cancel callbacks.
      expect(source).toContain('cancelOpenCodeDiagnosticCapture:');
      expect(source).toContain('cancelCodexDiagnosticCapture:');
      expect(source).toContain('cancelClaudeDiagnosticCapture:');
      // OpenCode cancel calls the trace service directly.
      expect(source).toMatch(/cancelOpenCodeDiagnosticCapture[\s\S]{0,80}openCodeTraceService\.cancelDeepCapture/);
      // Codex/Claude cancel go through their adapters.
      expect(source).toMatch(/cancelCodexDiagnosticCapture[\s\S]{0,80}codexDiagnosticsAdapter\.cancelDiagnosticCapture/);
      expect(source).toMatch(/cancelClaudeDiagnosticCapture[\s\S]{0,80}claudeDiagnosticsAdapter\.cancelDiagnosticCapture/);
    });

    it('OpenCodianView wires three distinct claim seams for the send path (source contract)', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/chat/OpenCodianView.ts'),
        'utf8',
      );
      expect(source).toContain('claimOpenCodeDiagnosticRunToken:');
      expect(source).toContain('claimCodexDiagnosticRunToken:');
      expect(source).toContain('claimClaudeDiagnosticRunToken:');
      expect(source).toMatch(/claimOpenCodeDiagnosticRunToken[\s\S]{0,120}openCodeTraceService\.claimDeepCapture/);
    });
  });
});
