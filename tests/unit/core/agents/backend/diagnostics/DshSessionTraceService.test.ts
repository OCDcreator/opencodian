import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { DshSessionTraceService, MAX_BUDGET_ENTRIES, MAX_EVENTS_PER_TRACE, MAX_SOURCE_REGISTRATIONS, projectDshTraceLedger } from '../../../../../../src/core/agents/backend/diagnostics/DshSessionTraceService';
import { DSH_TRACE_CHANNEL_IDS, type DshSessionTraceSettings, type DshTraceEventV1 } from '../../../../../../src/core/agents/backend/diagnostics/types';
import type { DshWireRecord } from '../../../../../../src/core/agents/backend/dsh/DshAcpClient';

function traceSettings(storageDirectory: string, overrides: Partial<DshSessionTraceSettings> = {}): DshSessionTraceSettings {
  return {
    nativeEnabled: true,
    acpEnabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(DSH_TRACE_CHANNEL_IDS.map((id) => [id, false])) as DshSessionTraceSettings['consoleChannels'],
    storageDirectory,
    ...overrides,
  };
}

function nativePromptRequest(requestId: number, sessionId: string): DshWireRecord {
  return { direction: 'out', kind: 'request', method: 'session/prompt', requestId, sessionId, bytes: 40, transport: 'native' };
}

function nativePromptResponse(requestId: number, sessionId: string, ok: boolean, durationMs: number): DshWireRecord {
  return { direction: 'in', kind: 'response', method: 'session/prompt', requestId, sessionId, ok, durationMs, bytes: 12, transport: 'native' };
}

describe('projectDshTraceLedger', () => {
  const base = {
    schemaVersion: 1 as const,
    runtimeSegmentId: 'rt',
    transport: 'native' as const,
    channel: 'lifecycle' as const,
    source: 'plugin' as const,
    severity: 'info' as const,
  };

  function event(name: string, sessionId: string | undefined, payload?: unknown, metrics?: Record<string, number>): DshTraceEventV1 {
    return {
      ...base,
      timestamp: `2026-01-01T00:00:${String(events.length).padStart(2, '0')}.000Z`,
      monotonicSequence: ++events.length,
      traceId: sessionId ? 'trace-a' : 'rt',
      sessionId,
      name,
      ...(payload !== undefined ? { payload } : {}),
      ...(metrics ? { metrics } : {}),
      payloadRef: { kind: 'inline' },
    };
  }

  const events: DshTraceEventV1[] = [];

  beforeEach(() => {
    events.length = 0;
  });

  it('keeps chat/tool/turn rows readable and leaves protocol noise counted but unlisted', () => {
    const ledger = projectDshTraceLedger([
      event('turn.started', 's1', { requestId: 1 }),
      event('update.agent_message_chunk.delta', 's1', { sessionUpdate: 'agent_message_chunk' }),
      event('wire.request', undefined, { method: 'session/list' }),
      event('update.usage_update', 's1', { sessionUpdate: 'usage_update', usedTokens: 900, contextWindow: 32_000 }),
    ]);
    expect(ledger.entries.map((entry) => entry.name)).toEqual(['turn.started', 'update.usage_update']);
    expect(ledger.timing.eventCount).toBe(3);
    expect(ledger.timing.observedTurnCount).toBe(1);
  });

  it('reports the last client round trip and never invents one', () => {
    const withTurn = projectDshTraceLedger([
      event('turn.started', 's1'),
      event('turn.finished', 's1', { state: 'completed' }, { clientRoundTripMs: 2400 }),
    ]);
    expect(withTurn.timing.lastTurnClientRoundTripMs).toBe(2400);
    const row = withTurn.entries.find((entry) => entry.name === 'turn.finished');
    expect(row?.durationMs).toBe(2400);
    expect(row?.durationKind).toBe('client-round-trip');
    const withoutTurn = projectDshTraceLedger([event('turn.started', 's1')]);
    expect(withoutTurn.timing.lastTurnClientRoundTripMs).toBeUndefined();
  });

  it('pairs an observed tool span only when both ends share session, call id, and clock source', () => {
    const bothClientClock = projectDshTraceLedger([
      event('update.tool_call', 's1', { sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'ls' }),
      event('update.tool_call_update', 's1', { sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'completed' }),
    ]);
    const spanRow = bothClientClock.entries.find((entry) => entry.name === 'update.tool_call_update');
    expect(spanRow?.durationMs).toBe(1000);
    expect(spanRow?.durationKind).toBe('observed-tool-span');
    const missingEnd = projectDshTraceLedger([
      event('update.tool_call', 's1', { sessionUpdate: 'tool_call', toolCallId: 'c2', title: 'ls' }),
    ]);
    expect(missingEnd.entries.find((entry) => entry.name === 'update.tool_call')?.durationMs).toBeUndefined();
    const unknownCall = projectDshTraceLedger([
      event('update.tool_call', 's1', { sessionUpdate: 'tool_call', toolCallId: 'c3' }),
      event('update.tool_call_update', 's1', { sessionUpdate: 'tool_call_update', toolCallId: 'c4', status: 'completed' }),
    ]);
    expect(unknownCall.entries.find((entry) => entry.name === 'update.tool_call_update')?.durationMs).toBeUndefined();
  });

  it('labels every row client-observed even when the update envelope carried a backend time', () => {
    const ledger = projectDshTraceLedger([
      event('update.tool_call', 's1', { sessionUpdate: 'tool_call', toolCallId: 'c9', title: 'ls', backendTimeMs: 1760000000000 }),
    ]);
    expect(ledger.entries[0]?.timeSource).toBe('client');
    const clientOnly = projectDshTraceLedger([event('turn.started', 's1')]);
    expect(clientOnly.entries[0]?.timeSource).toBe('client');
  });
});

