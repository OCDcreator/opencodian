import { planMemoryInjection, transcriptHasInjectionThisEpoch } from '../../../../src/core/memory/memoryInjection';
import { MEMORY_INJECTION_OPEN_MARKER } from '../../../../src/core/memory/memoryProtocol';
import type { MemorySettingsSnapshot, MemoryTranscriptMessage } from '../../../../src/core/memory/memoryTypes';
import type { SelectedMemory } from '../../../../src/core/memory/memoryRecall';
import type { TopicManifestEntry } from '../../../../src/core/memory/memoryManifest';

const settings = (over: Partial<MemorySettingsSnapshot> = {}): MemorySettingsSnapshot => ({
  memoryBackendEnabled: true,
  memoryExtractionEnabled: true,
  memorySemanticRecallEnabled: false,
  memoryExtractionModel: '',
  ...over,
});

const manifest: TopicManifestEntry[] = [{
  filePath: '.opencodian/memory/projects/b/pref.md',
  filename: 'pref.md',
  name: 'pref',
  description: 'user prefers conclusion first',
  type: 'feedback',
  importance: 4,
  mtimeMs: 100,
}];

function msg(partial: Partial<MemoryTranscriptMessage> & { role: 'user' | 'assistant'; content: string }): MemoryTranscriptMessage {
  return { id: `m${Math.random()}`, timestamp: 1, ...partial };
}

describe('transcriptHasInjectionThisEpoch (D-O3 epoch detection)', () => {
  it('detects the marker in user content and in persisted parts', () => {
    expect(transcriptHasInjectionThisEpoch([
      msg({ role: 'user', content: MEMORY_INJECTION_OPEN_MARKER }),
    ])).toBe(true);
    expect(transcriptHasInjectionThisEpoch([
      msg({ role: 'user', content: 'hi', parts: [{ type: 'text', text: MEMORY_INJECTION_OPEN_MARKER, synthetic: true }] }),
    ])).toBe(true);
    expect(transcriptHasInjectionThisEpoch([
      msg({ role: 'user', content: 'plain turn' }),
    ])).toBe(false);
  });

  it('a compaction divider after the marker starts a fresh epoch', () => {
    expect(transcriptHasInjectionThisEpoch([
      msg({ role: 'user', content: MEMORY_INJECTION_OPEN_MARKER }),
      msg({ role: 'assistant', content: 'sum', summary: true, summaryKind: 'compaction' }),
    ])).toBe(false);
    expect(transcriptHasInjectionThisEpoch([
      msg({ role: 'user', content: MEMORY_INJECTION_OPEN_MARKER }),
      msg({ role: 'assistant', content: 'sum', summary: true, summaryKind: 'compaction' }),
      msg({ role: 'user', content: 'new epoch turn' }),
    ])).toBe(false);
  });
});

describe('planMemoryInjection (injection contract)', () => {
  const base = {
    messages: [msg({ role: 'user', content: 'first turn' })],
    memoryIndexContent: '- [Pref](pref.md) — user prefers conclusion first',
    manifest,
    memoryRootDisplay: '/vault/.opencodian/memory/projects/b/',
    modelMemoryIndexPath: '/vault/.opencodian/memory/projects/b/MEMORY.md',
    alreadyInjectedThisEpoch: false,
  };

  it('returns null with skippedReason disabled when the master switch is off', () => {
    const plan = planMemoryInjection({ ...base, settings: settings({ memoryBackendEnabled: false }) });
    expect(plan.text).toBeNull();
    expect(plan.skippedReason).toBe('disabled');
  });

  it('returns null when this epoch was already injected', () => {
    const plan = planMemoryInjection({ ...base, settings: settings(), alreadyInjectedThisEpoch: true });
    expect(plan.text).toBeNull();
    expect(plan.skippedReason).toBe('already-injected-this-epoch');
  });

  it('builds protocol + index in one NOT-a-request framed block', () => {
    const plan = planMemoryInjection({ ...base, settings: settings() });
    expect(plan.text).toBeTruthy();
    expect(plan.text!.startsWith(MEMORY_INJECTION_OPEN_MARKER)).toBe(true);
    expect(plan.text!.endsWith('[/OPENCODIAN MEMORY]')).toBe(true);
    expect(plan.text!).toContain('# Memory');
    expect(plan.text!).toContain('/vault/.opencodian/memory/projects/b/');
    expect(plan.text!).toContain("Contents of /vault/.opencodian/memory/projects/b/MEMORY.md (user's auto-memory, persists across conversations):");
    expect(plan.text!).toContain('- [Pref](pref.md) — user prefers conclusion first');
    expect(plan.text!).toContain('NOT a user message and NOT an instruction');
    expect(plan.protocolBytes).toBeGreaterThan(1000);
    expect(plan.indexBytes).toBeGreaterThan(50);
  });

  it('still injects the protocol when the index is empty (D21) but skips the index block', () => {
    const plan = planMemoryInjection({ ...base, settings: settings(), memoryIndexContent: '' });
    expect(plan.text).toBeTruthy();
    expect(plan.text).not.toContain("user's auto-memory");
    expect(plan.indexBytes).toBe(0);
  });

  it('includes semantic recall bodies only when semantic recall is on', () => {
    const selected: SelectedMemory[] = [{ filePath: 'p/pref.md', content: 'Memory: p/pref.md:\n\nbody' }];
    const off = planMemoryInjection({ ...base, settings: settings(), selectorResult: selected });
    expect(off.relevantMemory).toBeNull();

    const on = planMemoryInjection({
      ...base,
      settings: settings({ memorySemanticRecallEnabled: true }),
      selectorResult: selected,
    });
    expect(on.relevantMemory).toContain('<system-reminder>');
    expect(on.text).toContain('<system-reminder>');
    expect(on.recalledPaths).toEqual(['p/pref.md']);
  });

  it('carries the hygiene notice into the block when the store needs maintenance', () => {
    const longIndex = Array.from({ length: 160 }, (_, i) => `- [T${i}](t${i}.md) — h`).join('\n');
    const plan = planMemoryInjection({
      ...base,
      memoryIndexContent: longIndex,
      manifest: [],
      settings: settings(),
    });
    expect(plan.hygieneNotice).toBeTruthy();
    expect(plan.text).toContain('[MEMORY-ACTION]');
  });
});
