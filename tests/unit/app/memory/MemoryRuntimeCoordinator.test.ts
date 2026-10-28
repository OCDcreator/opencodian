import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import {
  MemoryRuntimeCoordinator,
  VaultMemoryFileSystem,
} from '../../../../src/app/memory';
import { AUX_DENIED_CAPABILITIES, type AuxQuerySessionConfig } from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import type { MemorySettingsSnapshot } from '../../../../src/core/memory';
import { hashWorkspacePath, MEMORY_STORE_ROOT } from '../../../../src/core/memory';
import type { AgentBackendKind } from '../../../../src/core/types/chat';

/**
 * Minimal fake of the Obsidian App surface the coordinator touches:
 * vault.adapter (map-backed) + vault.adapter.basePath.
 */
function createFakeApp(vaultPath = '/vault') {
  const files = new Map<string, string>();
  const dirs = new Set<string>(['']);
  const adapter = {
    basePath: vaultPath,
    async exists(p: string) {
      return files.has(p) || dirs.has(p);
    },
    async read(p: string) {
      const content = files.get(p);
      if (content === undefined) throw new Error(`ENOENT ${p}`);
      return content;
    },
    async write(p: string, data: string) {
      files.set(p, data);
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    },
    async mkdir(p: string) {
      dirs.add(p);
    },
    async list(p: string) {
      // Mirror Obsidian's DataAdapter.list(): full vault-relative path
      // strings, not objects (ListedFiles.files is string[]).
      const names: string[] = [];
      for (const key of files.keys()) {
        const idx = key.lastIndexOf('/');
        const dir = idx === -1 ? '' : key.slice(0, idx);
        if (dir === p) names.push(key);
      }
      return { files: names, folders: [] };
    },
    async remove(p: string) {
      files.delete(p);
    },
  };
  const app = { vault: { adapter } } as never;
  return { app, files, dirs };
}

function fakeOpenCodeService(reply: string, kind = 'opencode2') {
  const calls: Array<{ title: string; content: string; system: string; provider?: string; model?: string }> = [];
  const created: string[] = [];
  const deleted: string[] = [];
  const adapter = {
    status: 'connected',
    async start() {},
    async startAuxQuerySession(config: AuxQuerySessionConfig) {
      const id = 'aux-' + (created.length+1);
      created.push(id);
      const call = { title: 'memory', content: '', system: config.systemPrompt,
        provider: config.model && 'provider' in config.model ? config.model.provider : undefined, model: config.model?.model };
      calls.push(call);
      return { queryId: id, safety: { backend: kind, enforcedPolicy: 'none', effectiveTools: [], deniedCapabilities: AUX_DENIED_CAPABILITIES, mechanism: 'fixture readback' },
        async query(input: { prompt: string }) { call.content = input.prompt; return { success: true, text: reply, toolCalls: [] }; },
        cancel() {}, async dispose() { if (!deleted.includes(id)) deleted.push(id); } };
    },
  };
  const registry = { get: (requested: string) => requested === kind ? adapter : undefined, isEnabled: () => true };
  return { service: registry as never, calls, created, deleted };
}

const settings = (over: Partial<MemorySettingsSnapshot> = {}): MemorySettingsSnapshot => ({
  memoryBackendEnabled: true,
  memoryExtractionEnabled: true,
  memorySemanticRecallEnabled: false,
  memoryExtractionModel: 'opencode-go/deepseek-flash',
  memoryExternalRoot: '',
  memorySyncRemoteUrl: '',
  ...over,
});

