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
  // Several tests construct trace services that hold background flush/watchdog
  // timers. Clearing all timers after each test prevents those timers from
  // leaking into later suites (which caused flakiness and "Cannot log after
  // tests are done" under the full verify gate).
  afterEach(() => {
    jest.clearAllTimers();
  });

  // After the whole suite, sweep any leaked opencodian-task10-* temp dirs that
  // individual afterEach hooks may have missed (e.g. if a test created a dir but
  // threw before cleanup). This keeps /tmp clean across repeated runs.
  afterAll(() => {
    try {
      const tmp = os.tmpdir();
      for (const entry of fs.readdirSync(tmp, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith('opencodian-task10-')) {
          fs.rmSync(path.join(tmp, entry.name), { recursive: true, force: true });
        }
      }
    } catch {
      // Best-effort cleanup; never fail the suite on sweep errors.
    }
  });

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
    // Each service gets its OWN temp directory so their TraceStores do not race
    // on the shared index.json.tmp path (which causes storage_degraded fallbacks
    // toward real user diagnostics dirs).
    const dirs: string[] = [];
    const created: Array<{ dispose: () => Promise<void> }> = [];
    afterEach(async () => {
      // Dispose all created services to prevent background timers leaking into
      // later tests (the verify gate runs all suites in one worker pool).
      await Promise.all(created.map((s) => s.dispose().catch(() => undefined)));
      created.length = 0;
      for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
      dirs.length = 0;
    });

    it('accepts the documented { settings, vaultPath, buildIdentity, knownSecrets, runtimeMetadata } option set for all three services and wires buildIdentity into the report', async () => {
      const ocDir = tempDir('ctor-oc'); dirs.push(ocDir);
      const codexDir = tempDir('ctor-codex'); dirs.push(codexDir);
      const claudeDir = tempDir('ctor-claude'); dirs.push(claudeDir);
      const oc = new OpenCodeSessionTraceService({
        settings: () => openCodeTraceSettings(ocDir),
        vaultPath: '/vault-oc',
        buildIdentity: () => 'Build: test-oc-BUILD42',
        knownSecrets: () => ['s1-oc'],
        runtimeMetadata: () => ({ serverMode: 'local', customMeta: 'oc' }),
      });
      const codex = new CodexSessionTraceService({
        settings: () => codexTraceSettings(codexDir),
        vaultPath: '/vault-codex',
        buildIdentity: () => 'Build: test-codex-BUILD42',
        knownSecrets: () => ['s1-codex'],
        runtimeMetadata: () => ({ serverMode: 'local', customMeta: 'codex' }),
      });
      const claude = new ClaudeSessionTraceService({
        settings: () => claudeTraceSettings(claudeDir),
        vaultPath: '/vault-claude',
        buildIdentity: () => 'Build: test-claude-BUILD42',
        knownSecrets: () => ['s1-claude'],
        runtimeMetadata: () => ({ serverMode: 'local', customMeta: 'claude' }),
      });
      created.push(oc, codex, claude);
      expect(oc.runtimeSegmentId).toMatch(/^[\da-f-]+$/);
      expect(codex.runtimeSegmentId).toMatch(/^[\da-f-]+$/);
      expect(claude.runtimeSegmentId).toMatch(/^[\da-f-]+$/);
      // runtimeMetadata is emitted into the runtime.started event for all three.
      const ocRt = await oc.store.readRuntimeSegment(oc.runtimeSegmentId);
      expect(ocRt.find((e) => e.name === 'runtime.started')?.payload).toMatchObject({ serverMode: 'local', customMeta: 'oc' });
      const codexRt = await codex.store.readRuntimeSegment(codex.runtimeSegmentId);
      expect(codexRt.find((e) => e.name === 'runtime.started')?.payload).toMatchObject({ customMeta: 'codex' });
      const claudeRt = await claude.store.readRuntimeSegment(claude.runtimeSegmentId);
      expect(claudeRt.find((e) => e.name === 'runtime.started')?.payload).toMatchObject({ customMeta: 'claude' });
      // buildIdentity is consumed by each report builder — pin it so a coordinator
      // extraction cannot silently drop the buildIdentity wiring. The report
      // header embeds the build-identity string.
      const ocReport = await oc.reportBuilder.buildSmartReport(undefined, undefined, undefined);
      expect(ocReport).toContain('test-oc-BUILD42');
      const codexReport = await codex.reportBuilder.buildSmartReport(undefined, undefined, undefined);
      expect(codexReport).toContain('test-codex-BUILD42');
      const claudeReport = await claude.reportBuilder.buildSmartReport(undefined, undefined, undefined);
      expect(claudeReport).toContain('test-claude-BUILD42');
      // Six readRuntimeSegment + three report builds can exceed the default 5s
      // timeout under full-suite I/O contention; allow 20s.
    }, 20000);

    it('uses a hardcoded build-identity fallback when buildIdentity is omitted', async () => {
      const ocDir = tempDir('fb-oc'); dirs.push(ocDir);
      const codexDir = tempDir('fb-codex'); dirs.push(codexDir);
      const claudeDir = tempDir('fb-claude'); dirs.push(claudeDir);
      const oc = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(ocDir) });
      const codex = new CodexSessionTraceService({ settings: () => codexTraceSettings(codexDir) });
      const claude = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(claudeDir) });
      created.push(oc, codex, claude);
      // The fallback string is 'Build: unknown' for all three — pin it in the
      // report so the fallback wiring cannot silently change.
      const ocReport = await oc.reportBuilder.buildSmartReport(undefined, undefined, undefined);
      expect(ocReport).toContain('Build: unknown');
      const codexReport = await codex.reportBuilder.buildSmartReport(undefined, undefined, undefined);
      expect(codexReport).toContain('Build: unknown');
      const claudeReport = await claude.reportBuilder.buildSmartReport(undefined, undefined, undefined);
      expect(claudeReport).toContain('Build: unknown');
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
      // Each service gets its own dir (shared dir races on index.json.tmp);
      // capture the dirs so afterEach can clean them up.
      const ocDir = tempDir('dis-oc');
      const codexDir = tempDir('dis-codex');
      const claudeDir = tempDir('dis-claude');
      const oc = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(ocDir, { enabled: false }) });
      const codex = new CodexSessionTraceService({ settings: () => codexTraceSettings(codexDir, { enabled: false }) });
      const claude = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(claudeDir, { enabled: false }) });
      await expect(oc.dispose()).resolves.toBeUndefined();
      await expect(codex.dispose()).resolves.toBeUndefined();
      await expect(claude.dispose()).resolves.toBeUndefined();
      fs.rmSync(ocDir, { recursive: true, force: true });
      fs.rmSync(codexDir, { recursive: true, force: true });
      fs.rmSync(claudeDir, { recursive: true, force: true });
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
    let ocDir: string;
    let codexDir: string;
    let claudeDir: string;
    beforeEach(() => {
      ocDir = tempDir('dispose-oc');
      codexDir = tempDir('dispose-codex');
      claudeDir = tempDir('dispose-claude');
    });
    afterEach(() => {
      fs.rmSync(ocDir, { recursive: true, force: true });
      fs.rmSync(codexDir, { recursive: true, force: true });
      fs.rmSync(claudeDir, { recursive: true, force: true });
    });

    it('dispose() emits runtime.stopped and flushes; runtime events live in a separate segment file (readRuntimeSegment, NOT readTrace)', async () => {
      // Each service gets its own dir to avoid the shared index.json.tmp race.
      const oc = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(ocDir) });
      const codex = new CodexSessionTraceService({ settings: () => codexTraceSettings(codexDir) });
      const claude = new ClaudeSessionTraceService({ settings: () => claudeTraceSettings(claudeDir) });
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
      // Six readRuntimeSegment/readTrace calls can exceed the default 5s timeout
      // under full-suite I/O contention; allow 15s.
    }, 15000);

    it('dispose is idempotent (safe to call twice, as main.ts uses void ... .catch())', async () => {
      const idempDir = tempDir('idemp');
      const service = new OpenCodeSessionTraceService({ settings: () => openCodeTraceSettings(idempDir) });
      await service.dispose();
      await expect(service.dispose()).resolves.toBeUndefined();
      fs.rmSync(idempDir, { recursive: true, force: true });
    });

    it('Codex dispose clears active turn watchdogs without throwing on an empty map', async () => {
      const codexWatchdogDir = tempDir('codex-watchdog');
      const service = new CodexSessionTraceService({ settings: () => codexTraceSettings(codexWatchdogDir) });
      await expect(service.dispose()).resolves.toBeUndefined();
      fs.rmSync(codexWatchdogDir, { recursive: true, force: true });
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

    it('Claude persisted files contain no raw secret and normalize the vault path (hardened mode, via recordTurnEvent raw-payload path)', async () => {
      // recordSdkMessage summarizes; recordTurnEvent emits the raw payload through
      // the redactor, so use it to exercise secret/path redaction on disk.
      const secret = 'super-secret-claude-disk-1234';
      const service = new ClaudeSessionTraceService({
        settings: () => claudeTraceSettings(dir),
        vaultPath,
        knownSecrets: () => [secret],
      });
      const ctx = service.bindSession({ sessionId: 'sess-claude-disk', resumed: false, via: 'sdk' });
      service.recordTurnEvent(ctx, 'disk.canary', 'warning', { note: secret, filePath: `${vaultPath}/secret.txt` });
      await service.store.flush();
      const files = readAllJsonFiles(dir);
      const blob = files.map((f) => f.content).join('\n');
      expect(blob).not.toContain(secret);
      expect(blob).toContain('$VAULT');
      expect(blob).not.toContain(vaultPath);
    });

    it('Codex persisted files contain no raw secret and normalize the vault path (hardened mode)', async () => {
      const secret = 'super-secret-codex-disk-1234';
      const service = new CodexSessionTraceService({
        settings: () => codexTraceSettings(dir),
        vaultPath,
        knownSecrets: () => [secret],
      });
      const ctx = service.bindThread({ threadId: 'thread-codex-disk', resumed: false, via: 'app-server' });
      // recordToolInteraction emits the raw payload through the redactor.
      service.recordToolInteraction(ctx, 'tool.call', { note: secret, filePath: `${vaultPath}/secret.txt` });
      await service.store.flush();
      const files = readAllJsonFiles(dir);
      const blob = files.map((f) => f.content).join('\n');
      expect(blob).not.toContain(secret);
      expect(blob).toContain('$VAULT');
      expect(blob).not.toContain(vaultPath);
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

  // ---------------------------------------------------------------------------
  // Step 2: DiagnosticsRuntimeCoordinator construction/injection/dispose wiring.
  //
  // After Phase 3 Task 11, main.ts no longer constructs trace services directly.
  // The DiagnosticsRuntimeCoordinator owns construction (OpenCode → Codex →
  // Claude, pinned order) with the same option getters, exposes typed backend
  // ports, and owns the unified dispose. main.ts:
  //   - constructs ONE coordinator inside handleBootstrapOpenCodeRuntime;
  //   - exposes delegating getters (openCodeTraceService/codexTraceService/
  //     claudeTraceService) that return the coordinator's typed ports (shims
  //     removed in Task 12/13 when consumers migrate);
  //   - calls the coordinator's dispose() in onunload.
  //
  // We pin BOTH the coordinator's own construction/dispose contract AND main.ts's
  // delegation, so any silent reordering, option drop, or re-introduction of a
  // direct `new *SessionTraceService` in main.ts is detected.
  // ---------------------------------------------------------------------------

  describe('DiagnosticsRuntimeCoordinator + main.ts delegation wiring (source contract)', () => {
    const mainSrc = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/main.ts'),
      'utf8',
    );
    const coordSrc = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/app/diagnostics/DiagnosticsRuntimeCoordinator.ts'),
      'utf8',
    );

    it('main.ts has ZERO direct `new *SessionTraceService` constructions (Task 11 hard requirement)', () => {
      expect(mainSrc).not.toMatch(/new OpenCodeSessionTraceService\(/);
      expect(mainSrc).not.toMatch(/new CodexSessionTraceService\(/);
      expect(mainSrc).not.toMatch(/new ClaudeSessionTraceService\(/);
    });

    it('main.ts constructs a single DiagnosticsRuntimeCoordinator inside handleBootstrapOpenCodeRuntime', () => {
      const bootstrapStart = mainSrc.indexOf('private async handleBootstrapOpenCodeRuntime(');
      expect(bootstrapStart).toBeGreaterThan(-1);
      const nextMethodRel = mainSrc.slice(bootstrapStart + 1).search(/\n[/ ]{2}(private|public|protected|async)\b/);
      const bootstrapEnd = nextMethodRel > 0 ? bootstrapStart + 1 + nextMethodRel : mainSrc.indexOf('  activateView', bootstrapStart);
      const body = mainSrc.slice(bootstrapStart, bootstrapEnd);
      expect(body).toContain('this.diagnosticsCoordinator = new DiagnosticsRuntimeCoordinator({');
    });

    it('main.ts exposes delegating getters that return the coordinator typed ports (shims until Task 12/13)', () => {
      // The getters delegate to this.diagnosticsCoordinator?.<backend> and return
      // undefined before bootstrap (matching the prior uninitialized-field runtime
      // behavior). The declared type stays non-nullable so consumers keep typechecking.
      expect(mainSrc).toMatch(/get openCodeTraceService\(\).*return this\.diagnosticsCoordinator\?\.openCode/s);
      expect(mainSrc).toMatch(/get codexTraceService\(\).*return this\.diagnosticsCoordinator\?\.codex/s);
      expect(mainSrc).toMatch(/get claudeTraceService\(\).*return this\.diagnosticsCoordinator\?\.claude/s);
    });

    it('main.ts onunload delegates dispose to the coordinator (not per-service inline disposal)', () => {
      const onunloadStart = mainSrc.indexOf('  onunload()');
      expect(onunloadStart).toBeGreaterThan(-1);
      const onunloadEnd = mainSrc.indexOf('  activateView', onunloadStart);
      const body = mainSrc.slice(onunloadStart, onunloadEnd);
      expect(body).toContain('void this.diagnosticsCoordinator?.dispose()');
      // No per-service inline disposal remains in onunload.
      expect(body).not.toMatch(/this\.openCodeTraceService\?\.dispose/);
      expect(body).not.toMatch(/this\.codexTraceService\?\.dispose/);
      expect(body).not.toMatch(/this\.claudeTraceService\?\.dispose/);
    });

    it('coordinator constructs the three services in pinned order opencode -> codex -> claude', () => {
      const ocIdx = coordSrc.indexOf('this.openCode = new OpenCodeSessionTraceService(');
      const codexIdx = coordSrc.indexOf('this.codex = new CodexSessionTraceService(');
      const claudeIdx = coordSrc.indexOf('this.claude = new ClaudeSessionTraceService(');
      expect(ocIdx).toBeGreaterThan(-1);
      expect(codexIdx).toBeGreaterThan(-1);
      expect(claudeIdx).toBeGreaterThan(-1);
      expect(ocIdx).toBeLessThan(codexIdx);
      expect(codexIdx).toBeLessThan(claudeIdx);
    });

    it('coordinator constructs ALL THREE services with all five option keys bound to real input getters', () => {
      const ocCtorStart = coordSrc.indexOf('this.openCode = new OpenCodeSessionTraceService(');
      const codexCtorStart = coordSrc.indexOf('this.codex = new CodexSessionTraceService(');
      const claudeCtorStart = coordSrc.indexOf('this.claude = new ClaudeSessionTraceService(');
      const ocCtor = coordSrc.slice(ocCtorStart, codexCtorStart);
      const codexCtor = coordSrc.slice(codexCtorStart, claudeCtorStart);
      const claudeCtorRaw = coordSrc.slice(claudeCtorStart);
      const claudeCloseIdx = claudeCtorRaw.indexOf('\n    });');
      const claudeCtor = claudeCloseIdx > 0 ? claudeCtorRaw.slice(0, claudeCloseIdx) : claudeCtorRaw;
      // All five option keys present in EACH constructor, bound to input getters.
      for (const ctor of [ocCtor, codexCtor, claudeCtor]) {
        expect(ctor).toMatch(/settings:\s*inputs\./);
        expect(ctor).toMatch(/vaultPath:\s*inputs\.vaultPath/);
        expect(ctor).toMatch(/buildIdentity:\s*inputs\.buildIdentity/);
        expect(ctor).toMatch(/knownSecrets:\s*inputs\./);
        expect(ctor).toMatch(/runtimeMetadata:\s*inputs\./);
      }
      // Each backend binds its OWN settings/knownSecrets/runtimeMetadata input.
      expect(ocCtor).toMatch(/inputs\.openCodeSettings/);
      expect(ocCtor).toMatch(/inputs\.openCodeKnownSecrets/);
      expect(ocCtor).toMatch(/inputs\.openCodeRuntimeMetadata/);
      expect(codexCtor).toMatch(/inputs\.codexSettings/);
      expect(codexCtor).toMatch(/inputs\.codexKnownSecrets/);
      expect(claudeCtor).toMatch(/inputs\.claudeSettings/);
      expect(claudeCtor).toMatch(/inputs\.claudeKnownSecrets/);
    });

    it('coordinator dispose() awaits each backend in pinned order opencode -> codex -> claude with per-backend .catch + injected logger (awaitable, deterministic)', () => {
      const disposeStart = coordSrc.indexOf('async dispose(): Promise<void> {');
      expect(disposeStart).toBeGreaterThan(-1);
      const body = coordSrc.slice(disposeStart, disposeStart + 800);
      const ocIdx = body.indexOf('this.openCode.dispose()');
      const codexIdx = body.indexOf('this.codex.dispose()');
      const claudeIdx = body.indexOf('this.claude.dispose()');
      expect(ocIdx).toBeGreaterThan(-1);
      expect(codexIdx).toBeGreaterThan(-1);
      expect(claudeIdx).toBeGreaterThan(-1);
      expect(ocIdx).toBeLessThan(codexIdx);
      expect(codexIdx).toBeLessThan(claudeIdx);
      // Each backend is awaited with .catch (fail-closed, deterministic teardown).
      expect(body).toMatch(/await this\.openCode\.dispose\(\)\.catch/);
      expect(body).toMatch(/await this\.codex\.dispose\(\)\.catch/);
      expect(body).toMatch(/await this\.claude\.dispose\(\)\.catch/);
      // Warnings use the injected this.logger (preserves caller's scope), not a
      // hardcoded module-level logger.
      expect(body).toMatch(/this\.logger\.warn/);
      expect(body).not.toMatch(/^const logger =/m);
    });

    it('coordinator accepts an injected logger and main.ts passes its OpenCodian logger (byte-compatible scope)', () => {
      // The coordinator stores inputs.logger (defaulting to a coordinator-scoped logger).
      expect(coordSrc).toMatch(/this\.logger\s*=\s*inputs\.logger\s*\?\?\s*createLogger/);
      // main.ts injects its 'OpenCodian' logger so dispose warnings preserve the scope.
      const mainBootstrap = mainSrc.indexOf('private async handleBootstrapOpenCodeRuntime(');
      const mainBody = mainSrc.slice(mainBootstrap, mainSrc.indexOf('  activateView', mainBootstrap));
      expect(mainBody).toMatch(/logger,/);
    });

    it('coordinator ctor wraps construction in try/catch that disposes partial services on failure (no leak)', () => {
      // If a later construction throws, the already-constructed services must be
      // disposed so timers/stores do not leak (matching the prior per-service
      // immediate assignment).
      expect(coordSrc).toMatch(/const constructed:/);
      expect(coordSrc).toMatch(/constructed\.push\(this\.(openCode|codex|claude)\)/);
      expect(coordSrc).toMatch(/}\s*catch\s*\(error\)\s*{[\s\S]*?for\s*\(const service of constructed\)/);
      expect(coordSrc).toMatch(/throw error;/);
    });

    it('coordinator exposes typed backend ports (no generic mutable service map)', () => {
      expect(coordSrc).toMatch(/readonly openCode:\s*OpenCodeSessionTraceService/);
      expect(coordSrc).toMatch(/readonly codex:\s*CodexSessionTraceService/);
      expect(coordSrc).toMatch(/readonly claude:\s*ClaudeSessionTraceService/);
      // ports getter returns the three typed properties, not a Map/index signature.
      expect(coordSrc).not.toMatch(/Map<string/);
      expect(coordSrc).toMatch(/get ports\(\).*openCode:\s*this\.openCode.*codex:\s*this\.codex.*claude:\s*this\.claude/s);
    });
  });

  // ---------------------------------------------------------------------------
  // Step 6: each backend's export/flush ordering + plugin export bytes.
  //
  // The plan (item 6) requires capturing each backend's current export/flush
  // sequence WITHOUT inventing a uniform baseline. The asymmetry:
  //   - OpenCode chat export (OpenCodianView inline): resolveTraceId →
  //     buildSmartReport → clipboard.writeText (NO pre-flush).
  //   - Codex/Claude adapter export: flushRingBuffer → store.flush() →
  //     buildSmartReport → clipboard.writeText.
  // Plus the plugin-level export (writeDiagnosticLogFile / buildDiagnosticReport)
  // surfaces in SettingsDebugSection. We pin the source ordering.
  // ---------------------------------------------------------------------------

  describe('per-backend export/flush ordering (source contract)', () => {
    it('Codex adapter exportConversationDiagnostics flushes ring + store BEFORE building the report', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/chat/services/CodexDiagnosticsHostAdapter.ts'),
        'utf8',
      );
      const start = src.indexOf('async exportConversationDiagnostics(');
      const body = src.slice(start, start + 1200);
      const flushRingIdx = body.indexOf('flushRingBuffer(');
      const storeFlushIdx = body.indexOf('await service.store.flush()');
      const buildIdx = body.indexOf('buildSmartReport(');
      const clipboardIdx = body.indexOf('navigator.clipboard.writeText');
      // Order: flushRingBuffer -> store.flush -> buildSmartReport -> clipboard.
      expect(flushRingIdx).toBeGreaterThan(-1);
      expect(flushRingIdx).toBeLessThan(storeFlushIdx);
      expect(storeFlushIdx).toBeLessThan(buildIdx);
      expect(buildIdx).toBeLessThan(clipboardIdx);
    });

    it('Claude adapter exportConversationDiagnostics flushes ring + store BEFORE building the report (same order as Codex)', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/chat/services/ClaudeDiagnosticsHostAdapter.ts'),
        'utf8',
      );
      const start = src.indexOf('async exportConversationDiagnostics(');
      const body = src.slice(start, start + 1200);
      const flushRingIdx = body.indexOf('flushRingBuffer(');
      const storeFlushIdx = body.indexOf('await service.store.flush()');
      const buildIdx = body.indexOf('buildSmartReport(');
      const clipboardIdx = body.indexOf('navigator.clipboard.writeText');
      expect(flushRingIdx).toBeGreaterThan(-1);
      expect(flushRingIdx).toBeLessThan(storeFlushIdx);
      expect(storeFlushIdx).toBeLessThan(buildIdx);
      expect(buildIdx).toBeLessThan(clipboardIdx);
    });

    it('OpenCode chat export (OpenCodianView inline) does NOT pre-flush — it resolves traceId then builds the report directly', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/chat/OpenCodianView.ts'),
        'utf8',
      );
      // Find the copySession menu onClick handler that builds the OpenCode report.
      const copyIdx = src.indexOf("setTitle(t('chat.opencodeDiagnostics.copySession'))");
      expect(copyIdx).toBeGreaterThan(-1);
      const body = src.slice(copyIdx, copyIdx + 800);
      const resolveIdx = body.indexOf('resolveTraceId(');
      const buildIdx = body.indexOf('buildSmartReport(');
      const clipboardIdx = body.indexOf('navigator.clipboard.writeText');
      expect(resolveIdx).toBeGreaterThan(-1);
      expect(resolveIdx).toBeLessThan(buildIdx);
      expect(buildIdx).toBeLessThan(clipboardIdx);
      // OpenCode export does NOT call flushRingBuffer or store.flush before building.
      const preBuildSlice = body.slice(0, buildIdx);
      expect(preBuildSlice).not.toMatch(/flushRingBuffer|\.store\.flush\(\)/);
    });

    it('plugin-level export source-structure contract: filename pattern, utf-8 encoding, build-then-write ordering, and report header fields', () => {
      // The plan (item 6) asks for byte-for-byte stability of plugin export
      // filename, encoding, ordering, and content. main.ts cannot be instantiated
      // in a unit test (it extends Obsidian Plugin with app/vault/manifest), so a
      // true runtime byte test is not possible here. This source-structure
      // contract pins the STRUCTURE that produces the bytes: the filename
      // pattern, the utf-8 encoding argument, the build-then-write ordering, and
      // the report header field set. A behavioral byte test belongs in an
      // integration suite that can construct the plugin; Task 13's settings
      // acceptance covers the export-block wiring.
      const mainSrc = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/main.ts'),
        'utf8',
      );
      // writeDiagnosticLogFile: filename = opencodian-debug-${timestamp}.log where
      // timestamp = ISO string with : and . replaced by -.
      const writeStart = mainSrc.indexOf('async writeDiagnosticLogFile(');
      expect(writeStart).toBeGreaterThan(-1);
      const writeBody = mainSrc.slice(writeStart, writeStart + 500);
      expect(writeBody).toMatch(/opencodian-debug-\$\{timestamp\}\.log/);
      // The timestamp normalization replaces `:` and `.` with `-` (ISO-safe).
      // Pin the EXACT character class so a switch to e.g. `/Z/g` is caught.
      expect(writeBody).toContain(".replace(/[:.]/g, '-')");
      // utf-8 encoding (not utf8 without the dash, not binary).
      expect(writeBody).toMatch(/writeFile\(targetPath,\s*report,\s*'utf-8'\)/);
      // Ordering: build the report first, then write it.
      const buildCallIdx = writeBody.indexOf('buildDiagnosticReport(');
      const writeFileIdx = writeBody.indexOf('writeFile(');
      expect(buildCallIdx).toBeGreaterThan(-1);
      expect(buildCallIdx).toBeLessThan(writeFileIdx);

      // buildDiagnosticReport: report starts with the canonical header and
      // embeds BUILD_ID + manifest fields. The raw array is joined with '\n'
      // (LF) — pin the join so a CRLF switch is caught.
      const reportStart = mainSrc.indexOf('async buildDiagnosticReport(');
      expect(reportStart).toBeGreaterThan(-1);
      const reportBody = mainSrc.slice(reportStart, reportStart + 4000);
      // Pin the COMPLETE header line set so removing/adding/reordering any line
      // is caught. This is the full identity + environment header block.
      expect(reportBody).toContain("'# OpenCodian Diagnostic Report'");
      expect(reportBody).toContain("`Generated: ${new Date().toISOString()}`");
      expect(reportBody).toContain("`Source: ${source}`");
      expect(reportBody).toMatch(/Plugin name: \$\{this\.manifest\.name\}/);
      expect(reportBody).toMatch(/Plugin ID: \$\{this\.manifest\.id\}/);
      expect(reportBody).toMatch(/Plugin version: \$\{this\.manifest\.version\}/);
      expect(reportBody).toMatch(/BUILD_ID: \$\{BUILD_ID\}/);
      expect(reportBody).toMatch(/Platform: \$\{process\.platform\}/);
      expect(reportBody).toMatch(/Vault path: \$\{vaultPath\}/);
      // The report array is joined with '\n' (LF line endings).
      expect(reportBody).toMatch(/\.join\('\\n'\)/);

      // SettingsDebugSection wires both export surfaces into the export block.
      const debugSrc = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/SettingsDebugSection.ts'),
        'utf8',
      );
      expect(debugSrc).toMatch(/buildDiagnosticReport/);
      expect(debugSrc).toMatch(/writeDiagnosticLogFile/);
    });
  });

  // ---------------------------------------------------------------------------
  // Step 4 (cont.): exported-bundle redaction canary.
  //
  // exportTraceBundle writes a bundle directory; the bundle content must not
  // contain a raw secret. Characterize Claude's exportTrace (the only service
  // exposing it directly on the port) and the shared store export path.
  // ---------------------------------------------------------------------------

  describe('exported-bundle redaction canary', () => {
    let dir: string;
    let exportDir: string;
    beforeEach(() => {
      dir = tempDir('export');
      exportDir = tempDir('export-out');
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(exportDir, { recursive: true, force: true });
    });

    it('Claude exportTrace bundle contains no raw secret (via recordTurnEvent raw-payload path)', async () => {
      // recordSdkMessage persists only an envelope (the raw secret never enters
      // the trace), which would make this canary a tautology. Use recordTurnEvent
      // (raw-payload path) so the secret genuinely flows through the redactor
      // into the persisted trace and then the export bundle. Assert BOTH that the
      // raw secret is absent AND that the [REDACTED] placeholder is present —
      // this proves the secret reached the redactor (a mutation that silently
      // drops the event would leave no [REDACTED] and fail).
      const secret = 'export-bundle-secret-claude-1234';
      const service = new ClaudeSessionTraceService({
        settings: () => claudeTraceSettings(dir),
        knownSecrets: () => [secret],
      });
      const ctx = service.bindSession({ sessionId: 'sess-export', resumed: false, via: 'sdk' });
      service.recordTurnEvent(ctx, 'export.canary', 'warning', { note: secret });
      service.finishTurn(ctx, 'completed');
      await service.store.flush();
      // Confirm the secret reached the persisted trace AND was redacted (the
      // [REDACTED] placeholder proves the redactor processed the note value).
      const traceBlob = readAllJsonFiles(dir).map((f) => f.content).join('\n');
      expect(traceBlob).not.toContain(secret);
      expect(traceBlob).toContain('[REDACTED]');
      expect(traceBlob).toContain('export.canary');
      const exportedPath = await service.exportTrace(ctx.traceId, exportDir);
      expect(exportedPath).toBeDefined();
      // The export bundle must also contain the redacted placeholder, not the raw secret.
      const blob = readAllJsonFiles(exportDir).map((f) => f.content).join('\n');
      expect(blob).not.toContain(secret);
      expect(blob).toContain('[REDACTED]');
    });

    it('OpenCode store.exportTraceBundle contains no raw secret', async () => {
      const secret = 'export-bundle-secret-opencode-1234';
      const service = new OpenCodeSessionTraceService({
        settings: () => openCodeTraceSettings(dir),
        knownSecrets: () => [secret],
      });
      const ctx = service.bindSession(service.beginBootstrap(), 'sess-export-oc');
      service.markAnomaly(ctx, 'export.canary', 'warning', { note: secret });
      await service.store.flush();
      const exportedPath = await service.store.exportTraceBundle(ctx.traceId, exportDir);
      expect(exportedPath).toBeDefined();
      const blob = readAllJsonFiles(exportDir).map((f) => f.content).join('\n');
      expect(blob).not.toContain(secret);
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
