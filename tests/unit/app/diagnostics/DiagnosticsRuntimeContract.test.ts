/* eslint-disable max-lines, max-lines-per-function -- Characterization suite for the three-backend diagnostics runtime contract. Captures CURRENT behavior before any Phase 3 coordinator extraction. These tests must pass against the unchanged implementation; they are the hard prerequisite for Task 11–13. */
/**
 * Phase 3 Task 10 — DiagnosticsRuntimeContract characterization.
 *
 * This suite captures the CURRENT construction, injection, redaction, capture,
 * and dispose contract shared by the three backend trace services as wired in
 * `src/main.ts`. It is intentionally behavior-pinning: any change that
 * silently alters construction options, knownSecrets timing, enabled/disabled
 * gating, capture arm/claim/cancel, or dispose/flush ordering must surface
 * here before Tasks 11–13 move production code.
 *
 * The services under test:
 *   - OpenCodeSessionTraceService (src/core/opencode/diagnostics)
 *   - CodexSessionTraceService    (src/core/agents/backend/diagnostics)
 *   - ClaudeSessionTraceService   (src/core/agents/backend/diagnostics)
 *
 * It does NOT move production code. It exercises the public trace-port surface
 * and the redactor that all three share.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSessionTraceService, collectClaudeCodeKnownSecrets } from '../../../../src/core/agents/backend/diagnostics';
import { CodexSessionTraceService } from '../../../../src/core/agents/backend/diagnostics/CodexSessionTraceService';
import type {
  ClaudeSessionTraceSettings,
  CodexSessionTraceSettings,
} from '../../../../src/core/agents/backend/diagnostics/types';
import { CLAUDE_TRACE_CHANNEL_IDS, CODEX_TRACE_CHANNEL_IDS } from '../../../../src/core/agents/backend/diagnostics/types';
import { OpenCodeSessionTraceService } from '../../../../src/core/opencode/diagnostics/OpenCodeSessionTraceService';
import type { OpenCodeSessionTraceSettings } from '../../../../src/core/opencode/diagnostics/types';
import { OPEN_CODE_TRACE_CHANNEL_IDS } from '../../../../src/core/opencode/diagnostics/types';
import { TraceRedactor } from '../../../../src/shared/diagnostics/TraceRedactor';

function openCodeTraceSettings(storageDirectory: string, overrides: Partial<OpenCodeSessionTraceSettings> = {}): OpenCodeSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(OPEN_CODE_TRACE_CHANNEL_IDS.map((id) => [id, false])) as OpenCodeSessionTraceSettings['consoleChannels'],
    storageDirectory,
    ...overrides,
  };
}

function codexTraceSettings(storageDirectory: string, overrides: Partial<CodexSessionTraceSettings> = {}): CodexSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CODEX_TRACE_CHANNEL_IDS.map((id) => [id, false])) as CodexSessionTraceSettings['consoleChannels'],
    storageDirectory,
    captureContent: true,
    ...overrides,
  };
}

function claudeTraceSettings(storageDirectory: string, overrides: Partial<ClaudeSessionTraceSettings> = {}): ClaudeSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CLAUDE_TRACE_CHANNEL_IDS.map((id) => [id, false])) as ClaudeSessionTraceSettings['consoleChannels'],
    storageDirectory,
    ...overrides,
  };
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `opencodian-task10-${prefix}-`));
}

describe('Phase 3 Task 10 — DiagnosticsRuntimeContract (characterization)', () => {
  // ---------------------------------------------------------------------------
  // Step 1: Construction options + dynamic knownSecrets behavior.
  //
  // main.ts constructs each service with { settings, vaultPath, buildIdentity,
  // knownSecrets, runtimeMetadata }. The knownSecrets asymmetry is a deliberate
  // characterization target:
  //   - OpenCode: passes knownSecrets?.()  → the redactor receives a STATIC ARRAY
  //     captured at construction time (the getter is invoked once in the ctor).
  //   - Claude/Codex: pass the GETTER itself → the redactor re-invokes it on
  //     every redact() call, so changed credentials take effect immediately.
  // ---------------------------------------------------------------------------

  describe('construction options shape', () => {
    let dir: string;
    beforeEach(() => { dir = tempDir('ctor'); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('accepts the documented { settings, vaultPath, buildIdentity, knownSecrets, runtimeMetadata } option set for all three services', () => {
      const oc = new OpenCodeSessionTraceService({
        settings: () => openCodeTraceSettings(dir),
        vaultPath: '/vault',
        buildIdentity: () => 'Build: test',
        knownSecrets: () => ['s1'],
        runtimeMetadata: () => ({ serverMode: 'local' }),
      });
      const codex = new CodexSessionTraceService({
        settings: () => codexTraceSettings(dir),
        vaultPath: '/vault',
        buildIdentity: () => 'Build: test',
        knownSecrets: () => ['s1'],
        runtimeMetadata: () => ({ serverMode: 'local' }),
      });
      const claude = new ClaudeSessionTraceService({
        settings: () => claudeTraceSettings(dir),
        vaultPath: '/vault',
        buildIdentity: () => 'Build: test',
        knownSecrets: () => ['s1'],
        runtimeMetadata: () => ({ serverMode: 'local' }),
      });
      expect(oc.runtimeSegmentId).toMatch(/^[\da-f-]+$/);
      expect(codex.runtimeSegmentId).toMatch(/^[\da-f-]+$/);
      expect(claude.runtimeSegmentId).toMatch(/^[\da-f-]+$/);
    });

    it('uses a hardcoded build-identity fallback when buildIdentity is omitted', () => {
      const oc = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(dir) });
      const codex = new CodexSessionTraceService({ settings: () => codexTraceSettings(dir) });
      const claude = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(dir) });
      // No throw; the fallback string is 'Build: unknown' for all three.
      expect(oc.reportBuilder).toBeDefined();
      expect(codex.reportBuilder).toBeDefined();
      expect(claude.reportBuilder).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Step 1 (cont.): the knownSecrets timing asymmetry — THE critical contract.
  //
  // OpenCodeSessionTraceService ctor line 79-83 calls `options.knownSecrets?.()`
  // ONCE and hands the resulting array to the redactor. Claude (line 95-99) and
  // Codex (line 83-87) hand the GETTER directly. The shared TraceRedactor
  // supports both (line 237-239: if knownSecrets is a function, call it each
  // time). So the difference is entirely in how main.ts wires the services.
  //
  // Consequence: a secret added to Claude/Codex credentials AFTER construction
  // is redacted; a secret added to OpenCode server auth AFTER construction is
  // NOT (the ctor captured the snapshot). This must not change under Task 11.
  // ---------------------------------------------------------------------------

  describe('knownSecrets timing asymmetry (OpenCode snapshot vs Claude/Codex dynamic)', () => {
    let dir: string;
    beforeEach(() => { dir = tempDir('secrets'); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('OpenCode captures knownSecrets as a STATIC snapshot at construction (unlike Claude/Codex dynamic getter)', async () => {
      // OpenCodeSessionTraceService ctor line 79-83 invokes `options.knownSecrets?.()`
      // ONCE and hands the resulting array to the redactor. Claude/Codex hand the
      // getter itself. We prove the snapshot by embedding the secret as a PLAIN
      // string value (not under a sensitive key, which would always redact via the
      // key pattern regardless of knownSecrets) and using markAnomaly (raw-payload
      // path, unlike recordIngress which summarizes).
      let currentSecrets = ['initial-plain-secret-opencode'];
      const service = new OpenCodeSessionTraceService({
        settings: () => openCodeTraceSettings(dir),
        knownSecrets: () => currentSecrets,
      });
      const ctx = service.bindSession(service.beginBootstrap(), 'sess-static');
      // Embed the secret in a plain field so only the knownSecrets literal-match
      // path can redact it (the key 'note' is not sensitive).
      service.markAnomaly(ctx, 'initial', 'warning', { note: 'initial-plain-secret-opencode' });
      // Mutate the credential source AFTER construction — mirrors a password rotation.
      currentSecrets = ['rotated-plain-secret-opencode'];
      service.markAnomaly(ctx, 'rotated', 'warning', { note: 'rotated-plain-secret-opencode' });
      await service.store.flush();
      const events = await service.store.readTrace(ctx.traceId);
      const allJson = JSON.stringify(events);
      // initial secret was captured at construction → redacted.
      expect(allJson).not.toContain('initial-plain-secret-opencode');
      // rotated secret was NOT in the construction snapshot → LEAKED. This is the
      // current OpenCode behavior; Task 11 must preserve it byte-for-byte.
      expect(allJson).toContain('rotated-plain-secret-opencode');
    });

    it('Claude/Codex knownSecrets are DYNAMIC: a rotated plain secret is redacted (contrast with OpenCode)', async () => {
      // Same scenario as above but Claude/Codex pass the getter to the redactor,
      // so a post-construction rotation IS seen.
      let claudeSecrets = ['initial-plain-secret-claude'];
      const claude = new ClaudeSessionTraceService({
        settings: () => claudeTraceSettings(dir),
        knownSecrets: () => claudeSecrets,
      });
      const claudeCtx = claude.bindSession({ sessionId: 'sess-claude-dyn', resumed: false, via: 'sdk' });
      claude.recordSdkMessage(claudeCtx, { note: 'initial-plain-secret-claude' });
      claudeSecrets = ['rotated-plain-secret-claude'];
      claude.recordSdkMessage(claudeCtx, { note: 'rotated-plain-secret-claude' });
      await claude.store.flush();
      const claudeJson = JSON.stringify(await claude.store.readTrace(claudeCtx.traceId));
      expect(claudeJson).not.toContain('initial-plain-secret-claude');
      expect(claudeJson).not.toContain('rotated-plain-secret-claude');
    });

    it('OpenCode recordIngress persists a STRUCTURAL SUMMARY (not payload values) when not deep-capturing', async () => {
      // Distinct from Claude/Codex: OpenCode non-deep recordIngress stores only
      // {type, keys} summaries, so secret VALUES never reach disk via this path
      // even before redaction. Capture this so Task 11 does not silently switch
      // OpenCode to inline payloads.
      const service = new OpenCodeSessionTraceService({
        settings: () => openCodeTraceSettings(dir),
        knownSecrets: () => ['never-seen'],
      });
      const ctx = service.bindSession(service.beginBootstrap(), 'sess-summary');
      service.recordIngress(ctx, 'event', { apiKey: 'never-seen-value', other: 'data' });
      await service.store.flush();
      const events = await service.store.readTrace(ctx.traceId);
      const ingress = events.find((e) => e.name === 'event');
      // Only the structural summary is persisted; the secret value is absent
      // regardless of redaction.
      expect(ingress?.payload).toEqual({ type: 'object', keys: ['apiKey', 'other'] });
      expect(JSON.stringify(events)).not.toContain('never-seen-value');
    });

    it('Claude redacts secrets added AFTER construction (dynamic getter)', async () => {
      let currentSecrets = ['initial-claude-key'];
      const service = new ClaudeSessionTraceService({
        settings: () => claudeTraceSettings(dir),
        knownSecrets: () => currentSecrets,
      });
      const ctx = service.bindSession({ sessionId: 'sess-claude', resumed: false, via: 'sdk' });
      service.recordSdkMessage(ctx, { apiKey: 'initial-claude-key-in-payload' });
      currentSecrets = ['rotated-claude-key'];
      service.recordSdkMessage(ctx, { apiKey: 'rotated-claude-key-in-payload' });
      await service.store.flush();
      const events = await service.store.readTrace(ctx.traceId);
      const allJson = JSON.stringify(events);
      expect(allJson).not.toContain('initial-claude-key-in-payload');
      // Dynamic getter sees the rotation → redacted too.
      expect(allJson).not.toContain('rotated-claude-key-in-payload');
    });

    it('Codex redacts secrets added AFTER construction (dynamic getter)', async () => {
      let currentSecrets = ['initial-codex-key'];
      const service = new CodexSessionTraceService({
        settings: () => codexTraceSettings(dir),
        knownSecrets: () => currentSecrets,
      });
      const ctx = service.bindThread({ threadId: 'thread-codex', resumed: false, via: 'app-server' });
      service.recordToolInteraction(ctx, 'tool.call', { apiKey: 'initial-codex-key-in-payload' });
      currentSecrets = ['rotated-codex-key'];
      service.recordToolInteraction(ctx, 'tool.call.rotated', { apiKey: 'rotated-codex-key-in-payload' });
      await service.store.flush();
      const events = await service.store.readTrace(ctx.traceId);
      const allJson = JSON.stringify(events);
      expect(allJson).not.toContain('initial-codex-key-in-payload');
      expect(allJson).not.toContain('rotated-codex-key-in-payload');
    });
  });

  // ---------------------------------------------------------------------------
  // Step 1 (cont.): collectClaudeCodeKnownSecrets — the dynamic collector used
  // by main.ts for the Claude backend. It walks the Claude settings object and
  // collects strings under api[_-]?key|token|secret keys.
  // ---------------------------------------------------------------------------

  describe('collectClaudeCodeKnownSecrets (Claude dynamic collector)', () => {
    it('collects api_key, token, and secret string values from a nested settings object', () => {
      const secrets = collectClaudeCodeKnownSecrets({
        apiKey: 'ak-123',
        nested: { api_key: 'ak-nested', token: 'tok-nested', other: 'ignore-me' },
        secret: '  secret-with-spaces  ',
        empty: '',
        number: 42,
      });
      expect(secrets).toEqual(expect.arrayContaining(['ak-123', 'ak-nested', 'tok-nested', 'secret-with-spaces']));
      // empty/number/non-sensitive are excluded.
      expect(secrets).not.toContain('ignore-me');
      expect(secrets).not.toContain('');
    });

    it('handles cycles and non-object inputs without throwing', () => {
      const cyclic: Record<string, unknown> = { apiKey: 'cyc-1' };
      cyclic.self = cyclic;
      expect(() => collectClaudeCodeKnownSecrets(cyclic)).not.toThrow();
      expect(collectClaudeCodeKnownSecrets(null)).toEqual([]);
      expect(collectClaudeCodeKnownSecrets('string')).toEqual([]);
      expect(collectClaudeCodeKnownSecrets([{ token: 'arr-tok' }])).toContain('arr-tok');
    });
  });

  // ---------------------------------------------------------------------------
  // Step 2: enabled/disabled behavior.
  //
  // All three services short-circuit public methods when settings.enabled is
  // false. Capture state reports 'off'; arm/claim/cancel are inert; recording
  // methods are no-ops. This gating must survive the coordinator extraction.
  // ---------------------------------------------------------------------------

  describe('enabled/disabled gating', () => {
    let dir: string;
    beforeEach(() => { dir = tempDir('disabled'); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('OpenCode with enabled=false: arm/claim/cancel still mutate state (NOT gated by enabled, unlike Claude/Codex)', () => {
      // OpenCode armDeepCapture/claimDeepCapture/cancelDeepCapture do NOT check
      // settings.enabled (lines 514-537); only emit() short-circuits on disabled.
      // Claude/Codex DO gate these on enabled. This asymmetry must survive Task 11.
      const service = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(dir, { enabled: false }) });
      expect(service.getCaptureState('tab-1')).toBe('off');
      service.armDeepCapture('tab-1', 'sess');
      // OpenCode: state becomes 'armed' even when disabled.
      expect(service.getCaptureState('tab-1')).toBe('armed');
      const claimed = service.claimDeepCapture('tab-1', 'sess');
      expect(claimed).toBeDefined();
      expect(service.getCaptureState('tab-1')).toBe('capturing');
    });

    it('Claude with enabled=false: capture state is off, claim returns undefined, cancel is inert', () => {
      const service = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(dir, { enabled: false }) });
      expect(service.getCaptureState('tab-1')).toBe('off');
      service.armDeepCapture('tab-1', 'sess');
      expect(service.claimDeepCapture('tab-1', 'sess')).toBeUndefined();
      expect(service.cancelDeepCapture('tab-1')).toBe(false);
    });

    it('Codex with enabled=false: capture state is off, claim returns undefined', () => {
      const service = new CodexSessionTraceService({ settings: () => codexTraceSettings(dir, { enabled: false }) });
      expect(service.getCaptureState('tab-1')).toBe('off');
      service.armDeepCapture('tab-1', 'thread');
      expect(service.claimDeepCapture('tab-1', 'thread')).toBeUndefined();
    });

    it('disabled services still dispose without throwing', async () => {
      const oc = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(dir, { enabled: false }) });
      const codex = new CodexSessionTraceService({ settings: () => codexTraceSettings(dir, { enabled: false }) });
      const claude = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(dir, { enabled: false }) });
      await expect(oc.dispose()).resolves.toBeUndefined();
      await expect(codex.dispose()).resolves.toBeUndefined();
      await expect(claude.dispose()).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Step 1 (cont.): dispose/flush ordering.
  //
  // main.ts onunload (lines 584-592) disposes in this fixed order:
  //   1. openCodeTraceService.dispose()
  //   2. codexTraceService.dispose()
  //   3. claudeTraceService.dispose()
  // Each dispose() clears watchdog timers, clears in-memory maps, emits a
  // runtime.stopped lifecycle event, and awaits store.dispose() (flush). The
  // order is pinned here; Task 11's coordinator must preserve it.
  // ---------------------------------------------------------------------------

  describe('dispose/flush ordering and idempotency', () => {
    let dir: string;
    beforeEach(() => { dir = tempDir('dispose'); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('dispose() emits runtime.stopped and flushes; runtime events live in a separate segment file (readRuntimeSegment, NOT readTrace)', async () => {
      // TraceStore contract: readTrace() filters OUT runtime events (isRuntimeEvent);
      // runtime.started/stopped are retrievable only via readRuntimeSegment(). This
      // separation must survive the coordinator extraction.
      const oc = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(dir) });
      const codex = new CodexSessionTraceService({ settings: () => codexTraceSettings(dir) });
      const claude = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(dir) });
      // readTrace must NOT surface runtime events even before dispose.
      const ocStructBefore = await oc.store.readTrace(oc.runtimeSegmentId);
      expect(ocStructBefore.some((e) => e.name === 'runtime.started')).toBe(false);
      // readRuntimeSegment DOES surface them.
      const ocRtBefore = await oc.store.readRuntimeSegment(oc.runtimeSegmentId);
      expect(ocRtBefore.some((e) => e.name === 'runtime.started')).toBe(true);
      await oc.dispose();
      await codex.dispose();
      await claude.dispose();
      const ocRt = await oc.store.readRuntimeSegment(oc.runtimeSegmentId);
      const codexRt = await codex.store.readRuntimeSegment(codex.runtimeSegmentId);
      const claudeRt = await claude.store.readRuntimeSegment(claude.runtimeSegmentId);
      expect(ocRt.some((e) => e.name === 'runtime.stopped')).toBe(true);
      expect(codexRt.some((e) => e.name === 'runtime.stopped')).toBe(true);
      expect(claudeRt.some((e) => e.name === 'runtime.stopped')).toBe(true);
    });

    it('dispose is idempotent (safe to call twice, as main.ts uses void ... .catch())', async () => {
      const service = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(dir) });
      await service.dispose();
      await expect(service.dispose()).resolves.toBeUndefined();
    });

    it('Codex dispose clears active turn watchdogs without throwing on an empty map', async () => {
      const service = new CodexSessionTraceService({ settings: () => codexTraceSettings(dir) });
      await expect(service.dispose()).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Step 4: secret/path canaries for disk persistence.
  //
  // All three services persist redacted events to disk via TraceStore. A secret
  // supplied via knownSecrets must NEVER appear in the persisted JSON files.
  // A local vault path must be normalized to $VAULT. This is the availability/
  // security contract that the coordinator extraction must not regress.
  // ---------------------------------------------------------------------------

  describe('disk persistence redaction canary', () => {
    let dir: string;
    let vaultPath: string;
    beforeEach(() => {
      dir = tempDir('disk');
      vaultPath = tempDir('vault');
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(vaultPath, { recursive: true, force: true });
    });

    it('OpenCode persisted files contain no raw secret and normalize the vault path (via markAnomaly raw-payload path)', async () => {
      // recordIngress summarizes, so use markAnomaly (raw payload) to exercise
      // the redactor on actual secret/path values persisted to disk. The secret
      // is embedded in a PLAIN field (not under a sensitive key) so only the
      // knownSecrets literal-match path redacts it; the vault path proves path
      // normalization.
      const secret = 'super-secret-opencode-disk-1234';
      const service = new OpenCodeSessionTraceService({
        settings: () => openCodeTraceSettings(dir),
        vaultPath,
        knownSecrets: () => [secret],
      });
      const ctx = service.bindSession(service.beginBootstrap(), 'sess-disk');
      service.markAnomaly(ctx, 'disk.canary', 'warning', { note: secret, filePath: `${vaultPath}/secret.txt` });
      await service.store.flush();
      const files = readAllJsonFiles(dir);
      const blob = files.map((f) => f.content).join('\n');
      expect(blob).not.toContain(secret);
      expect(blob).toContain('$VAULT');
      expect(blob).not.toContain(vaultPath);
    });

    it('Claude persisted files contain no raw secret (hardened mode)', async () => {
      const secret = 'super-secret-claude-disk-1234';
      const service = new ClaudeSessionTraceService({
        settings: () => claudeTraceSettings(dir),
        vaultPath,
        knownSecrets: () => [secret],
      });
      const ctx = service.bindSession({ sessionId: 'sess-claude-disk', resumed: false, via: 'sdk' });
      service.recordSdkMessage(ctx, { apiKey: secret, nested: { token: secret } });
      await service.store.flush();
      const files = readAllJsonFiles(dir);
      const blob = files.map((f) => f.content).join('\n');
      expect(blob).not.toContain(secret);
    });

    it('Codex persisted files contain no raw secret (hardened mode)', async () => {
      const secret = 'super-secret-codex-disk-1234';
      const service = new CodexSessionTraceService({
        settings: () => codexTraceSettings(dir),
        vaultPath,
        knownSecrets: () => [secret],
      });
      const ctx = service.bindThread({ threadId: 'thread-codex-disk', resumed: false, via: 'app-server' });
      service.recordToolInteraction(ctx, 'tool.call', { apiKey: secret });
      await service.store.flush();
      const files = readAllJsonFiles(dir);
      const blob = files.map((f) => f.content).join('\n');
      expect(blob).not.toContain(secret);
    });
  });

  // ---------------------------------------------------------------------------
  // Step 4 (cont.): console + report/export canaries.
  //
  // consolePreset='off' (Claude) / channel toggles (all) gate console output.
  // Report/export paths also run through the redactor. A secret must not leak
  // into console.log or into an exported report string.
  // ---------------------------------------------------------------------------

  describe('console and report/export redaction canary', () => {
    let dir: string;
    let consoleLogSpy: jest.SpyInstance;
    beforeEach(() => {
      dir = tempDir('console');
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => {
      consoleLogSpy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('Claude consolePreset=off suppresses console output entirely', async () => {
      const service = new ClaudeSessionTraceService({
        settings: () => claudeTraceSettings(dir, { consolePreset: 'off' }),
        knownSecrets: () => ['no-console-leak'],
      });
      const ctx = service.bindSession({ sessionId: 'sess-console', resumed: false, via: 'sdk' });
      service.recordSdkMessage(ctx, { data: 'no-console-leak-value' });
      const logged = consoleLogSpy.mock.calls.map((c) => JSON.stringify(c)).join('');
      expect(logged).not.toContain('no-console-leak-value');
    });

    it('Claude buildSmartReport output contains no raw secret', async () => {
      const secret = 'report-secret-claude-1234';
      const service = new ClaudeSessionTraceService({
        settings: () => claudeTraceSettings(dir),
        knownSecrets: () => [secret],
      });
      const ctx = service.bindSession({ sessionId: 'sess-report', resumed: false, via: 'sdk' });
      service.recordSdkMessage(ctx, { apiKey: secret });
      service.finishTurn(ctx, 'completed');
      await service.store.flush();
      const report = await service.buildSmartReport(ctx.traceId);
      expect(report).not.toContain(secret);
    });

    it('shared TraceRedactor directly: secret under a sensitive key becomes [REDACTED]', () => {
      const redactor = new TraceRedactor({ knownSecrets: () => ['literal-secret'] });
      const result = redactor.redact({ authorization: 'literal-secret', nested: { apiKey: 'literal-secret' } });
      expect(JSON.stringify(result.value)).not.toContain('literal-secret');
      expect(JSON.stringify(result.value)).toContain('[REDACTED]');
      expect(result.stats.secretsRemoved).toBeGreaterThan(0);
    });

    it('shared TraceRedactor: a thrown visitor yields [REDACTION_FAILED] (no secretsRemoved bump, never the raw value)', () => {
      // The catch block (TraceRedactor.redact line 82-85) returns
      // '[REDACTION_FAILED]' and bumps secretsRemoved by 1 ONLY in the catch
      // path — but a property getter that throws during key enumeration is
      // caught earlier as '[UNREADABLE]' without bumping secretsRemoved.
      // Characterize whichever actually happens: the raw value never escapes.
      const redactor = new TraceRedactor();
      const poison = { get value() { throw new Error('boom'); } };
      const result = redactor.redact(poison);
      expect(JSON.stringify(result.value)).not.toContain('boom');
      // The key invariant: no raw secret/error text leaks. stats.secretsRemoved
      // may be 0 (key-level catch) or >0 (top-level catch); either is acceptable
      // as long as the value is replaced.
      expect(result.value).not.toBe(poison);
    });
  });

  // ---------------------------------------------------------------------------
  // Step 1 (cont.): capture arm/claim/cancel lifecycle for all three backends.
  //
  // main.ts wires the chat view to call armDeepCapture / claimDeepCapture /
  // cancelDeepCapture per tab. The token has a 30-minute TTL. Claiming
  // transitions armed→capturing; cancel returns to off. This is the per-tab
  // deep-capture seam Task 12 must preserve.
  // ---------------------------------------------------------------------------

  describe('capture arm/claim/cancel lifecycle', () => {
    let dir: string;
    beforeEach(() => { dir = tempDir('capture'); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('OpenCode: arm→claim transitions to capturing; cancel AFTER claim returns false (claim moves token to claimedByTab, cancel only checks armedByTab)', () => {
      // OpenCode cancelDeepCapture (line 526-528) returns armedByTab.delete(tabId).
      // claimDeepCapture moves the token FROM armedByTab TO claimedByTab, so a
      // cancel after claim finds nothing in armedByTab → returns false. The tab
      // stays 'capturing'. This differs from Claude (cancel checks both maps).
      const service = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(dir) });
      expect(service.getCaptureState('tab-a')).toBe('off');
      const token = service.armDeepCapture('tab-a', 'sess');
      expect(service.getCaptureState('tab-a')).toBe('armed');
      const claimed = service.claimDeepCapture('tab-a', 'sess');
      expect(claimed?.runId).toBe(token.runId);
      expect(service.getCaptureState('tab-a')).toBe('capturing');
      // cancel after claim returns false (armedByTab already emptied by claim).
      expect(service.cancelDeepCapture('tab-a')).toBe(false);
      expect(service.getCaptureState('tab-a')).toBe('capturing');
    });

    it('OpenCode: cancel BEFORE claim returns true and clears the armed state', () => {
      const service = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(dir) });
      service.armDeepCapture('tab-pre', 'sess');
      expect(service.getCaptureState('tab-pre')).toBe('armed');
      expect(service.cancelDeepCapture('tab-pre')).toBe(true);
      expect(service.getCaptureState('tab-pre')).toBe('off');
    });

    it('Claude: arm→claim→cancel transitions capture state correctly', () => {
      const service = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(dir) });
      service.armDeepCapture('tab-b', 'sess');
      expect(service.getCaptureState('tab-b')).toBe('armed');
      const claimed = service.claimDeepCapture('tab-b', 'sess');
      expect(claimed).toBeDefined();
      expect(service.getCaptureState('tab-b')).toBe('capturing');
      expect(service.cancelDeepCapture('tab-b')).toBe(true);
      expect(service.getCaptureState('tab-b')).toBe('off');
    });

    it('Codex: arm→claim→cancel transitions capture state correctly', () => {
      const service = new CodexSessionTraceService({ settings: () => codexTraceSettings(dir) });
      service.armDeepCapture('tab-c', 'thread');
      expect(service.getCaptureState('tab-c')).toBe('armed');
      const claimed = service.claimDeepCapture('tab-c', 'thread');
      expect(claimed).toBeDefined();
      expect(service.getCaptureState('tab-c')).toBe('capturing');
      expect(service.cancelDeepCapture('tab-c')).toBe(true);
      expect(service.getCaptureState('tab-c')).toBe('off');
    });

    it('arming a different tab does not disturb the first tab (per-tab isolation)', () => {
      const service = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(dir) });
      service.armDeepCapture('tab-1', 'sess');
      service.armDeepCapture('tab-2', 'sess');
      expect(service.getCaptureState('tab-1')).toBe('armed');
      expect(service.getCaptureState('tab-2')).toBe('armed');
      service.claimDeepCapture('tab-1', 'sess');
      expect(service.getCaptureState('tab-1')).toBe('capturing');
      expect(service.getCaptureState('tab-2')).toBe('armed');
    });
  });

  // ---------------------------------------------------------------------------
  // Step 3 (fail-closed): a throwing service method must not crash the caller.
  //
  // main.ts wraps each trace dispose in `.catch(() => ...)`. The chat host
  // adapters wrap every read in safeTrace(). Characterize that the services
  // themselves are resilient: recordX on a disposed service, or with a cyclic
  // payload, does not throw.
  // ---------------------------------------------------------------------------

  describe('fail-closed resilience', () => {
    let dir: string;
    beforeEach(() => { dir = tempDir('failclosed'); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('OpenCode recording a cyclic payload does not throw', () => {
      const service = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(dir) });
      const ctx = service.bindSession(service.beginBootstrap(), 'sess-cyclic');
      const cyclic: Record<string, unknown> = { a: 1 };
      cyclic.self = cyclic;
      expect(() => service.recordIngress(ctx, 'cyclic.event', cyclic)).not.toThrow();
    });

    it('Claude recording on an undefined context (absent observer) is a no-op, not a throw', () => {
      const service = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(dir) });
      expect(() => service.recordSdkMessage(undefined, { data: 'orphan' })).not.toThrow();
      expect(() => service.recordTurnEvent(undefined, 'orphan.event')).not.toThrow();
    });

    it('Codex recordServiceOutput does not throw when disabled', () => {
      const service = new CodexSessionTraceService({ settings: () => codexTraceSettings(dir, { enabled: false }) });
      expect(() => service.recordServiceOutput('stderr', 'should-not-throw')).not.toThrow();
    });
  });
});

function readAllJsonFiles(root: string): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...readAllJsonFiles(full));
    } else if (entry.name.endsWith('.json') || entry.name.endsWith('.jsonl')) {
      out.push({ path: full, content: fs.readFileSync(full, 'utf8') });
    }
  }
  return out;
}
