/**
 * VaultEmbeddingIndexService tests (advantage-parity R-E4).
 *
 * Design contract (advantage-parity-re4-design.md): note-level vectors,
 * content-hash increments (skip unchanged, drop deleted), flat cosine
 * ranking, and honest degradation on every failure path (never a
 * fabricated hit).
 */

import {
  buildEmbeddingText,
  cosineSimilarity,
  decodeFloat32,
  type EmbeddingClient,
  encodeFloat32,
  hashEmbeddingContent,
  type VaultEmbeddingFsAdapter,
  VaultEmbeddingIndexService,
} from '../../../../src/core/memory/VaultEmbeddingIndexService';

class MemoryFs implements VaultEmbeddingFsAdapter {
  readonly files = new Map<string, string>();
  readonly notes = new Map<string, { title: string; content: string }>();
  writeFileCalls: string[] = [];

  async listMarkdownFiles() {
    return [...this.notes.entries()].map(([path, note]) => ({ path, ...note }));
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async writeFile(path: string, data: string): Promise<void> {
    this.writeFileCalls.push(path);
    this.files.set(path, data);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async mkdir(): Promise<void> {}
}

function deterministicClient(): EmbeddingClient {
  // Embeds text as a tiny 4-dim vector derived from char codes — enough to
  // make similar texts rank adjacent and keep tests deterministic.
  return {
    embed: async (inputs) => inputs.map((text) => {
      const vector = [0, 0, 0, 0];
      for (let index = 0; index < text.length; index += 1) {
        vector[index % 4] += text.charCodeAt(index) % 97;
      }
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
      return vector.map((v) => v / norm);
    }),
  };
}

describe('codec and math', () => {
  it('round-trips float32 vectors through base64', () => {
    const vector = [0.1, -0.25, 3.5, 0];
    const decoded = decodeFloat32(encodeFloat32(vector));
    expect(decoded.length).toBe(4);
    expect(decoded[0]).toBeCloseTo(0.1, 6);
    expect(decoded[1]).toBeCloseTo(-0.25, 6);
    expect(decoded[2]).toBeCloseTo(3.5, 6);
  });

  it('ranks identical vectors at 1 and orthogonal at 0', () => {
    expect(cosineSimilarity(
      decodeFloat32(encodeFloat32([1, 0])),
      decodeFloat32(encodeFloat32([1, 0])),
    )).toBeCloseTo(1, 6);
    expect(cosineSimilarity(
      decodeFloat32(encodeFloat32([1, 0])),
      decodeFloat32(encodeFloat32([0, 1])),
    )).toBeCloseTo(0, 6);
  });

  it('builds embedding text without frontmatter/code and caps length', () => {
    const text = buildEmbeddingText('题', `---\nid: x\n---\n# 题\n\n正文。\n\n\`\`\`js\nnoise\n\`\`\``);
    expect(text).not.toContain('id: x');
    expect(text).not.toContain('noise');
    expect(text).toContain('正文');
    expect(buildEmbeddingText('t', 'x'.repeat(9999)).length).toBeLessThanOrEqual(4001);
  });

  it('hashes identical content identically', () => {
    expect(hashEmbeddingContent('abc')).toBe(hashEmbeddingContent('abc'));
    expect(hashEmbeddingContent('abc')).not.toBe(hashEmbeddingContent('abd'));
  });
});

describe('VaultEmbeddingIndexService', () => {
  it('indexes notes, ranks a similar query first, and skips unchanged notes on re-index', async () => {
    const fs = new MemoryFs();
    const client = deterministicClient();
    let embedCalls = 0;
    const countingClient: EmbeddingClient = {
      embed: async (inputs) => {
        embedCalls += inputs.length;
        return client.embed(inputs);
      },
    };
    const service = new VaultEmbeddingIndexService(fs, () => countingClient);
    fs.notes.set('a.md', { title: 'A', content: '注意力机制 transformer 注意力' });
    fs.notes.set('b.md', { title: 'B', content: '购物清单 牛奶 鸡蛋' });

    const first = await service.ensureIndexed();
    expect(first).toBe(2);
    expect(service.indexedCount()).toBe(2);

    const { hits, degradation } = await service.query('注意力机制');
    expect(degradation).toBeNull();
    expect(hits[0]?.path).toBe('a.md');
    expect(hits.length).toBe(2);

    // Unchanged notes are skipped on the second pass.
    const second = await service.ensureIndexed();
    expect(second).toBe(0);
    expect(embedCalls).toBe(3); // 2 index + 1 query

    // Deleting a note removes its vector.
    fs.notes.delete('b.md');
    await service.ensureIndexed();
    expect(service.indexedCount()).toBe(1);
  });

  it('degrades honestly with a reason and no fabricated hits', async () => {
    const fs = new MemoryFs();
    const service = new VaultEmbeddingIndexService(fs, () => null);
    const reasons: string[] = [];
    const empty = await service.query('q', { reportDegradation: (reason) => reasons.push(reason) });
    expect(empty.hits).toEqual([]);
    expect(empty.degradation).toBe('not-configured');
    expect(reasons).toEqual(['not-configured']);

    const failing: EmbeddingClient = {
      embed: async () => {
        throw new Error('endpoint down');
      },
    };
    const populatedFs = new MemoryFs();
    populatedFs.notes.set('a.md', { title: 'A', content: '内容' });
    const service2 = new VaultEmbeddingIndexService(populatedFs, () => deterministicClient());
    await service2.ensureIndexed();
    const failedService = new VaultEmbeddingIndexService(populatedFs, () => failing);
    // Reuse the persisted manifest: index non-empty, query embed fails.
    await failedService.ensureIndexed();
    const failed = await failedService.query('q', { reportDegradation: (r) => reasons.push(r) });
    expect(failed.degradation).toBe('embed-failed');
    expect(reasons).toContain('embed-failed');

    const emptyIndex = new VaultEmbeddingIndexService(fs, () => deterministicClient());
    const none = await emptyIndex.query('q');
    expect(none.degradation).toBe('index-empty');
  });
});
