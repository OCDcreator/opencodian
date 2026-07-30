import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CodexSessionTraceService } from '../../../../../../src/core/agents/backend/diagnostics/CodexSessionTraceService';
import { CODEX_TRACE_CHANNEL_IDS, type CodexSessionTraceSettings } from '../../../../../../src/core/agents/backend/diagnostics/types';

function traceSettings(storageDirectory: string): CodexSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CODEX_TRACE_CHANNEL_IDS.map((id) => [id, false])) as CodexSessionTraceSettings['consoleChannels'],
    storageDirectory,
    captureContent: true,
  };
}

describe('CodexWireTraceBridge', () => {
  it('measures wire payload size in UTF-8 bytes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-wire-'));
    const service = new CodexSessionTraceService({ settings: () => traceSettings(directory) });
    try {
      const params = { threadId: 'thread-byte-size', prompt: '你好🙂' };
      service.bindThread({ threadId: 'thread-byte-size', resumed: false, via: 'app-server' });
      service.wireBridge.onRequest({ id: 1, method: 'turn/start', params });
      await service.store.flush();
      const events = await service.store.readTrace(service.store.resolveTraceId('thread-byte-size') as string);
      const request = events.find((event) => event.name === 'wire.request');
      expect(request?.metrics?.bytes).toBe(Buffer.byteLength(JSON.stringify(params), 'utf8'));
    } finally {
      await service.dispose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('associates response and server reply ids with their originating thread', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-wire-'));
    const service = new CodexSessionTraceService({ settings: () => traceSettings(directory) });
    try {
      service.bindThread({ threadId: 'thread-rpc', resumed: false, via: 'app-server' });
      service.wireBridge.onRequest({ id: 1, method: 'turn/start', params: { threadId: 'thread-rpc' } });
      service.wireBridge.onResponse({ id: 1, ok: true, durationMs: 3 });
      service.wireBridge.onServerRequest({ id: 'approval-1', method: 'execCommandApproval', params: { threadId: 'thread-rpc' } });
      service.wireBridge.onServerReply({ id: 'approval-1', ok: true });
      await service.store.flush();
      const events = await service.store.readTrace(service.store.resolveTraceId('thread-rpc') as string);
      expect(events.find((event) => event.name === 'wire.response')?.sessionId).toBe('thread-rpc');
      expect(events.find((event) => event.name === 'wire.server-reply')?.sessionId).toBe('thread-rpc');
    } finally {
      await service.dispose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not drain another thread when an unknown response fails', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-wire-'));
    const service = new CodexSessionTraceService({ settings: () => traceSettings(directory) });
    try {
      service.bindThread({ threadId: 'thread-a', resumed: false, via: 'app-server' });
      service.bindThread({ threadId: 'thread-b', resumed: false, via: 'app-server', tabId: 'tab-b' });
      service.wireBridge.onRequest({ id: 2, method: 'turn/start', params: { threadId: 'thread-b', prompt: 'belongs-to-b' } });
      service.wireBridge.onResponse({ id: 999, ok: false, durationMs: 4, error: 'unknown request' });

      service.armDeepCapture('tab-b', 'thread-b');
      const token = service.claimDeepCapture('tab-b', 'thread-b');
      const turn = service.beginTurn({ threadId: 'thread-b', turnId: 'turn-b', tabId: 'tab-b', diagnosticRunToken: token });
      await service.store.flush();
      const deep = await service.store.readDeepRun(turn.runId as string);
      expect(JSON.stringify(deep)).toContain('belongs-to-b');
    } finally {
      await service.dispose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('clears request ownership on connection close before a late failure response', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-wire-'));
    const service = new CodexSessionTraceService({ settings: () => traceSettings(directory) });
    try {
      service.bindThread({ threadId: 'thread-closed', resumed: false, via: 'app-server', tabId: 'tab-closed' });
      service.wireBridge.onRequest({ id: 3, method: 'turn/start', params: { threadId: 'thread-closed', prompt: 'survives-late-response' } });
      service.wireBridge.onConnection({ state: 'closed' });
      service.wireBridge.onResponse({ id: 3, ok: false, durationMs: 2, error: 'late response' });

      service.armDeepCapture('tab-closed', 'thread-closed');
      const token = service.claimDeepCapture('tab-closed', 'thread-closed');
      const turn = service.beginTurn({ threadId: 'thread-closed', turnId: 'turn-closed', tabId: 'tab-closed', diagnosticRunToken: token });
      await service.store.flush();
      expect(JSON.stringify(await service.store.readDeepRun(turn.runId as string))).toContain('survives-late-response');
    } finally {
      await service.dispose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('dynamically declines service output while disabled and accepts it after re-enabling', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-wire-'));
    let enabled = false;
    const service = new CodexSessionTraceService({ settings: () => ({ ...traceSettings(directory), enabled }) });
    try {
      expect(service.wireBridge.onServiceOutput({ stream: 'stderr', text: 'disabled-output' })).toBe(false);
      enabled = true;
      expect(service.wireBridge.onServiceOutput({ stream: 'stderr', text: 'enabled-output' })).toBe(true);
      await service.store.flush();
      const events = await service.store.readRuntimeSegment(service.runtimeSegmentId);
      expect(JSON.stringify(events)).toContain('enabled-output');
      expect(JSON.stringify(events)).not.toContain('disabled-output');
    } finally {
      await service.dispose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
