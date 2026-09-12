import { MemoryBackendService } from '../../../../src/core/memory/MemoryBackendService';
import { InMemoryMemoryFileSystem } from '../../../../src/core/memory/memoryFileSystem';
import { MEMORY_INJECTION_OPEN_MARKER } from '../../../../src/core/memory/memoryProtocol';
import type {
  MemoryModelInvoker,
  MemorySettingsSnapshot,
  MemoryTranscriptMessage,
} from '../../../../src/core/memory/memoryTypes';

const settings = (over: Partial<MemorySettingsSnapshot> = {}): MemorySettingsSnapshot => ({
  memoryBackendEnabled: true,
  memoryExtractionEnabled: true,
  memorySemanticRecallEnabled: false,
  memoryExtractionModel: 'opencode-go/deepseek-flash',
  ...over,
});

function msg(partial: Partial<MemoryTranscriptMessage> & { role: 'user' | 'assistant'; content: string }): MemoryTranscriptMessage {
  return { id: `m${Math.random().toString(36).slice(2)}`, timestamp: Date.now(), ...partial };
}

function fakeInvoker(reply: string): MemoryModelInvoker & { calls: number } {
  const invoker = {
    calls: 0,
    async invoke() {
      invoker.calls++;
      return reply;
    },
  };
  return invoker;
}

describe('MemoryBackendService injection flow', () => {
  it('first turn injects protocol+index; second turn of the same epoch skips', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    await service.ensureRoot();
    await fs.writeFile(service.indexPath, '- [Pref](pref.md) — user prefers conclusion first');
    await fs.writeFile(`${service.projectDir}/pref.md`, '---\nname: pref\ndescription: d\nmetadata:\n  node_type: memory\n  type: feedback\n---\nbody');

    const first = await service.planInjection({
      conversationId: 'c1',
      messages: [msg({ role: 'user', content: 'first turn' })],
      latestUserText: 'first turn',
      settings: settings(),
    });
    expect(first.text).toBeTruthy();
    expect(first.text).toContain(MEMORY_INJECTION_OPEN_MARKER);

    // Simulate the persisted turn now carrying the injected part.
    const messagesAfterTurn = [
      msg({ role: 'user', content: 'first turn', parts: [{ type: 'text', text: first.text!, synthetic: true }] }),
      msg({ role: 'assistant', content: 'ok' }),
    ];
    const second = await service.planInjection({
      conversationId: 'c1',
      messages: messagesAfterTurn,
      latestUserText: 'second turn',
      settings: settings(),
    });
    expect(second.text).toBeNull();
    expect(second.skippedReason).toBe('already-injected-this-epoch');
  });

  it('disabled master switch and epoch skips yield null with ZERO vault writes', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    const out = await service.planInjection({
      conversationId: 'c1',
      messages: [msg({ role: 'user', content: 'hi' })],
      latestUserText: 'hi',
      settings: settings({ memoryBackendEnabled: false }),
    });
    expect(out.text).toBeNull();
    expect(await service.readMetrics()).toEqual([]); // no residual writes when dark

    const skipped = await service.planInjection({
      conversationId: 'c1',
      messages: [msg({ role: 'user', content: 'turn', parts: [{ text: MEMORY_INJECTION_OPEN_MARKER }] })],
      latestUserText: 'turn',
      settings: settings(),
    });
    expect(skipped.skippedReason).toBe('already-injected-this-epoch');
    expect(await service.readMetrics()).toEqual([]);
  });

  it('re-injects after a compaction divider (new epoch)', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    const messages = [
      msg({ role: 'user', content: 'first', parts: [{ type: 'text', text: MEMORY_INJECTION_OPEN_MARKER, synthetic: true }] }),
      msg({ role: 'assistant', content: 'summarized', summary: true, summaryKind: 'compaction' }),
      msg({ role: 'user', content: 'post compaction turn with substance' }),
    ];
    const out = await service.planInjection({
      conversationId: 'c1',
      messages,
      latestUserText: 'post compaction turn',
      settings: settings(),
    });
    expect(out.text).toBeTruthy();
  });
});

