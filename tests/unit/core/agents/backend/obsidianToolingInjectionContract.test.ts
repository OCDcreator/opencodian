import { readFileSync } from 'fs';
import { join } from 'path';

import { OpenCodeAdapter } from '../../../../../src/core/agents/backend/OpenCodeAdapter';

const SRC_ROOT = join(__dirname, '..', '..', '..', '..', '..', 'src');

/**
 * R-B4 backend-agnostic contract: the Obsidian-tooling injection rides the
 * send-options bag (`obsidianToolingInjection`) and EVERY backend must
 * translate it at its own seam:
 * - opencode: synthetic text part (behavioral test below);
 * - claude-code / codex / pi: prompt prefix (source-seam contract, since
 *   those adapters cannot be instantiated without their real CLIs).
 */

function createCapturingOpenCodeService() {
  let capturedOptions: Record<string, unknown> | null = null;
  const service = {
    getServerStatus: () => 'running',
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    dispose: () => undefined,
    sendMessage: function* (content: string, options: Record<string, unknown>) {
      capturedOptions = options;
      yield { type: 'text', content: 'ok' };
    },
  } as unknown as import('../../../../../src/core/opencode/OpenCodeService').OpenCodeService;
  return {
    service: service,
    getCapturedOptions: () => capturedOptions,
  };
}

describe('R-B4 tooling injection: backend-agnostic options-bag contract', () => {
  it('opencode translates the injection into a synthetic text part', async () => {
    const { service, getCapturedOptions } = createCapturingOpenCodeService();
    const adapter = new OpenCodeAdapter(service);
    const toolingBlock = '[OPENCODIAN OBSIDIAN TOOLING] capability block';
    const memoryBlock = '[OPENCODIAN MEMORY] memory block';

    const options = {
      syntheticTextParts: [{ text: 'explicit', ignored: false, metadata: {} }],
      obsidianToolingInjection: { text: toolingBlock },
      memoryInjection: { text: memoryBlock },
    };
    const chunks = [];
    for await (const chunk of adapter.sendMessage({ sessionId: 's1', content: 'hello', options })) {
      chunks.push(chunk);
    }
    void chunks;

    const captured = getCapturedOptions();
    expect(captured).not.toBeNull();
    const parts = (captured as { syntheticTextParts?: { text: string; metadata: { kind: string } }[] }).syntheticTextParts;
    expect(parts).toBeDefined();
    const kinds = parts!.map((part) => part.metadata.kind);
    expect(kinds).toContain('obsidian-tooling-injection');
    expect(kinds).toContain('memory-injection');
    const toolingPart = parts!.find((part) => part.metadata.kind === 'obsidian-tooling-injection');
    expect(toolingPart?.text).toBe(toolingBlock);
    // Explicit synthetic parts survive untouched.
    expect(parts!.some((part) => part.text === 'explicit')).toBe(true);
  });

  it('claude-code prefixes the message content with the injection', () => {
    const source = readFileSync(join(SRC_ROOT, 'core', 'agents', 'backend', 'ClaudeCodeAdapter.ts'), 'utf8');
    expect(source).toContain('prependObsidianToolingInjection');
    expect(source).toContain('prependMemoryInjection');
  });

  it('codex prefixes the message content with the injection', () => {
    const source = readFileSync(join(SRC_ROOT, 'core', 'agents', 'backend', 'CodexAdapter.ts'), 'utf8');
    expect(source).toContain('prependObsidianToolingInjection');
    expect(source).toContain('prependMemoryInjection');
  });

  it('pi prefixes the message content with the injection', () => {
    const source = readFileSync(join(SRC_ROOT, 'core', 'agents', 'backend', 'pi', 'PiAdapter.ts'), 'utf8');
    expect(source).toContain('prependObsidianToolingInjection');
    expect(source).toContain('prependMemoryInjection');
  });

  it('every adapter seam consumes the SAME options-bag key (no per-backend divergence)', () => {
    for (const adapterPath of [
      join(SRC_ROOT, 'core', 'agents', 'backend', 'OpenCodeAdapter.ts'),
      join(SRC_ROOT, 'core', 'agents', 'backend', 'ClaudeCodeAdapter.ts'),
      join(SRC_ROOT, 'core', 'agents', 'backend', 'CodexAdapter.ts'),
      join(SRC_ROOT, 'core', 'agents', 'backend', 'pi', 'PiAdapter.ts'),
    ]) {
      const source = readFileSync(adapterPath, 'utf8');
      expect(source).toMatch(/from '\.\.\/(\.\.\/)*obsidianTooling'/);
    }
  });
});