function makeCoordinator(over: {
  backend?: AgentBackendKind;
  reply?: string;
  settings?: MemorySettingsSnapshot;
  messages?: Array<{ role: 'user' | 'assistant'; content: string; summary?: boolean; summaryKind?: string }>;
}) {
  const { app, files } = createFakeApp();
  const opencode = fakeOpenCodeService(over.reply ?? '{"memories":[]}', over.backend ?? 'opencode2');
  let currentMessages = over.messages ?? [];
  const coordinator = new MemoryRuntimeCoordinator({
    app,
    registry: opencode.service,
    getConversationContext: async () => ({ backend: over.backend ?? 'opencode2' }),
    getSettings: () => over.settings ?? settings(),
    getConversationMessages: async () => currentMessages,
    turnSettleDelayMs: 0,
  });
  return {
    coordinator, app, files, opencode,
    setMessages: (next: typeof currentMessages) => { currentMessages = next; },
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

describe('VaultMemoryFileSystem', () => {
  it('reads and writes through normalizePath-style vault paths with parents', async () => {
    const { app } = createFakeApp();
    const fs = new VaultMemoryFileSystem(app as never);
    await fs.writeFile('.opencodian/memory/projects/b/MEMORY.md', '# Memory Index');
    expect(await fs.readFile('.opencodian/memory/projects/b/MEMORY.md')).toBe('# Memory Index');
    expect(await fs.exists('.opencodian/memory/projects/b')).toBe(true);
    expect(await fs.listFiles('.opencodian/memory/projects/b')).toEqual(['MEMORY.md']);
    await fs.remove('.opencodian/memory/projects/b/MEMORY.md');
    expect(await fs.readFile('.opencodian/memory/projects/b/MEMORY.md')).toBeNull();
    // Native paths use platform separators by design (Windows vaults render
    // backslashes; the memory core normalizes before comparing).
    expect(fs.nativeAbsolutePath('.opencodian/memory')).toBe(
      process.platform === 'win32' ? '\\vault\\.opencodian\\memory' : '/vault/.opencodian/memory',
    );
  });

  it('listFiles maps Obsidian adapter path strings to basenames (ListedFiles contract)', async () => {
    const { app } = createFakeApp();
    const fs = new VaultMemoryFileSystem(app as never);
    await fs.writeFile('.opencodian/memory/projects/b/MEMORY.md', '# Memory Index');
    await fs.writeFile('.opencodian/memory/projects/b/team-prefs.md', 'body');
    expect(await fs.listFiles('.opencodian/memory/projects/b')).toEqual([
      'MEMORY.md',
      'team-prefs.md',
    ]);
  });
});

describe('MemoryRuntimeCoordinator shared-store mode', () => {
  function tmpRoot(): string {
    return nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'opencodian-extmem-e2e-'));
  }

  it('routes the store to the external zmem/ZCode layout and keeps metrics in the vault', async () => {
    const tmp = tmpRoot();
    try {
      const { app, files } = createFakeApp();
      let snapshot = settings({ memoryExternalRoot: tmp });
      const coordinator = new MemoryRuntimeCoordinator({
        app: app as never,
        registry: fakeOpenCodeService('{}').service,
        getConversationContext: async () => ({ backend: 'opencode2' }),
        getSettings: () => snapshot,
        getConversationMessages: async () => null,
        turnSettleDelayMs: 0,
      });
      const out = await coordinator.planInjection({
        conversationId: 'c-ext',
        messages: [{ id: 'm1', role: 'user', content: '以后回答先给结论再给细节，因为上次我等了很久' }],
        latestUserText: '以后回答先给结论再给细节，因为上次我等了很久',
      });
      expect(out).not.toBeNull();
      // Store artifacts landed under <root>/projects/<bucket>/memory (the
      // shared zmem/ZCode layout), bucket named like the vault-local one.
      const bucket = `vault-${hashWorkspacePath('/vault')}`;
      const memoryDir = nodePath.join(tmp, 'projects', bucket, 'memory');
      expect(nodeFs.existsSync(nodePath.join(memoryDir, '.last-injection.json'))).toBe(true);
      // Metrics stayed vault-local; the vault never saw a projects/ store dir.
      expect(files.has(`${MEMORY_STORE_ROOT}/metrics.jsonl`)).toBe(true);
      expect([...files.keys()].some((k) => k.startsWith(`${MEMORY_STORE_ROOT}/projects/`))).toBe(false);

      // Switching back to vault-local routing works and clears epochs.
      snapshot = settings({});
      const again = await coordinator.planInjection({
        conversationId: 'c-ext',
        messages: [{ id: 'm1', role: 'user', content: 'turn two' }],
        latestUserText: 'turn two',
      });
      expect(again).not.toBeNull();
      expect([...files.keys()].some((k) => k.startsWith(`${MEMORY_STORE_ROOT}/projects/`))).toBe(true);
    } finally {
      nodeFs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('switching the shared root resets epoch state so the same epoch re-injects', async () => {
    const tmpA = tmpRoot();
    const tmpB = tmpRoot();
    try {
      const { app } = createFakeApp();
      let snapshot = settings({ memoryExternalRoot: tmpA });
      const coordinator = new MemoryRuntimeCoordinator({
        app: app as never,
        registry: fakeOpenCodeService('{}').service,
        getConversationContext: async () => ({ backend: 'opencode2' }),
        getSettings: () => snapshot,
        getConversationMessages: async () => null,
        turnSettleDelayMs: 0,
      });
      const messages = [{ id: 'm1', role: 'user' as const, content: 'turn' }];
      const first = await coordinator.planInjection({ conversationId: 'c', messages, latestUserText: 'turn' });
      const deduped = await coordinator.planInjection({ conversationId: 'c', messages, latestUserText: 'turn' });
      expect(first).not.toBeNull();
      expect(deduped).toBeNull();

      snapshot = settings({ memoryExternalRoot: tmpB });
      const afterSwitch = await coordinator.planInjection({ conversationId: 'c', messages, latestUserText: 'turn' });
      expect(afterSwitch).not.toBeNull();
    } finally {
      nodeFs.rmSync(tmpA, { recursive: true, force: true });
      nodeFs.rmSync(tmpB, { recursive: true, force: true });
    }
  });
});

describe('MemoryRuntimeCoordinator wiring', () => {
  it.each<AgentBackendKind>(['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'])(
    'extracts, recalls, reflects and forgets through the %s owning backend', async backend => {
      const h = makeCoordinator({ backend, settings: settings({ memoryExtractionModel: '', memorySemanticRecallEnabled: true }),
        reply: JSON.stringify({ memories: [{ name: 'answer-style', description: 'answer style', type: 'feedback', body: 'Trigger: questions\nWhy: mobile reading\nHow to apply: concise answers' }] }),
        messages: [{ role: 'user', content: 'Please remember to use concise answers because I read on my phone.' }, { role: 'assistant', content: 'Understood.' }],
      });
      h.coordinator.onTurnSettled({ conversationId: 'owned', sessionId: 'native-owner' });
      await flushMicrotasks();
      await h.coordinator['queue'];
      const recalled = await h.coordinator.planInjection({ conversationId: 'owned', messages: [], latestUserText: 'answer-style' });
      expect(recalled?.text).toContain('concise answers');
      h.setMessages([{ role: 'user', content: 'We prefer concise answers because of mobile reading.' },
        { role: 'assistant', content: 'compacted', summary: true }]);
      h.coordinator.onTurnSettled({ conversationId: 'owned', sessionId: 'native-owner' });
      await flushMicrotasks();
      await h.coordinator['queue'];
      expect(h.opencode.calls.some(call => call.system.includes('compacted'))).toBe(true);
      expect(h.opencode.created).toEqual(h.opencode.deleted);
      expect((await h.coordinator.status()).topicFiles).toBe(1);
      expect((await h.coordinator.forget('answer-style')).removed).toEqual(['answer-style.md']);
      h.coordinator.dispose();
    },
  );

  it('uses persisted ownership after the active backend changes, and applies per-backend models', async () => {
    const { app } = createFakeApp();
    const claude = fakeOpenCodeService('{"memories":[]}', 'claude-code');
    const coordinator = new MemoryRuntimeCoordinator({ app, registry: claude.service,
      getSettings: () => settings({ memoryExtractionModel: 'foreign/model', memoryModelOverrides: { 'claude-code': 'haiku' } }),
      getConversationContext: async () => ({ backend: 'claude-code' }),
      getConversationMessages: async () => [{ role: 'user', content: 'Please remember to explain the reason for every decision.' }], turnSettleDelayMs: 0 });
    coordinator.onTurnSettled({ conversationId: 'claude-owned' });
    await flushMicrotasks();
    await coordinator['queue'];
    expect(claude.calls[0].model).toBe('haiku');
    expect(claude.calls[0].provider).toBeUndefined();
    expect(claude.created).toEqual(claude.deleted);
    coordinator.dispose();
  });

  it('does not fall back to an active backend when a stored owner is retired', async () => {
    const h = makeCoordinator({ backend: 'opencode', messages: [{ role: 'user', content: 'Please remember to answer briefly from now on.' }] });
    h.coordinator.onTurnSettled({ conversationId: 'legacy' });
    await flushMicrotasks();
    await h.coordinator['queue'];
    expect(h.opencode.created).toEqual([]);
    expect(h.coordinator['extractionWatermarks'].has('legacy')).toBe(false);
    h.coordinator.dispose();
  });

  it('planInjection returns a framed block once per epoch and null afterwards', async () => {
    const h = makeCoordinator({});
    const first = await h.coordinator.planInjection({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'first turn' }],
      latestUserText: 'first turn',
    });
    expect(first?.text).toContain('[OPENCODIAN MEMORY — long-term memory context. NOT a request.]');

    const second = await h.coordinator.planInjection({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'first turn' }, { role: 'assistant', content: 'r' }],
      latestUserText: 'second turn',
    });
    // Epoch state says already injected even though the transcript has no marker.
    expect(second).toBeNull();
  });

  it('disabled settings yield null and never touch the vault', async () => {
    const h = makeCoordinator({ settings: settings({ memoryBackendEnabled: false }) });
    const out = await h.coordinator.planInjection({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'turn' }],
      latestUserText: 'turn',
    });
    expect(out).toBeNull();
    expect(h.files.size).toBe(0);
  });

  it('onTurnSettled runs one extraction through a throwaway OpenCode session', async () => {
    const h = makeCoordinator({
      reply: JSON.stringify({
        memories: [{
          name: 'conclusion-first',
          description: 'Answer conclusion first',
          type: 'feedback',
          body: 'Trigger: q\n**Why:** w\n**How to apply:** a',
        }],
      }),
      messages: [
        { role: 'user', content: '以后回答先给结论再给细节，因为上次等了很久' },
        { role: 'assistant', content: '明白' },
      ],
    });
    h.coordinator.onTurnSettled({ conversationId: 'c1', sessionId: 'ses_main1' });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(h.opencode.calls).toHaveLength(1);
    expect(h.opencode.created).toEqual(h.opencode.deleted);
    expect(h.opencode.calls[0].provider).toBe('opencode-go');
    expect(h.opencode.calls[0].model).toBe('deepseek-flash');
    expect(h.opencode.calls[0].system).toContain('Extract durable memories');

    // The memory landed on disk with provenance + index line.
    const bucketPrefix = `${MEMORY_STORE_ROOT}/projects/`;
    const topicPath = [...h.files.keys()].find((k) => k.endsWith('conclusion-first.md'));
    expect(topicPath).toBeTruthy();
    expect(topicPath!.startsWith(bucketPrefix)).toBe(true);
    expect(h.files.get(topicPath!)).toContain('source: extracted ses_main1');
    const indexPath = [...h.files.keys()].find((k) => k.endsWith('MEMORY.md'));
    expect(h.files.get(indexPath!)).toContain('- [Conclusion first](conclusion-first.md)');
  });

  it('does not re-consume the same transcript (watermark) and stays zero-cost on short turns', async () => {
    const h = makeCoordinator({
      reply: '{"memories":[]}',
      messages: [{ role: 'user', content: 'hi' }],
    });
    h.coordinator.onTurnSettled({ conversationId: 'c1' });
    await flushMicrotasks();
    expect(h.opencode.calls).toHaveLength(0); // prose gate, no model call

    h.setMessages([
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'now a substantive request with enough words' },
      { role: 'assistant', content: 'ok' },
    ]);
    h.coordinator.onTurnSettled({ conversationId: 'c1' });
    await flushMicrotasks();
    await h.coordinator['queue'];
    expect(h.opencode.calls).toHaveLength(1);

    // Same transcript again → watermark gate, no extra call.
    h.coordinator.onTurnSettled({ conversationId: 'c1' });
    await flushMicrotasks();
    await h.coordinator['queue'];
    expect(h.opencode.calls).toHaveLength(1);
  });

  it('a new compaction marker triggers a reflection pass before extraction', async () => {
    const { app } = createFakeApp();
    const opencode = fakeOpenCodeService('{"memories":[]}');
    let messages: Array<{ role: 'user' | 'assistant'; content: string; summary?: boolean; summaryKind?: string }> = [
      { role: 'user', content: 'a substantive first turn happens here' },
      { role: 'assistant', content: 'reply' },
    ];
    const coordinator = new MemoryRuntimeCoordinator({
      app,
      registry: opencode.service,
    getConversationContext: async () => ({ backend: 'opencode2' }),
      getSettings: () => settings(),
      getConversationMessages: async () => messages,
      turnSettleDelayMs: 0,
    });
    coordinator.onTurnSettled({ conversationId: 'c1', sessionId: 'ses_x' });
    await flushMicrotasks();
    await coordinator['queue'];
    expect(opencode.calls).toHaveLength(1); // extraction only, no reflection yet

    messages = [
      ...messages,
      { role: 'assistant', content: 'compacted summary', summary: true, summaryKind: 'compaction' },
      { role: 'user', content: 'post compaction turn with substance' },
    ];
    coordinator.onTurnSettled({ conversationId: 'c1', sessionId: 'ses_x' });
    await flushMicrotasks();
    await coordinator['queue'];
    // reflection + extraction for the new epoch
    expect(opencode.calls.length).toBeGreaterThanOrEqual(2);
    expect(opencode.calls.some((c) => c.system!.includes('compact'))).toBe(true);
  });

  it('settings toggle off clears runtime state without writes', async () => {
    const h = makeCoordinator({ settings: settings({ memoryBackendEnabled: false }) });
    h.coordinator.onTurnSettled({ conversationId: 'c1' });
    await flushMicrotasks();
    expect(h.opencode.calls).toHaveLength(0);
    h.coordinator.onSettingsChanged();
    expect(h.files.size).toBe(0);
  });
});