describe('DshSessionTraceService', () => {
  let dir: string;
  let service: DshSessionTraceService;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-dsh-trace-'));
    service = new DshSessionTraceService({ settings: () => traceSettings(dir) });
  });
  afterEach(async () => {
    await service.dispose();
    // Retained on purpose: this round forbids test-side deletion; the
    // synthetic tmp evidence dirs under os.tmpdir() stay for inspection.
  });

  async function eventsFor(target: DshSessionTraceService, sessionId: string): Promise<DshTraceEventV1[]> {
    await target.store.flush();
    const traceId = target.resolveTraceId(sessionId);
    if (!traceId) return [];
    return target.store.readTrace(traceId);
  }

  it('derives the whole turn lifecycle from wire records with client round-trip metrics', async () => {
    service.recordWireEvent(nativePromptRequest(7, 'sess-turn'));
    service.recordWireEvent(nativePromptResponse(7, 'sess-turn', true, 4321));
    const events = await eventsFor(service, 'sess-turn');
    const started = events.find((event) => event.name === 'turn.started');
    const finished = events.find((event) => event.name === 'turn.finished');
    expect(started).toBeDefined();
    expect(finished?.metrics?.clientRoundTripMs).toBe(4321);
    // An RPC-ok envelope is a receipt, not proof of model completion.
    expect((finished?.payload as { state?: string }).state).toBe('response-received');
  });

  it('does not fabricate a turn finish when only one end was observed', async () => {
    service.recordWireEvent({ direction: 'in', kind: 'response', method: 'session/prompt', requestId: 99, sessionId: 'sess-late', ok: true, durationMs: 5, bytes: 1, transport: 'native' });
    const events = await eventsFor(service, 'sess-late');
    expect(events.find((event) => event.name === 'turn.finished')).toBeUndefined();
    expect(events.find((event) => event.name === 'turn.started')).toBeUndefined();
  });

  it('gates native and acp transports independently', async () => {
    const gated = new DshSessionTraceService({ settings: () => traceSettings(path.join(dir, 'gated'), { nativeEnabled: false }) });
    try {
      gated.recordWireEvent(nativePromptRequest(1, 'sess-native-off'));
      gated.recordWireEvent({ direction: 'out', kind: 'request', method: 'session/prompt', requestId: 2, sessionId: 'sess-acp-on', bytes: 8, transport: 'acp' });
      expect(await eventsFor(gated, 'sess-native-off')).toEqual([]);
      const acpEvents = await eventsFor(gated, 'sess-acp-on');
      expect(acpEvents.map((event) => event.name)).toContain('turn.started');
    } finally {
      await gated.dispose();
    }
  });

  it('splits parent and subagent sessions by their real ids', async () => {
    service.recordWireEvent(nativePromptRequest(10, 'parent'));
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'session/update', sessionId: 'child', sessionUpdate: 'agent_message_chunk', bytes: 30, transport: 'native', detail: { sessionUpdate: 'agent_message_chunk' } });
    const parentNames = (await eventsFor(service, 'parent')).map((event) => event.name);
    const childNames = (await eventsFor(service, 'child')).map((event) => event.name);
    expect(parentNames).toContain('turn.started');
    expect(parentNames).not.toContain('update.agent_message_chunk.delta');
    expect(childNames).toContain('update.agent_message_chunk.delta');
    expect(childNames).not.toContain('turn.started');
    expect(service.resolveTraceId('parent')).not.toBe(service.resolveTraceId('child'));
  });

  it('drops late records from a dead transport until a fresh connection starts', async () => {
    service.recordWireEvent({ direction: 'in', kind: 'connection', method: 'connected', bytes: 0, transport: 'native' });
    service.recordWireEvent(nativePromptRequest(20, 'sess-dead'));
    service.recordWireEvent({ direction: 'in', kind: 'connection', method: 'closed', bytes: 0, transport: 'native', error: 'process exited' });
    service.recordWireEvent(nativePromptRequest(21, 'sess-after-death'));
    const afterDeath = await eventsFor(service, 'sess-after-death');
    expect(afterDeath).toEqual([]);
    service.recordWireEvent({ direction: 'out', kind: 'connection', method: 'starting', bytes: 0, transport: 'native' });
    service.recordWireEvent(nativePromptRequest(22, 'sess-revived'));
    const revived = await eventsFor(service, 'sess-revived');
    expect(revived.map((event) => event.name)).toContain('turn.started');
  });

  it('fails open turns as incomplete on transport death with no synthesized duration', async () => {
    service.recordWireEvent(nativePromptRequest(30, 'sess-dying'));
    service.recordWireEvent({ direction: 'in', kind: 'connection', method: 'error', bytes: 0, transport: 'native', error: 'boom' });
    const events = await eventsFor(service, 'sess-dying');
    const finished = events.find((event) => event.name === 'turn.finished');
    expect(finished).toBeDefined();
    expect((finished?.payload as { state?: string }).state).toBe('incomplete');
    expect(finished?.metrics?.clientRoundTripMs).toBeUndefined();
  });

  it('never stores control-read or update content beyond whitelisted metadata', async () => {
    service.recordWireEvent({ direction: 'out', kind: 'request', method: 'session/list', requestId: 40, bytes: 500, transport: 'native' });
    service.recordWireEvent({
      direction: 'in', kind: 'notification', method: 'session/update', sessionId: 'sess-meta',
      sessionUpdate: 'tool_call', bytes: 4000, transport: 'native',
      detail: { sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'rm -rf /tmp/x && echo sk-abcdefghijklmnop1234' },
    });
    const events = await eventsFor(service, 'sess-meta');
    const control = events.find((event) => event.name === 'wire.request');
    expect(control).toBeUndefined();
    const toolRow = events.find((event) => event.name === 'update.tool_call');
    const payloadKeys = Object.keys((toolRow?.payload ?? {}) as Record<string, unknown>);
    expect(payloadKeys).not.toContain('rawInput');
    expect(payloadKeys).not.toContain('content');
    const title = (toolRow?.payload as { title?: string }).title ?? '';
    expect(title).not.toContain('sk-abcdefghijklmnop1234');
    const ledger = await service.readSessionLedger('sess-meta');
    expect(ledger?.entries.map((entry) => entry.name)).toEqual(['update.tool_call']);
    expect(ledger?.entries[0]?.detail).not.toContain('sk-abcdefghijklmnop1234');
  });

  it('never stores or mirrors free-form storage failure text', async () => {
    const sentinel = 'an ordinary storage failure with fixture-only words';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const store = service.store as unknown as { degradedListener(error: unknown): void };
      store.degradedListener(new Error(sentinel));
      await service.store.flush();
      const runtimeId = (service as unknown as { runtimeSegmentId: string }).runtimeSegmentId;
      const traces = await service.store.readRuntimeSegment(runtimeId);
      expect(traces.some(event => event.name === 'trace.storage_degraded')).toBe(true);
      expect(JSON.stringify({ traces, console: [warn.mock.calls, error.mock.calls] })).not.toContain(sentinel);
    } finally { warn.mockRestore(); error.mockRestore(); }
  });

  it('reports registry saturation after enabling even when it filled while capture was disabled', async () => {
    const settings = traceSettings(path.join(dir, 'disabled-full'), { nativeEnabled: false, acpEnabled: false });
    const target = new DshSessionTraceService({ settings: () => settings });
    try {
      for (let i = 0; i <= MAX_SOURCE_REGISTRATIONS; i++) target.recordWireEvent({ direction: 'out', kind: 'connection',
        method: 'starting', sourceId: `disabled-source-${i}`, generation: 1, bytes: 0, transport: 'native' });
      settings.nativeEnabled = true;
      target.recordWireEvent({ ...nativePromptRequest(1, 'rejected-at-cap'), sourceId: `disabled-source-${MAX_SOURCE_REGISTRATIONS}`, generation: 1 });
      expect(await target.readSessionLedger('rejected-at-cap')).toMatchObject({ entries: [], limited: true });
    } finally { await target.dispose(); }
  });

  it('never reopens a capped trace after other traces fill its budget registry', async () => {
    const identity = { sourceId: 'budget-source', generation: 1, transport: 'native' as const, bytes: 1 };
    service.recordWireEvent({ ...identity, direction: 'out', kind: 'connection', method: 'starting' });
    const update = (sessionId: string): DshWireRecord => ({ ...identity, direction: 'in', kind: 'notification',
      method: 'session/update', sessionId, sessionUpdate: 'usage_update', detail: { usedTokens: 1 } });
    for (let i = 0; i < MAX_EVENTS_PER_TRACE + 5; i++) service.recordWireEvent(update('capped-session'));
    const before = await eventsFor(service, 'capped-session');
    expect(before).toHaveLength(MAX_EVENTS_PER_TRACE + 1);
    expect(before.filter(event => event.name === 'trace.session_limit')).toHaveLength(1);
    for (let i = 0; i < MAX_BUDGET_ENTRIES + 2; i++) service.recordWireEvent(update(`other-session-${i}`));
    service.recordWireEvent(update('capped-session'));
    expect(await eventsFor(service, 'capped-session')).toHaveLength(before.length);
    expect((await service.readSessionLedger('capped-session'))?.limited).toBe(true);
    expect((await service.readSessionLedger('not-recorded-after-cap'))?.limited).toBe(true);
  });

  it('never revives a closed source generation with a repeated start or connected record', async () => {
    const source = { sourceId: 'source-lifecycle', generation: 1, transport: 'native' as const, bytes: 0 };
    service.recordWireEvent({ ...source, direction: 'out', kind: 'connection', method: 'starting' });
    service.recordWireEvent({ ...source, direction: 'in', kind: 'connection', method: 'closed' });
    service.recordWireEvent({ ...source, direction: 'out', kind: 'connection', method: 'starting' });
    service.recordWireEvent({ ...source, direction: 'in', kind: 'connection', method: 'connected' });
    service.recordWireEvent({ ...nativePromptRequest(1, 'closed-generation'), ...source });
    expect(await eventsFor(service, 'closed-generation')).toEqual([]);
    const next = { ...source, generation: 2 };
    service.recordWireEvent({ ...next, direction: 'out', kind: 'connection', method: 'starting' });
    service.recordWireEvent({ ...nativePromptRequest(1, 'new-generation'), ...next });
    expect((await eventsFor(service, 'new-generation')).map(event => event.name)).toContain('turn.started');
  });

  it('registers a source while capture is disabled so enabling can record its current generation', async () => {
    const settings = traceSettings(path.join(dir, 'late-enabled'), { nativeEnabled: false, acpEnabled: false });
    const target = new DshSessionTraceService({ settings: () => settings });
    const source = { sourceId: 'late-enabled-source', generation: 1, transport: 'native' as const, bytes: 0 };
    try {
      target.recordWireEvent({ ...source, direction: 'out', kind: 'connection', method: 'starting' });
      expect(await eventsFor(target, 'late-enabled-session')).toEqual([]);
      settings.nativeEnabled = true;
      target.recordWireEvent({ ...nativePromptRequest(1, 'late-enabled-session'), ...source });
      target.recordWireEvent({ ...nativePromptResponse(1, 'late-enabled-session', true, 12), ...source });
      await target.store.flush();
      expect((await target.readSessionLedger('late-enabled-session'))?.timing.lastTurnClientRoundTripMs).toBe(12);
    } finally { await target.dispose(); }
  });

  it('reads the ledger per explicit session id and returns null for unknown sessions', async () => {
    expect(await service.readSessionLedger('never-bound')).toBeNull();
    service.recordWireEvent(nativePromptRequest(50, 'sess-ledger'));
    service.recordWireEvent(nativePromptResponse(50, 'sess-ledger', true, 250));
    const ledger = await service.readSessionLedger('sess-ledger');
    expect(ledger).not.toBeNull();
    expect(ledger?.timing.observedTurnCount).toBe(1);
    expect(ledger?.timing.lastTurnClientRoundTripMs).toBe(250);
    expect(await service.readSessionLedger('  ')).toBeNull();
  });
});
