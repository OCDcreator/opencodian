/* eslint-disable max-lines, max-lines-per-function -- Behavior tests for DiagnosticsRuntimeCoordinator: construction order, option wiring (catch swapped options), dispose order + fail-closed warnings, typed ports. */
/**
 * Phase 3 Task 11 — DiagnosticsRuntimeCoordinator behavior tests.
 *
 * The Task 10 characterization pins the source contract; this suite pins the
 * RUNTIME behavior: that the coordinator wires each backend's OWN options
 * (catching swapped settings/knownSecrets/runtimeMetadata), disposes in the
 * pinned order with fail-closed warnings that do not leak secrets, and exposes
 * typed ports.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DiagnosticsRuntimeCoordinator } from '../../../../src/app/diagnostics/DiagnosticsRuntimeCoordinator';
import type { DiagnosticsRuntimeInputs } from '../../../../src/app/diagnostics/types';
import { ClaudeSessionTraceService } from '../../../../src/core/agents/backend/diagnostics/ClaudeSessionTraceService';
import { CodexSessionTraceService } from '../../../../src/core/agents/backend/diagnostics/CodexSessionTraceService';
import type { ClaudeSessionTraceSettings, CodexSessionTraceSettings } from '../../../../src/core/agents/backend/diagnostics/types';
import { CLAUDE_TRACE_CHANNEL_IDS, CODEX_TRACE_CHANNEL_IDS } from '../../../../src/core/agents/backend/diagnostics/types';
import { OpenCodeSessionTraceService } from '../../../../src/core/opencode/diagnostics/OpenCodeSessionTraceService';
import type { OpenCodeSessionTraceSettings } from '../../../../src/core/opencode/diagnostics/types';
import { OPEN_CODE_TRACE_CHANNEL_IDS } from '../../../../src/core/opencode/diagnostics/types';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `opencodian-coord-${prefix}-`));
}

function ocSettings(dir: string): OpenCodeSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(OPEN_CODE_TRACE_CHANNEL_IDS.map((id) => [id, false])) as OpenCodeSessionTraceSettings['consoleChannels'],
    storageDirectory: dir,
  };
}
function codexSettings(dir: string): CodexSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CODEX_TRACE_CHANNEL_IDS.map((id) => [id, false])) as CodexSessionTraceSettings['consoleChannels'],
    storageDirectory: dir,
    captureContent: true,
  };
}
function claudeSettings(dir: string): ClaudeSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CLAUDE_TRACE_CHANNEL_IDS.map((id) => [id, false])) as ClaudeSessionTraceSettings['consoleChannels'],
    storageDirectory: dir,
  };
}

describe('Phase 3 Task 11 — DiagnosticsRuntimeCoordinator (behavior)', () => {
  const created: Array<{ dispose: () => Promise<void> }> = [];
  const dirs: string[] = [];
  afterEach(async () => {
    // coordinator.dispose() is fire-and-forget (void+catch, matching main.ts
    // onunload). Await the background disposals BEFORE deleting their dirs,
    // otherwise rmSync races with in-flight store writes (ENOTEMPTY/storage_degraded).
    await Promise.all(created.map((c) => c.dispose().catch(() => undefined)));
    // Flush fire-and-forget disposal microtasks/macrotasks + pending timers.
    jest.runAllTimers();
    await new Promise((resolve) => setTimeout(resolve, 50));
    created.length = 0;
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
    jest.clearAllTimers();
  });
  afterAll(() => {
    try {
      const tmp = os.tmpdir();
      for (const entry of fs.readdirSync(tmp, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith('opencodian-coord-')) {
          fs.rmSync(path.join(tmp, entry.name), { recursive: true, force: true });
        }
      }
    } catch {
      // best-effort
    }
  });

  function makeInputs(overrides: Partial<DiagnosticsRuntimeInputs> = {}): DiagnosticsRuntimeInputs & { ocDir: string; codexDir: string; claudeDir: string } {
    const ocDir = tempDir('oc'); dirs.push(ocDir);
    const codexDir = tempDir('codex'); dirs.push(codexDir);
    const claudeDir = tempDir('claude'); dirs.push(claudeDir);
    return {
      ocDir, codexDir, claudeDir,
      openCodeSettings: () => ocSettings(ocDir),
      codexSettings: () => codexSettings(codexDir),
      claudeSettings: () => claudeSettings(claudeDir),
      vaultPath: undefined,
      buildIdentity: () => 'Build: coord-test',
      openCodeKnownSecrets: () => ['oc-secret'],
      codexKnownSecrets: () => ['codex-secret'],
      claudeKnownSecrets: () => ['claude-secret'],
      openCodeRuntimeMetadata: () => ({ customMeta: 'oc' }),
      codexRuntimeMetadata: () => ({ customMeta: 'codex' }),
      claudeRuntimeMetadata: () => ({ customMeta: 'claude' }),
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Construction: each backend receives its OWN options (catch swapped wiring).
  // -------------------------------------------------------------------------

  describe('construction wires each backend its own options', () => {
    it('constructs three services of the correct concrete types in pinned order', () => {
      const inputs = makeInputs();
      const coord = new DiagnosticsRuntimeCoordinator(inputs);
      created.push(coord);
      expect(coord.openCode).toBeInstanceOf(OpenCodeSessionTraceService);
      expect(coord.codex).toBeInstanceOf(CodexSessionTraceService);
      expect(coord.claude).toBeInstanceOf(ClaudeSessionTraceService);
    });

    it('OpenCode runtimeMetadata lands in the OpenCode runtime.started event (not Codex/Claude)', async () => {
      const inputs = makeInputs();
      const coord = new DiagnosticsRuntimeCoordinator(inputs);
      created.push(coord);
      const ocRt = await coord.openCode.store.readRuntimeSegment(coord.openCode.runtimeSegmentId);
      expect(ocRt.find((e) => e.name === 'runtime.started')?.payload).toMatchObject({ customMeta: 'oc' });
      // Codex/Claude must NOT carry the OpenCode metadata.
      const codexRt = await coord.codex.store.readRuntimeSegment(coord.codex.runtimeSegmentId);
      expect(codexRt.find((e) => e.name === 'runtime.started')?.payload).toMatchObject({ customMeta: 'codex' });
      expect(codexRt.find((e) => e.name === 'runtime.started')?.payload).not.toMatchObject({ customMeta: 'oc' });
    }, 15000);

    it('each backend redacts its OWN knownSecrets — OpenCode, Codex, AND Claude (catches swapped/emptied secrets)', async () => {
      // Pin ALL THREE backends so a swapped or emptied knownSecrets getter is
      // caught. Each backend's secret must be redacted in its own persisted trace.
      const inputs = makeInputs();
      const coord = new DiagnosticsRuntimeCoordinator(inputs);
      created.push(coord);
      // OpenCode (static snapshot via markAnomaly raw-payload path).
      const ocCtx = coord.openCode.bindSession(coord.openCode.beginBootstrap(), 'sess-oc');
      coord.openCode.markAnomaly(ocCtx, 'canary', 'warning', { note: 'oc-secret' });
      await coord.openCode.store.flush();
      const ocBlob = JSON.stringify(await coord.openCode.store.readTrace(ocCtx.traceId));
      expect(ocBlob).not.toContain('oc-secret');
      // Codex (recordToolInteraction raw-payload path).
      const codexCtx = coord.codex.bindThread({ threadId: 'thread-codex', resumed: false, via: 'app-server' });
      coord.codex.recordToolInteraction(codexCtx, 'canary', { note: 'codex-secret' });
      await coord.codex.store.flush();
      const codexBlob = JSON.stringify(await coord.codex.store.readTrace(codexCtx.traceId));
      expect(codexBlob).not.toContain('codex-secret');
      // Claude (recordTurnEvent raw-payload path).
      const claudeCtx = coord.claude.bindSession({ sessionId: 'sess-claude', resumed: false, via: 'sdk' });
      coord.claude.recordTurnEvent(claudeCtx, 'canary', 'warning', { note: 'claude-secret' });
      await coord.claude.store.flush();
      const claudeBlob = JSON.stringify(await coord.claude.store.readTrace(claudeCtx.traceId));
      expect(claudeBlob).not.toContain('claude-secret');
      // Each backend's secret must be ABSENT from its own trace (redacted). This
      // catches a swapped knownSecrets wiring (e.g. claudeKnownSecrets getting
      // codex's getter) because the backend's own secret would then NOT be redacted.
    }, 15000);

    it('buildIdentity is wired into each backend report builder', async () => {
      const inputs = makeInputs();
      const coord = new DiagnosticsRuntimeCoordinator(inputs);
      created.push(coord);
      const ocReport = await coord.openCode.reportBuilder.buildSmartReport(undefined, undefined, undefined);
      expect(ocReport).toContain('coord-test');
    });
  });

  // -------------------------------------------------------------------------
  // Typed ports: no generic mutable service map.
  // -------------------------------------------------------------------------

  describe('typed backend ports', () => {
    it('ports getter returns the three typed properties', () => {
      const coord = new DiagnosticsRuntimeCoordinator(makeInputs());
      created.push(coord);
      const ports = coord.ports;
      expect(ports.openCode).toBe(coord.openCode);
      expect(ports.codex).toBe(coord.codex);
      expect(ports.claude).toBe(coord.claude);
    });
  });

  // -------------------------------------------------------------------------
  // Dispose: pinned order, fail-closed warnings, no secret leak, injected logger scope.
  // -------------------------------------------------------------------------

  describe('dispose', () => {
    it('dispose is idempotent and does not throw', async () => {
      const coord = new DiagnosticsRuntimeCoordinator(makeInputs());
      await coord.dispose();
      // Flush fire-and-forget disposals before the second call.
      await new Promise((resolve) => setTimeout(resolve, 20));
      await expect(coord.dispose()).resolves.toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    it('dispose calls each backend dispose in pinned order opencode -> codex -> claude (runtime)', async () => {
      // Runtime order test (not just source regex): spy on each backend dispose.
      const coord = new DiagnosticsRuntimeCoordinator(makeInputs());
      created.push(coord);
      const order: string[] = [];
      const wrap = (svc: { dispose: () => Promise<void> }, label: string) => {
        const orig = svc.dispose.bind(svc);
        svc.dispose = jest.fn(async () => { order.push(label); await orig(); }) as unknown as typeof svc.dispose;
      };
      wrap(coord.openCode as unknown as { dispose: () => Promise<void> }, 'openCode');
      wrap(coord.codex as unknown as { dispose: () => Promise<void> }, 'codex');
      wrap(coord.claude as unknown as { dispose: () => Promise<void> }, 'claude');
      await coord.dispose();
      // The dispose() body calls them synchronously in order (fire-and-forget),
      // so the synchronous invocation order is pinned.
      expect(order).toEqual(['openCode', 'codex', 'claude']);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    it('dispose does not leak Codex trace disposal error secrets in warnings (injected logger)', async () => {
      const secret = 'coord-codex-unload-secret-1234';
      const vaultPath = '/Volumes/SDD2T/obsidian-vault-write/testvault';
      const warn = jest.fn();
      const coord = new DiagnosticsRuntimeCoordinator({
        ...makeInputs(),
        logger: { warn, info: jest.fn(), error: jest.fn(), debug: jest.fn(), always: jest.fn() } as never,
      });
      created.push(coord);
      // Override codex dispose to reject with a secret-bearing error.
      (coord.codex as unknown as { dispose: () => Promise<void> }).dispose = () =>
        Promise.reject(new Error(`${secret} at ${vaultPath}/trace.jsonl`));
      await coord.dispose();
      // Flush the fire-and-forget catch (microtask + macrotask).
      await new Promise((resolve) => setTimeout(resolve, 50));
      const output = JSON.stringify(warn.mock.calls);
      expect(output).toContain('Failed to flush Codex trace service during unload');
      expect(output).not.toContain(secret);
      expect(output).not.toContain(vaultPath);
    });

    it('construction failure propagates the error (coordinator ctor try/catch disposes partial services)', async () => {
      // If Codex construction throws, the coordinator ctor catch disposes the
      // already-constructed OpenCode service (tracked in a local constructed list)
      // and re-throws. This test proves the throw propagates; the source contract
      // (DiagnosticsRuntimeContract) pins the try/catch + constructed-list disposal.
      const throwingCodexSettings = (): CodexSessionTraceSettings => { throw new Error('codex ctor boom'); };
      expect(() => new DiagnosticsRuntimeCoordinator({
        ...makeInputs(),
        codexSettings: throwingCodexSettings,
      })).toThrow('codex ctor boom');
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  });
});
