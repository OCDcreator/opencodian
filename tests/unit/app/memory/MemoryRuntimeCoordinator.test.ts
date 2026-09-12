import {
  MemoryRuntimeCoordinator,
  VaultMemoryFileSystem,
} from '../../../../src/app/memory';
import type { MemorySettingsSnapshot } from '../../../../src/core/memory';
import { MEMORY_STORE_ROOT } from '../../../../src/core/memory';

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
      const names: { path: string }[] = [];
      for (const key of files.keys()) {
        const idx = key.lastIndexOf('/');
        const dir = idx === -1 ? '' : key.slice(0, idx);
        if (dir === p) names.push({ path: key });
      }
      return { files: names };
    },
    async remove(p: string) {
      files.delete(p);
    },
  };
  const app = { vault: { adapter } } as never;
  return { app, files, dirs };
}

function fakeOpenCodeService(reply: string) {
  const calls: Array<{ title: string; content: string; system?: string; provider?: string; model?: string }> = [];
  let nextSession = 0;
  const created: string[] = [];
  const deleted: string[] = [];
  const service = {
    async createSession(title: string, options?: { setCurrent?: boolean }) {
      expect(options?.setCurrent).toBe(false);
      const id = `mem-session-${++nextSession}`;
      created.push(id);
      calls.push({ title, content: '' });
      return id;
    },
    async deleteSession(id: string) {
      deleted.push(id);
    },
    async requestAssistantResponse(content: string, options?: Record<string, unknown>) {
      const last = calls[calls.length - 1];
      if (last) {
        last.content = content;
        last.system = options?.system as string | undefined;
        last.provider = options?.provider as string | undefined;
        last.model = options?.model as string | undefined;
      }
      return { id: 'assistant-1', role: 'assistant', content: reply, timestamp: Date.now() };
    },
  };
  return { service: service as never, calls, created, deleted };
}

const settings = (over: Partial<MemorySettingsSnapshot> = {}): MemorySettingsSnapshot => ({
  memoryBackendEnabled: true,
  memoryExtractionEnabled: true,
  memorySemanticRecallEnabled: false,
  memoryExtractionModel: 'opencode-go/deepseek-flash',
  ...over,
});

function makeCoordinator(over: {
  reply?: string;
  settings?: MemorySettingsSnapshot;
  messages?: Array<{ role: 'user' | 'assistant'; content: string; summary?: boolean; summaryKind?: string }>;
}) {
  const { app, files } = createFakeApp();
  const opencode = fakeOpenCodeService(over.reply ?? '{"memories":[]}');
  let currentMessages = over.messages ?? [];
  const coordinator = new MemoryRuntimeCoordinator({
    app,
    openCodeService: opencode.service,
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
    expect(fs.nativeAbsolutePath('.opencodian/memory')).toBe('/vault/.opencodian/memory');
  });
});

describe('MemoryRuntimeCoordinator wiring', () => {
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
    expect(h.opencode.calls[0].system).toContain('distill durable memories');

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
    expect(h.opencode.calls).toHaveLength(1);

    // Same transcript again → watermark gate, no extra call.
    h.coordinator.onTurnSettled({ conversationId: 'c1' });
    await flushMicrotasks();
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
      openCodeService: opencode.service,
      getSettings: () => settings(),
      getConversationMessages: async () => messages,
      turnSettleDelayMs: 0,
    });
    coordinator.onTurnSettled({ conversationId: 'c1', sessionId: 'ses_x' });
    await flushMicrotasks();
    expect(opencode.calls).toHaveLength(1); // extraction only, no reflection yet

    messages = [
      ...messages,
      { role: 'assistant', content: 'compacted summary', summary: true, summaryKind: 'compaction' },
      { role: 'user', content: 'post compaction turn with substance' },
    ];
    coordinator.onTurnSettled({ conversationId: 'c1', sessionId: 'ses_x' });
    await flushMicrotasks();
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