describe('MemoryBackendService extraction flow (scenario A/B/C behaviors)', () => {
  it('writes one provenance-stamped memory with an index line (scenario A shape)', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    const invoker = fakeInvoker(JSON.stringify({
      memories: [{
        name: 'conclusion-first',
        description: 'Answer with the conclusion first',
        type: 'feedback',
        body: 'Trigger: user asks a question\n**Why:** long waits\n**How to apply:** lead with the answer',
      }],
    }));
    const outcome = await service.runExtraction({
      conversationId: 'c1',
      sessionId: 'ses_abcdef123456',
      settings: settings(),
      invoker,
      lastExtractedMessageCount: 0,
      messages: [
        msg({ role: 'user', content: '以后回答先给结论再给细节，因为上次我等了很久' }),
        msg({ role: 'assistant', content: '明白了，以后先给结论。' }),
      ],
    });
    expect(outcome.status).toBe('written');
    expect(outcome.modelCalls).toBe(1);
    expect(outcome.writtenFiles).toEqual(['conclusion-first.md']);

    const raw = await fs.readFile(`${service.projectDir}/conclusion-first.md`);
    expect(raw).toContain('node_type: memory');
    expect(raw).toContain('type: feedback');
    expect(raw).toContain('source: extracted ses_abcdef12');
    expect(raw).toContain('**How to apply:**');

    const index = await fs.readFile(service.indexPath);
    expect(index).toContain('- [Conclusion first](conclusion-first.md) — Answer with the conclusion first');
  });

  it('skips extraction with zero model calls for short turns (scenario C1)', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    const invoker = fakeInvoker('{"memories":[]}');
    const outcome = await service.runExtraction({
      conversationId: 'c1',
      sessionId: 's',
      settings: settings(),
      invoker,
      lastExtractedMessageCount: 0,
      messages: [msg({ role: 'user', content: 'hi' })],
    });
    expect(outcome.status).toBe('skipped');
    expect(outcome.skipReason).toBe('user-prose-below-threshold');
    expect(outcome.modelCalls).toBe(0);
    expect(invoker.calls).toBe(0);
  });

  it('skips extraction with zero model calls when the turn wrote memory itself (scenario C2)', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    const invoker = fakeInvoker('{"memories":[]}');
    const rootNative = service.memoryRootNative();
    const outcome = await service.runExtraction({
      conversationId: 'c1',
      sessionId: 's',
      settings: settings(),
      invoker,
      lastExtractedMessageCount: 0,
      messages: [
        msg({ role: 'user', content: 'please remember that I prefer tabs over spaces everywhere' }),
        msg({
          role: 'assistant',
          content: 'saved it',
          toolCalls: [{ name: 'write', input: { filePath: `${rootNative}/tabs.md`, content: 'x'.repeat(200) } }],
        }),
      ],
    });
    expect(outcome.skipReason).toBe('turn-wrote-memory');
    expect(outcome.modelCalls).toBe(0);
    expect(invoker.calls).toBe(0);
  });

  it('does not consume the same transcript twice (watermark gate) and never overwrites files', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    await service.ensureRoot();
    await fs.writeFile(`${service.projectDir}/dup.md`, 'model-authored file, do not clobber');
    const invoker = fakeInvoker(JSON.stringify({
      memories: [{ name: 'dup', description: 'd', type: 'project', body: 'b' }],
    }));
    const messages = [
      msg({ role: 'user', content: 'remember our deadline is October 1st for the release' }),
      msg({ role: 'assistant', content: 'noted' }),
    ];
    const first = await service.runExtraction({
      conversationId: 'c1', sessionId: 's', settings: settings(), invoker, lastExtractedMessageCount: 0, messages,
    });
    expect(first.status).toBe('skipped'); // filename conflict → nothing written
    expect(await fs.readFile(`${service.projectDir}/dup.md`)).toBe('model-authored file, do not clobber');

    const second = await service.runExtraction({
      conversationId: 'c1', sessionId: 's', settings: settings(), invoker, lastExtractedMessageCount: messages.length, messages,
    });
    expect(second.skipReason).toBe('transcript-not-grown');
    expect(second.modelCalls).toBe(0);
  });

  it('fails soft when the invoker throws', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    const outcome = await service.runExtraction({
      conversationId: 'c1',
      sessionId: 's',
      settings: settings(),
      invoker: {
        invoke: async () => {
          throw new Error('server unavailable');
        },
      },
      lastExtractedMessageCount: 0,
      messages: [msg({ role: 'user', content: 'a substantive turn worth remembering forever' })],
    });
    expect(outcome.status).toBe('error');
    expect(outcome.error).toContain('server unavailable');
  });
});

