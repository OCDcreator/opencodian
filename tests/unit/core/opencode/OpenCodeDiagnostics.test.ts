/* eslint-disable max-lines -- End-to-end diagnostic invariants share one temporary-store fixture. */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  OPEN_CODE_TRACE_CHANNEL_IDS,
  OpenCodeSessionTraceService,
  type OpenCodeSessionTraceSettings,
  type OpenCodeTraceEventV1,
  OpenCodeTraceRedactor,
  OpenCodeTraceStore,
} from '../../../../src/core/opencode/diagnostics';
import { setDebugLoggingEnabled } from '../../../../src/shared/logger';

function traceSettings(directory: string): OpenCodeSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(
      OPEN_CODE_TRACE_CHANNEL_IDS.map((channel) => [channel, false]),
    ) as OpenCodeSessionTraceSettings['consoleChannels'],
    storageDirectory: directory,
  };
}

function event(overrides: Partial<OpenCodeTraceEventV1> = {}): OpenCodeTraceEventV1 {
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    monotonicSequence: 1,
    traceId: 'trace-1',
    runtimeSegmentId: 'runtime-1',
    channel: 'lifecycle',
    source: 'plugin',
    severity: 'info',
    name: 'test.event',
    ...overrides,
  };
}

// eslint-disable-next-line max-lines-per-function -- Diagnostic persistence scenarios share one isolated temp-directory lifecycle.
describe('OpenCode diagnostics', () => {
  let directory: string;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-trace-'));
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    setDebugLoggingEnabled(false);
    consoleLogSpy.mockRestore();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('redacts secrets, local paths, binary-like values, cycles, and oversized text before persistence', () => {
    const redactor = new OpenCodeTraceRedactor({
      vaultPath: '/Users/alice/Vault',
      diagnosticsPath: directory,
      knownSecrets: ['known-secret'],
      maxStringBytes: 16,
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const error = new Error(`failed with known-secret ${'s'.repeat(40)}`);
    const hostile = Object.defineProperty({}, 'secretGetter', {
      enumerable: true,
      get: () => {
        throw new Error('getter must not escape');
      },
    });
    const hostileProxy = new Proxy({}, {
      ownKeys: () => {
        throw new Error('proxy must not escape');
      },
    });

    const result = redactor.redact({
      authorization: 'Bearer top-secret',
      url: 'https://example.test/?token=query-secret',
      path: '/Users/alice/Vault/note.md',
      known: 'known-secret',
      cyclic,
      long: 'x'.repeat(40),
      binary: Buffer.from('secret bytes'),
      error,
      endpoint: 'https://alice:password@example.test/path?access_token=url-token&sig=url-signature',
      headerLine: 'Cookie: session=cookie-secret; theme=dark',
      env: { SAFE_NAME: 'environment-secret' },
      hostile,
      hostileProxy,
    });
    const serialized = JSON.stringify(result.value);

    expect(serialized).not.toContain('top-secret');
    expect(serialized).not.toContain('query-secret');
    expect(serialized).not.toContain('known-secret');
    expect(serialized).not.toContain('/Users/alice/Vault');
    expect(serialized).toContain('$VAULT');
    expect(serialized).toContain('CIRCULAR');
    expect(serialized).toContain('truncated');
    expect(serialized).toContain('"omitted":"binary"');
    expect(serialized).toContain('"name":"Error"');
    expect(serialized).toContain('"stack"');
    expect(serialized).not.toContain('alice:password');
    expect(serialized).not.toContain('url-token');
    expect(serialized).not.toContain('url-signature');
    expect(serialized).not.toContain('cookie-secret');
    expect(serialized).not.toContain('environment-secret');
    expect(serialized).toContain('[UNREADABLE]');
  });

  it('normalizes raw and URI-encoded diagnostic path prefixes before every output layer', async () => {
    const macVault = '/Volumes/SDD2T/obsidian-vault-write/testvault';
    const windowsVault = 'C:\\Users\\lt\\Desktop\\Write\\testvault';
    const temporaryPath = path.join(os.tmpdir(), 'encoded-temp-root');
    const macEncoded = encodeURIComponent(macVault);
    const macEncodedLower = macEncoded.replace(/%[0-9A-F]{2}/g, (token) => token.toLowerCase());
    const windowsForward = windowsVault.replace(/\\/g, '/');
    const windowsForwardEncoded = encodeURIComponent(windowsForward);
    const windowsBackslashEncoded = encodeURIComponent(windowsVault)
      .replace(/%[0-9A-F]{2}/g, (token) => token.toLowerCase());
    const diagnosticsEncoded = encodeURIComponent(directory);
    const temporaryEncoded = encodeURIComponent(temporaryPath);
    const homeEncoded = encodeURIComponent(os.homedir());
    const directMac = new OpenCodeTraceRedactor({
      vaultPath: macVault,
      diagnosticsPath: directory,
      temporaryPath,
    }).redact({
      raw: `${macVault}/notes/raw.md`,
      backslash: `${macVault.replace(/\//g, '\\')}\\notes\\backslash.md`,
      query: `https://example.test/config?directory=${macEncodedLower}%2Fnotes`,
      segment: `https://example.test/vault/${macEncoded}/notes`,
      diagnostics: `https://example.test/log/${diagnosticsEncoded}%2Ftrace.jsonl`,
      temporary: `https://example.test/tmp/${temporaryEncoded}%2Fchunk`,
      home: `https://example.test/home/${homeEncoded}%2Fprofile`,
    }).value;
    const directWindows = new OpenCodeTraceRedactor({ vaultPath: windowsVault }).redact({
      raw: `${windowsVault}\\notes\\raw.md`,
      forward: `${windowsForward}/notes/forward.md`,
      encodedForward: `https://example.test/config?directory=${windowsForwardEncoded}%2Fnotes`,
      encodedBackslash: `https://example.test/vault/${windowsBackslashEncoded}%5cnotes`,
    }).value;
    const direct = JSON.stringify({ directMac, directWindows });

    for (const canary of [
      macVault,
      macVault.replace(/\//g, '\\'),
      macEncoded,
      macEncodedLower,
      windowsVault,
      windowsForward,
      windowsForwardEncoded,
      windowsBackslashEncoded,
      diagnosticsEncoded,
      temporaryEncoded,
      homeEncoded,
    ]) {
      expect(direct).not.toContain(canary);
    }
    for (const placeholder of ['$DIAGNOSTICS', '$VAULT', '$TMP', '$HOME']) {
      expect(direct).toContain(placeholder);
    }

    const settings = traceSettings(directory);
    settings.consolePreset = 'full';
    settings.consoleChannels.transport = true;
    setDebugLoggingEnabled(true);
    const service = new OpenCodeSessionTraceService({
      settings: () => settings,
      vaultPath: macVault,
      buildIdentity: () => 'Build: encoded-path-test',
    });
    const run = service.beginRun({ sessionId: 'ses_encoded_transport' });
    const transportUrl = `http://127.0.0.1:4196/config/${macEncoded}`
      + `?directory=${macEncodedLower}`;
    service.recordTransport({
      context: run,
      method: 'GET',
      url: transportUrl,
      status: 200,
      durationMs: 5,
    });
    await service.store.flush();

    const structuralPath = path.join(
      directory,
      'v1',
      'structural',
      `${run.traceId}.jsonl`,
    );
    const consoleOutput = JSON.stringify(consoleLogSpy.mock.calls);
    const structuralJsonl = await fs.readFile(structuralPath, 'utf8');
    const report = await service.reportBuilder.buildSmartReport(run.traceId);
    for (const output of [consoleOutput, structuralJsonl, report]) {
      expect(output).not.toContain(macVault);
      expect(output).not.toContain(macEncoded);
      expect(output).not.toContain(macEncodedLower);
      expect(output).toContain('$VAULT');
    }
    service.finishRun(run, 'completed');
    await service.dispose();
  });

  it.each([
    ['ordinary', 64 * 1024],
    ['stack', 32 * 1024],
    ['service-output', 16 * 1024],
  ] as const)('truncates %s CJK text on UTF-8 character boundaries', (kind, limit) => {
    const redactor = new OpenCodeTraceRedactor();
    const value = redactor.redact('诊'.repeat(limit), kind).value as {
      preview: string;
      originalBytes: number;
    };

    expect(Buffer.byteLength(value.preview, 'utf8')).toBeLessThanOrEqual(limit);
    expect(value.preview).not.toContain('\uFFFD');
    expect(value.originalBytes).toBe(limit * 3);
  });

  it('never lets hostile redaction or store failures interrupt the OpenCode path', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    const appendSpy = jest.spyOn(service.store, 'append').mockImplementation(() => {
      throw new Error('diagnostics write failed');
    });
    const hostileProxy = new Proxy({}, {
      ownKeys: () => {
        throw new Error('proxy inspection failed');
      },
    });

    expect(() => service.recordRuntime({
      channel: 'transport',
      source: 'http',
      severity: 'error',
      name: 'hostile.failure',
      payload: hostileProxy,
    })).not.toThrow();
    appendSpy.mockRestore();
    await service.dispose();
  });

  it('emits one redacted storage-degraded error and keeps it copyable in memory', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const settings = traceSettings(directory);
    const knownSecret = 'known-storage-secret';
    const vaultPath = path.join(os.homedir(), 'storage-vault-canary');
    const homePath = path.join(os.homedir(), 'storage-home-canary');
    const temporaryPath = path.join(os.tmpdir(), 'storage-tmp-canary');
    const diagnosticsPath = path.join(directory, 'storage-diagnostics-canary');
    const service = new OpenCodeSessionTraceService({
      settings: () => settings,
      vaultPath,
      knownSecrets: () => [knownSecret],
    });
    const run = service.beginRun({ sessionId: 'ses_storage_degraded' });
    await service.store.flush();
    const appendSpy = jest.spyOn(fs, 'appendFile')
      .mockRejectedValueOnce(new Error([
        `secret=${knownSecret}`,
        `home=${homePath}`,
        `vault=${vaultPath}`,
        `tmp=${temporaryPath}`,
        `diagnostics=${diagnosticsPath}`,
      ].join(' ')));

    expect(() => service.recordNormalized(run, 'after.disk.failure', { state: 'new' })).not.toThrow();
    await service.store.flush();
    appendSpy.mockRestore();
    service.recordNormalized(run, 'after.memory.failure', { state: 'continued' });
    await service.store.flush();

    const events = await service.store.readTrace(run.traceId);
    const runtimeEvents = await service.store.readRuntimeSegment(run.runtimeSegmentId);
    const serializedEvidence = JSON.stringify({
      console: consoleErrorSpy.mock.calls,
      events,
      runtimeEvents,
    });
    expect(events.filter((item) => item.name === 'trace.storage_degraded')).toHaveLength(1);
    for (const canary of [knownSecret, homePath, vaultPath, temporaryPath, diagnosticsPath]) {
      expect(serializedEvidence).not.toContain(canary);
    }
    expect(serializedEvidence).toContain('$HOME');
    expect(serializedEvidence).toContain('$VAULT');
    expect(serializedEvidence).toContain('$TMP');
    expect(serializedEvidence).toContain('$DIAGNOSTICS');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OpenCodeTrace]'),
      'trace.storage_degraded',
      expect.objectContaining({ severity: 'error' }),
    );
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'after.memory.failure' }),
    ]));
    const sequences = [...events, ...runtimeEvents]
      .map((item) => item.monotonicSequence)
      .sort((left, right) => left - right);
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(sequences.every((sequence, index) => index === 0 || sequence > sequences[index - 1])).toBe(true);
    service.finishRun(run, 'completed');
    await service.dispose();
    consoleErrorSpy.mockRestore();
  });

  it('records authoritative session snapshots as plugin-normalized evidence', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    service.armDeepCapture('tab-snapshot-source', 'ses_snapshot_source');
    const run = service.beginRun({
      sessionId: 'ses_snapshot_source',
      diagnosticRunToken: service.claimDeepCapture('tab-snapshot-source', 'ses_snapshot_source'),
    });

    service.recordNormalized(run, 'capture.session_snapshot', {
      sessionId: 'ses_snapshot_source',
      messages: [],
    });
    await service.store.flush();

    const snapshot = (await service.store.readDeepRun(run.runId ?? ''))
      .find((item) => item.name === 'capture.session_snapshot');
    expect(snapshot).toEqual(expect.objectContaining({
      traceId: run.traceId,
      runId: run.runId,
      source: 'plugin',
      payloadRef: { kind: 'deep', runId: run.runId },
    }));
    expect(snapshot?.source).not.toBe('sse');
    service.finishRun(run, 'completed');
    await service.dispose();
  });

  it('limits deep-captured service output lines to 16 KiB', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    service.armDeepCapture('tab-output', 'ses_output');
    const run = service.beginRun({
      sessionId: 'ses_output',
      diagnosticRunToken: service.claimDeepCapture('tab-output', 'ses_output'),
    });
    const serviceOutput = 'line output '.repeat(2_000);
    service.recordServiceOutput({ stream: 'stdout', text: serviceOutput });
    await service.store.flush();

    const outputEvent = (await service.store.readDeepRun(run.runId ?? ''))
      .find((item) => item.name === 'service.output');
    expect(outputEvent?.payload).toEqual(expect.objectContaining({
      text: expect.objectContaining({
        truncated: true,
        originalBytes: Buffer.byteLength(serviceOutput),
      }),
    }));
    service.finishRun(run, 'completed');
    await service.dispose();
  });

  it('keeps deep payloads out of the structural JSONL and writes them only to the deep run file', async () => {
    const store = new OpenCodeTraceStore(directory);
    store.append(event({
      runId: 'run-1',
      payload: { prompt: 'private prompt' },
      payloadRef: { kind: 'deep', runId: 'run-1' },
    }), true);
    await store.flush();

    const structural = await fs.readFile(path.join(directory, 'v1', 'structural', 'trace-1.jsonl'), 'utf8');
    const deep = await fs.readFile(path.join(directory, 'v1', 'deep', 'run-1.jsonl'), 'utf8');

    expect(structural).not.toContain('private prompt');
    expect(structural).toContain('deepPayloadOmitted');
    expect(deep).toContain('private prompt');
    await store.dispose();
  });

  it('isolates one-shot capture by tab and preserves a stable trace id across runtime segments', async () => {
    const settings = traceSettings(directory);
    const first = new OpenCodeSessionTraceService({ settings: () => settings });
    first.armDeepCapture('tab-a', 'ses_shared');

    expect(first.claimDeepCapture('tab-b', 'ses_shared')).toBeUndefined();
    const token = first.claimDeepCapture('tab-a', 'ses_shared');
    expect(token?.tabId).toBe('tab-a');
    expect(first.getCaptureState('tab-a')).toBe('capturing');
    expect(first.getCaptureState('tab-b')).toBe('off');

    const firstRun = first.beginRun({
      sessionId: 'ses_shared',
      prompt: 'deep prompt',
      diagnosticRunToken: token,
    });
    first.recordIngress(firstRun, 'event.raw', { authorization: 'Bearer unsafe' });
    first.recordNormalized(firstRun, 'chunk.text', { text: 'assistant' });
    first.finishRun(firstRun, 'completed');
    await first.dispose();

    const second = new OpenCodeSessionTraceService({ settings: () => settings });
    const resumedRun = second.beginRun({ sessionId: 'ses_shared' });
    expect(resumedRun.traceId).toBe(firstRun.traceId);
    expect(resumedRun.runtimeSegmentId).not.toBe(firstRun.runtimeSegmentId);
    second.finishRun(resumedRun, 'completed');
    await second.dispose();
  });

  it('keeps capture state and concurrent same-session event correlation scoped by tab and run', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    service.armDeepCapture('tab-a', 'ses_parallel');
    service.armDeepCapture('tab-b', 'ses_parallel');
    const runA = service.beginRun({
      sessionId: 'ses_parallel',
      diagnosticRunToken: service.claimDeepCapture('tab-a', 'ses_parallel'),
    });
    const runB = service.beginRun({
      sessionId: 'ses_parallel',
      diagnosticRunToken: service.claimDeepCapture('tab-b', 'ses_parallel'),
    });

    expect(service.getCaptureState('tab-a')).toBe('capturing');
    expect(service.getCaptureState('tab-b')).toBe('capturing');
    expect(service.getCaptureState('tab-c')).toBe('off');

    service.recordSessionIngress(
      'ses_parallel',
      'stream.ingress.sdk',
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'ses_parallel',
          messageID: 'msg-a',
          part: { id: 'part-a', messageID: 'msg-a' },
        },
      },
      runA,
      { sourceEventId: 'source-a' },
    );
    service.recordSessionNormalized(
      'ses_parallel',
      'stream.outcome.sdk',
      { chunks: [{ type: 'text_delta' }] },
      runA,
      { sourceEventId: 'source-a' },
    );
    service.recordSessionIngress(
      'ses_parallel',
      'stream.ingress.sdk',
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'ses_parallel',
          messageID: 'msg-b',
          part: { id: 'part-b', messageID: 'msg-b' },
        },
      },
      runB,
      { sourceEventId: 'source-b' },
    );
    service.finishRun(runA, 'completed');
    expect(service.getCaptureState('tab-a')).toBe('off');
    expect(service.getCaptureState('tab-b')).toBe('capturing');
    service.finishRun(runB, 'completed');
    expect(service.getCaptureState('tab-b')).toBe('off');
    await service.store.flush();

    const deepA = await service.store.readDeepRun(runA.runId ?? '');
    const deepB = await service.store.readDeepRun(runB.runId ?? '');
    expect(deepA.filter((item) => item.sourceEventId === 'source-a')).toEqual(expect.arrayContaining([
      expect.objectContaining({ runId: runA.runId, messageId: 'msg-a', partId: 'part-a' }),
      expect.objectContaining({ runId: runA.runId, name: 'stream.outcome.sdk' }),
    ]));
    expect(deepA.some((item) => item.sourceEventId === 'source-b')).toBe(false);
    expect(deepB).toEqual(expect.arrayContaining([
      expect.objectContaining({ runId: runB.runId, sourceEventId: 'source-b', messageId: 'msg-b' }),
    ]));
    await service.dispose();
  });

  it('keeps non-deep interaction payloads structural and links discovered child sessions', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    const run = service.beginRun({ sessionId: 'ses_parent' });
    service.recordSessionIngress('ses_parent', 'stream.ingress.sdk', {
      type: 'task.started',
      properties: {
        sessionID: 'ses_parent',
        childSessionID: 'ses_child',
        input: { authorization: 'Bearer interaction-secret' },
      },
    }, run, { sourceEventId: 'task-source' });
    await service.store.flush();

    const structural = await fs.readFile(
      path.join(directory, 'v1', 'structural', `${run.traceId}.jsonl`),
      'utf8',
    );
    expect(structural).not.toContain('interaction-secret');
    expect(structural).not.toContain('"input"');
    expect(structural).toContain('child_session.linked');
    expect(service.store.resolveTraceId('ses_child')).toBe(run.traceId);
    service.finishRun(run, 'completed');
    await service.dispose();
  });

  it('keeps linked child ingress in the parent deep run without double-counting duplicate links', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    service.armDeepCapture('tab-child', 'ses_parent_child');
    const run = service.beginRun({
      sessionId: 'ses_parent_child',
      diagnosticRunToken: service.claimDeepCapture('tab-child', 'ses_parent_child'),
    });
    service.recordSessionIngress('ses_parent_child', 'stream.ingress.sdk', {
      type: 'task.started',
      properties: {
        sessionID: 'ses_parent_child',
        childSessionID: 'ses_child_linked',
      },
    }, run);
    service.linkChildSession(run, 'ses_child_linked', { relation: 'duplicate' });
    service.recordSessionIngress('ses_child_linked', 'stream.ingress.sdk', {
      type: 'message.updated',
      properties: {
        sessionID: 'ses_child_linked',
        messageID: 'msg-child',
        content: 'deep child payload',
      },
    });
    await service.store.flush();

    const deep = await service.store.readDeepRun(run.runId ?? '');
    expect(deep.filter((item) => item.name === 'child_session.linked')).toHaveLength(1);
    expect(deep).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'stream.ingress.sdk',
        traceId: run.traceId,
        runId: run.runId,
        rootSessionId: 'ses_parent_child',
        parentSessionId: 'ses_parent_child',
        sessionId: 'ses_child_linked',
      }),
    ]));
    service.finishRun(run, 'completed');
    await service.dispose();
  });

  it('resets child quotas per run and retains only runless parent correlation after finish', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    const firstRun = service.beginRun({ sessionId: 'ses_quota_parent' });
    for (let index = 0; index < 20; index += 1) {
      service.linkChildSession(firstRun, `ses_quota_first_${index}`);
    }
    service.finishRun(firstRun, 'completed');

    const secondRun = service.beginRun({ sessionId: 'ses_quota_parent' });
    service.linkChildSession(secondRun, 'ses_quota_second');
    service.finishRun(secondRun, 'completed');
    service.recordSessionIngress('ses_quota_second', 'post-finish.child-sync', {
      type: 'message.updated',
      properties: { sessionID: 'ses_quota_second', messageID: 'msg-post-finish' },
    });
    await service.store.flush();

    const events = await service.store.readTrace(firstRun.traceId);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'child_session.linked',
        runId: secondRun.runId,
        sessionId: 'ses_quota_second',
      }),
      expect.objectContaining({
        name: 'post-finish.child-sync',
        traceId: firstRun.traceId,
        rootSessionId: 'ses_quota_parent',
        parentSessionId: 'ses_quota_parent',
        sessionId: 'ses_quota_second',
        runId: undefined,
        payloadRef: { kind: 'inline' },
      }),
    ]));
    expect(events.some((item) =>
      item.name === 'child_session.truncated' && item.runId === secondRun.runId)).toBe(false);
    await service.dispose();
  });

  it('mirrors deep info events even when global debug logging is disabled', async () => {
    consoleLogSpy.mockClear();
    setDebugLoggingEnabled(false);
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    try {
      service.armDeepCapture('tab-console', 'ses_console');
      const run = service.beginRun({
        sessionId: 'ses_console',
        diagnosticRunToken: service.claimDeepCapture('tab-console', 'ses_console'),
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenCodeTrace] [OpenCodian][OpenCodeTrace]'),
        'run.started',
        expect.objectContaining({ runId: run.runId }),
      );
      service.finishRun(run, 'completed');
    } finally {
      await service.dispose();
      setDebugLoggingEnabled(false);
    }
  });

  it('marks deep capture incomplete when descendant stability cannot be proven at foreground end', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    service.armDeepCapture('tab-descendant', 'ses_parent_deep');
    const run = service.beginRun({
      sessionId: 'ses_parent_deep',
      diagnosticRunToken: service.claimDeepCapture('tab-descendant', 'ses_parent_deep'),
    });
    service.linkChildSession(run, 'ses_child_deep', { relation: 'task' });
    service.finishRun(run, 'completed');

    const deep = await service.store.readDeepRun(run.runId ?? '');
    expect(deep).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'capture.association_incomplete' }),
      expect.objectContaining({
        name: 'run.finished',
        payload: expect.objectContaining({ state: 'incomplete' }),
      }),
    ]));
    expect(service.getCaptureState('tab-descendant')).toBe('off');
    await service.dispose();
  });

  it('stores runtime lifecycle in runtime JSONL and binds bootstrap evidence into the session trace', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    const bootstrap = service.beginBootstrap({ title: 'new session' });
    const bound = service.bindSession(bootstrap, 'ses_bootstrap');
    await service.store.flush();

    const runtime = await service.store.readRuntimeSegment(service.runtimeSegmentId);
    const structural = await service.store.readTrace(bound.traceId);
    expect(runtime).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'runtime.started', traceId: service.runtimeSegmentId }),
      expect.objectContaining({ name: 'session.bootstrap.started', traceId: service.runtimeSegmentId }),
    ]));
    expect(structural).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'session.bound',
        payload: expect.objectContaining({ bootstrapId: bootstrap.bootstrapId }),
      }),
    ]));
    await service.dispose();
  });

  it('builds a bounded, sanitized report for the most recent anomaly', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({
      settings: () => settings,
      buildIdentity: () => 'Build: test',
      knownSecrets: () => ['report-secret'],
    });
    const run = service.beginRun({
      sessionId: 'ses_report',
      provider: 'provider-report',
      model: 'model-report',
    });
    service.recordRuntime({
      channel: 'lifecycle',
      source: 'plugin',
      severity: 'info',
      name: 'credential.identity',
      payload: { fingerprints: ['hmac-report'] },
    });
    service.markAnomaly(run, 'mismatch', 'critical', { token: 'report-secret' });
    service.finishRun(run, 'error');

    const report = await service.reportBuilder.buildSmartReport(run.traceId, {
      actual: 'failed',
      expected: 'completed',
    });

    expect(report).toContain('# OpenCodian OpenCode Session Trace');
    expect(report).toContain('anomaly.mismatch');
    expect(report).toContain('Runtime events:');
    expect(report).toContain('Providers: provider-report');
    expect(report).toContain('Models: model-report');
    expect(report).toContain('Credential HMAC fingerprints: hmac-report');
    expect(report).toContain('Redaction stats:');
    expect(report).not.toContain('report-secret');
    expect(Buffer.byteLength(report)).toBeLessThanOrEqual(1024 * 1024);
    expect(service.store.listSummaries()[0]?.unreadAnomalyCount).toBe(0);
    expect(service.store.listSummaries()[0]?.highestUnreadSeverity).toBeUndefined();
    await service.dispose();
  });

  it('redacts macOS, Windows, and URI-encoded paths from clipboard-equivalent report text', async () => {
    const cases = [
      {
        name: 'mac',
        vaultPath: '/Volumes/SDD2T/obsidian-vault-write/testvault',
        variants: [
          '/Volumes/SDD2T/obsidian-vault-write/testvault',
          encodeURIComponent('/Volumes/SDD2T/obsidian-vault-write/testvault'),
          encodeURIComponent('/Volumes/SDD2T/obsidian-vault-write/testvault')
            .replace(/%[0-9A-F]{2}/g, (token) => token.toLowerCase()),
        ],
      },
      {
        name: 'windows',
        vaultPath: 'C:\\Users\\lt\\Desktop\\Write\\testvault',
        variants: [
          'C:\\Users\\lt\\Desktop\\Write\\testvault',
          'C:/Users/lt/Desktop/Write/testvault',
          encodeURIComponent('C:/Users/lt/Desktop/Write/testvault'),
          encodeURIComponent('C:\\Users\\lt\\Desktop\\Write\\testvault')
            .replace(/%[0-9A-F]{2}/g, (token) => token.toLowerCase()),
        ],
      },
    ];

    for (const testCase of cases) {
      const secret = `report-${testCase.name}-secret`;
      const settings = traceSettings(path.join(directory, testCase.name));
      const service = new OpenCodeSessionTraceService({
        settings: () => settings,
        vaultPath: testCase.vaultPath,
        knownSecrets: () => [secret],
      });
      const run = service.beginRun({ sessionId: `ses_report_${testCase.name}` });
      await service.store.flush();

      const report = await service.reportBuilder.buildSmartReport(run.traceId, {
        actual: `Actual ${testCase.variants[0]} ${secret}`,
        expected: `Expected ${testCase.variants[1]}`,
        reproduction: `Open ${testCase.variants.at(-1)} and reproduce`,
      });

      for (const variant of testCase.variants) {
        expect(report).not.toContain(variant);
      }
      expect(report).not.toContain(secret);
      expect(report).toContain('$VAULT');
      service.finishRun(run, 'completed');
      await service.dispose();
    }
  });

  it('tracks unread severity independently from historical severity and selects the highest unread trace', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    const historical = service.beginRun({ sessionId: 'ses_historical' });
    service.markAnomaly(historical, 'historical', 'critical');
    await service.reportBuilder.buildSmartReport(historical.traceId);
    service.markAnomaly(historical, 'new-warning', 'warning');

    const competing = service.beginRun({ sessionId: 'ses_competing' });
    service.markAnomaly(competing, 'new-critical', 'critical');
    const report = await service.reportBuilder.buildSmartReport();
    const historicalSummary = service.store.listSummaries(100)
      .find((summary) => summary.traceId === historical.traceId);

    expect(historicalSummary).toEqual(expect.objectContaining({
      highestSeverity: 'critical',
      highestUnreadSeverity: 'warning',
      unreadAnomalyCount: 1,
    }));
    expect(report).toContain(`Trace: ${competing.traceId}`);
    service.finishRun(historical, 'completed');
    service.finishRun(competing, 'completed');
    await service.dispose();
  });

  it('builds an explicit empty current-session report instead of selecting another trace', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    const otherRun = service.beginRun({ sessionId: 'ses_other_report' });
    service.markAnomaly(otherRun, 'must-not-copy', 'critical');
    await service.store.flush();

    const report = await service.reportBuilder.buildSmartReport(
      undefined,
      undefined,
      { selection: 'current-session' },
    );

    expect(report).toContain('Report scope: current-session');
    expect(report).toContain('Current session trace unavailable: true');
    expect(report).toContain('Trace: (none)');
    expect(report).not.toContain('anomaly.must-not-copy');
    service.finishRun(otherRun, 'completed');
    await service.dispose();
  });

  it('keeps a CJK-heavy smart report within the exact 1 MiB UTF-8 limit', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    service.armDeepCapture('tab-cjk', 'ses_cjk_report');
    const run = service.beginRun({
      sessionId: 'ses_cjk_report',
      diagnosticRunToken: service.claimDeepCapture('tab-cjk', 'ses_cjk_report'),
    });
    for (let index = 0; index < 24; index += 1) {
      service.recordNormalized(run, `large.cjk.${index}`, { text: '诊断内容'.repeat(20_000) });
    }
    service.finishRun(run, 'completed');

    const report = await service.reportBuilder.buildSmartReport(run.traceId);
    expect(Buffer.byteLength(report, 'utf8')).toBeLessThanOrEqual(1024 * 1024);
    expect(report).not.toContain('\uFFFD');
    await service.dispose();
  });

  it('exports structural, deep, runtime, and manifest files as a reviewable bundle', async () => {
    const settings = traceSettings(directory);
    const service = new OpenCodeSessionTraceService({ settings: () => settings });
    const token = service.armDeepCapture('tab-export', 'ses_export');
    const run = service.beginRun({
      sessionId: 'ses_export',
      prompt: 'export prompt',
      diagnosticRunToken: service.claimDeepCapture('tab-export', 'ses_export') ?? token,
    });
    service.recordRuntime({
      channel: 'lifecycle',
      source: 'server',
      severity: 'info',
      name: 'server.ready',
    });
    service.recordIngress(run, 'stream.ingress.sdk', { text: 'deep export payload' });
    service.finishRun(run, 'completed');
    await service.store.flush();

    const exportRoot = path.join(directory, 'exports');
    const bundle = await service.store.exportTraceBundle(run.traceId, exportRoot);
    const files = await fs.readdir(bundle);
    const manifest = JSON.parse(await fs.readFile(path.join(bundle, 'manifest.json'), 'utf8')) as {
      traceId: string;
      runIds: string[];
    };

    expect(files).toEqual(expect.arrayContaining([
      'manifest.json',
      'structural.jsonl',
      `deep-${run.runId}.jsonl`,
      `runtime-${service.runtimeSegmentId}.jsonl`,
    ]));
    expect(manifest).toMatchObject({ traceId: run.traceId, runIds: [run.runId] });
    await service.dispose();
  });

  it('ignores a crash-truncated final JSONL record during recovery', async () => {
    const store = new OpenCodeTraceStore(directory);
    store.append(event({ name: 'valid.before-crash' }));
    await store.flush();
    await fs.appendFile(
      path.join(directory, 'v1', 'structural', 'trace-1.jsonl'),
      '{"schemaVersion":1,"name":"partial',
    );

    await expect(store.readTrace('trace-1')).resolves.toEqual([
      expect.objectContaining({ name: 'valid.before-crash' }),
    ]);
    await store.dispose();
  });

  it('records a trace.dropped marker after queue overload recovers', async () => {
    const store = new OpenCodeTraceStore(directory);
    for (let index = 0; index < 4097; index += 1) {
      store.append(event({ monotonicSequence: index + 1, name: 'queued.event' }));
    }
    await store.flush();
    store.append(event({ monotonicSequence: 4098, name: 'accepted.after-overload' }));
    await store.flush();

    const events = await store.readTrace('trace-1');
    expect(store.getStatus().droppedEvents).toBeGreaterThan(0);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'trace.dropped' }),
      expect.objectContaining({ name: 'accepted.after-overload' }),
    ]));
    await store.dispose();
  });

  it('pauses foreground stall detection while OpenCode waits for a question reply', async () => {
    jest.useFakeTimers();
    try {
      const settings = traceSettings(directory);
      const service = new OpenCodeSessionTraceService({ settings: () => settings });
      const run = service.beginRun({ sessionId: 'ses_waiting' });
      service.recordSessionIngress('ses_waiting', 'stream.ingress.sdk', {
        type: 'question.asked',
        properties: { sessionID: 'ses_waiting' },
      });

      jest.advanceTimersByTime(180_000);
      await service.store.flush();
      expect((await service.store.readTrace(run.traceId)).some((item) =>
        item.name === 'anomaly.foreground_stalled')).toBe(false);

      service.recordSessionIngress('ses_waiting', 'stream.ingress.sdk', {
        type: 'question.replied',
        properties: { sessionID: 'ses_waiting' },
      });
      jest.advanceTimersByTime(60_000);
      await service.store.flush();
      expect((await service.store.readTrace(run.traceId)).some((item) =>
        item.name === 'anomaly.foreground_stalled')).toBe(true);
      service.finishRun(run, 'completed');
      await service.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the absolute deep-capture timeout active while interaction timers are paused', async () => {
    jest.useFakeTimers();
    try {
      const settings = traceSettings(directory);
      const service = new OpenCodeSessionTraceService({ settings: () => settings });
      service.armDeepCapture('tab-timeout', 'ses_timeout');
      const run = service.beginRun({
        sessionId: 'ses_timeout',
        diagnosticRunToken: service.claimDeepCapture('tab-timeout', 'ses_timeout'),
      });
      service.recordSessionIngress('ses_timeout', 'stream.ingress.sdk', {
        type: 'permission.asked',
        properties: { sessionID: 'ses_timeout' },
      });

      jest.advanceTimersByTime(30 * 60 * 1000);
      await service.store.flush();

      expect(await service.store.readDeepRun(run.runId ?? '')).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'run.finished',
          payload: expect.objectContaining({ state: 'incomplete' }),
        }),
      ]));
      await service.dispose();
    } finally {
      jest.useRealTimers();
    }
  });
});