describe('MemoryBackendService reflection flow', () => {
  it('writes ≤3 reflection memories stamped compacted+reflection after compaction', async () => {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    const invoker = fakeInvoker(JSON.stringify({
      memories: [
        { name: 'project-deadline', description: 'Release Oct 1', type: 'project', body: '**Why:** external promise' },
      ],
    }));
    const outcome = await service.runReflection({
      conversationId: 'c1',
      sessionId: 'ses_compact0001',
      settings: settings(),
      invoker,
      messages: [
        msg({ role: 'user', content: 'we need to ship by 2026-10-01' }),
        msg({ role: 'assistant', content: 'ok' }),
      ],
    });
    expect(outcome.status).toBe('written');
    const raw = await fs.readFile(`${service.projectDir}/project-deadline.md`);
    expect(raw).toContain('source: compacted ses_compact0');
    expect(raw).toContain('reflection: true');
  });
});

describe('MemoryBackendService maintenance flows', () => {
  async function seeded() {
    const fs = new InMemoryMemoryFileSystem('/vault');
    const service = new MemoryBackendService(fs, '/vault/my-vault');
    await service.ensureRoot();
    await fs.writeFile(
      `${service.projectDir}/clean.md`,
      '---\nname: clean\ndescription: d\nmetadata:\n  node_type: memory\n  type: project\n---\nbody',
    );
    await fs.writeFile(
      `${service.projectDir}/secret.md`,
      '---\nname: secret\ndescription: d\nmetadata:\n  node_type: memory\n  type: reference\n---\napi_key = 9f8e7d6c5b4a3210',
    );
    await fs.writeFile(
      service.indexPath,
      '# Memory Index\n\n- [Clean](clean.md) — d\n- [Secret](secret.md) — d\n- [Ghost](ghost.md) — missing on disk\n',
    );
    return { fs, service };
  }

  it('lint reports secret hits, missing importance and stray index targets', async () => {
    const { service } = await seeded();
    const report = await service.lint();
    expect(report.topicFiles).toBe(2);
    expect(report.secretHits.map((h) => h.file)).toEqual(['secret.md']);
    expect(report.missingImportance.length).toBe(2);
    expect(report.strayFiles.length).toBe(0);
  });

  it('status reports index stats, type counts and the last injection', async () => {
    const { service } = await seeded();
    await service.planInjection({
      conversationId: 'c9',
      messages: [msg({ role: 'user', content: 'turn' })],
      latestUserText: 'turn',
      settings: settings(),
    });
    const report = await service.status();
    expect(report.indexExists).toBe(true);
    expect(report.indexLines).toBe(5);
    expect(report.topicFiles).toBe(2);
    expect(report.byType.project).toBe(1);
    expect(report.lastInjection?.kind).toBe('injection');
  });

  it('forget removes the topic file and its index line', async () => {
    const { fs, service } = await seeded();
    const { removed } = await service.forget('secret');
    expect(removed).toEqual(['secret.md']);
    expect(await fs.readFile(`${service.projectDir}/secret.md`)).toBeNull();
    const index = await fs.readFile(service.indexPath);
    expect(index).not.toContain('Secret](secret.md');
    expect(index).toContain('[Clean](clean.md)');
  });

  it('metrics journal is append-only JSONL', async () => {
    const { service } = await seeded();
    const before = (await service.readMetrics()).length;
    await service.forget('nothing-matches');
    const after = (await service.readMetrics()).length;
    expect(after).toBeGreaterThan(before);
  });
});

describe('MemoryBackendService backend neutrality (DoD 5)', () => {
  it('operates identically through the FS port regardless of any backend', async () => {
    const fsA = new InMemoryMemoryFileSystem('/vault');
    const fsB = new InMemoryMemoryFileSystem('/vault');
    const serviceA = new MemoryBackendService(fsA, '/ws');
    const serviceB = new MemoryBackendService(fsB, '/ws');
    const plan = {
      conversationId: 'c',
      messages: [msg({ role: 'user', content: 'remember that deploys happen on Tuesdays here' })],
      latestUserText: 'remember that deploys happen on Tuesdays here',
      settings: settings(),
    };
    const a = await serviceA.planInjection(plan);
    const b = await serviceB.planInjection(plan);
    expect(a.text).toBe(b.text);
  });
});
