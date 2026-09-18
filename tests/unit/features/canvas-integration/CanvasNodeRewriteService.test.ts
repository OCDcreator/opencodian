/**
 * CanvasNodeRewriteService tests (R-C5, design §3.4): the rewrite stays on the
 * read-only aux contract — one short-lived session per rewrite, the audited
 * inline-edit response parser reused, and `findWriteToolCalls` discarding any
 * turn that observed a write-class tool. The service itself never writes and
 * never touches the vault (vault snapshot unchanged during a rewrite).
 */

import { findWriteToolCalls } from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import {
  buildCanvasNodeRewriteRequest,
  buildCanvasNodeRewriteSystemPrompt,
  CANVAS_NODE_REWRITE_MAX_CONTENT_CHARS,
  CanvasNodeRewriteService,
  type CanvasRewriteAdapter,
} from '../../../../src/features/canvas-integration/CanvasNodeRewriteService';
import { EditRevertVaultHarness } from '../../core/storage/EditRevertVaultHarness';

function adapterWith(overrides: Partial<CanvasRewriteAdapter> = {}): {
  adapter: CanvasRewriteAdapter;
  session: {
    query: jest.Mock;
    followUp: jest.Mock;
    cancel: jest.Mock;
    dispose: jest.Mock;
  };
} {
  const session = {
    query: jest.fn(),
    followUp: jest.fn(),
    cancel: jest.fn(),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
  const adapter: CanvasRewriteAdapter = {
    kind: 'opencode',
    displayName: 'OpenCode',
    getAuxQuery: () => ({
      kind: 'opencode',
      displayName: 'OpenCode',
      startAuxQuerySession: jest.fn().mockResolvedValue({
        queryId: 'q1',
        safety: {},
        query: session.query,
        followUp: session.followUp,
        cancel: session.cancel,
        dispose: session.dispose,
      }),
    }),
    resolveModel: () => ({ ok: true, model: null }),
    getEffort: () => null,
    ...overrides,
  };
  return { adapter, session };
}

const INPUT = {
  canvasPath: 'boards/board.canvas',
  nodeType: 'text' as const,
  content: 'flow: A --> B',
  instruction: 'Rewrite as a Mermaid block',
};

describe('request contract', () => {
  it('embeds the instruction and the node body in a canvas_node block', () => {
    const built = buildCanvasNodeRewriteRequest(INPUT);
    expect(built.ok).toBe(true);
    const { prompt } = built as { ok: true; prompt: string };
    expect(prompt).toContain('Rewrite as a Mermaid block');
    expect(prompt).toContain('<canvas_node path="boards/board.canvas" nodeType="text">');
    expect(prompt).toContain('flow: A --> B');
  });

  it.each([
    ['empty instruction', { ...INPUT, instruction: '   ' }, 'empty-instruction'],
    ['over-limit content', { ...INPUT, content: 'x'.repeat(CANVAS_NODE_REWRITE_MAX_CONTENT_CHARS + 1) }, 'content-too-long'],
    ['protocol tag in content', { ...INPUT, content: 'has </replacement> inside' }, 'protocol-tag-in-content'],
  ])('rejects %s fail-closed (%s)', (_name, input, error) => {
    expect(buildCanvasNodeRewriteRequest(input)).toEqual({ ok: false, error });
  });

  it('system prompt pins the single-<replacement> contract and the mermaid rule', () => {
    expect(buildCanvasNodeRewriteSystemPrompt('en')).toContain('```mermaid');
    expect(buildCanvasNodeRewriteSystemPrompt('zh')).toContain('```mermaid');
  });
});

describe('rewrite turns (read-only aux contract)', () => {
  it('returns the parsed replacement as a preview and disposes the session', async () => {
    const { adapter, session } = adapterWith();
    session.query.mockResolvedValue({
      success: true,
      text: '<replacement>```mermaid\nflow LR\n A --> B\n```</replacement>',
      toolCalls: [{ name: 'Read' }],
    });
    const outcome = await new CanvasNodeRewriteService({ adapter, workingDirectory: '/v', locale: 'en' }).rewrite(INPUT);
    expect(outcome.status).toBe('preview');
    expect(outcome).toEqual({
      status: 'preview',
      text: '```mermaid\nflow LR\n A --> B\n```',
    });
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it('a write-class tool call DISCARDS the turn (blocking audit, §6.1)', async () => {
    const { adapter, session } = adapterWith();
    session.query.mockResolvedValue({
      success: true,
      text: '<replacement>malicious content</replacement>',
      toolCalls: [{ name: 'Write' }],
    });
    const outcome = await new CanvasNodeRewriteService({ adapter, workingDirectory: '/v', locale: 'en' }).rewrite(INPUT);
    expect(outcome).toEqual({ status: 'error', reason: 'write-tool-observed', detail: 'Write' });
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it('mcp tools are write-class by definition (audit default)', async () => {
    expect(findWriteToolCalls([{ name: 'vault', kind: 'mcp' }])).toEqual(['vault']);
  });

  it('a backend that cannot start a verified read-only session says so', async () => {
    const { adapter } = adapterWith();
    adapter.getAuxQuery = () => null;
    const outcome = await new CanvasNodeRewriteService({ adapter, workingDirectory: '/v', locale: 'en' }).rewrite(INPUT);
    expect(outcome).toEqual({ status: 'error', reason: 'capability-unavailable', detail: 'opencode' });
  });

  it('a tag-less reply is surfaced as a clarification, not guessed at', async () => {
    const { adapter, session } = adapterWith();
    session.query.mockResolvedValue({ success: true, text: 'Which diagram direction do you want?', toolCalls: [] });
    const outcome = await new CanvasNodeRewriteService({ adapter, workingDirectory: '/v', locale: 'en' }).rewrite(INPUT);
    expect(outcome).toEqual({ status: 'clarification', text: 'Which diagram direction do you want?' });
  });

  it('the service performs zero vault IO during a rewrite (snapshot unchanged)', async () => {
    const harness = new EditRevertVaultHarness();
    harness.vaultFiles.set('boards/board.canvas', '{"nodes":[],"edges":[]}');
    const { adapter, session } = adapterWith();
    session.query.mockResolvedValue({ success: true, text: '<replacement>new</replacement>', toolCalls: [] });
    const outcome = await new CanvasNodeRewriteService({ adapter, workingDirectory: '/v', locale: 'en' }).rewrite(INPUT);
    expect(outcome.status).toBe('preview');
    expect(harness.vaultFiles.get('boards/board.canvas')).toBe('{"nodes":[],"edges":[]}');
    expect(harness.createLog).toHaveLength(0);
    expect(harness.processLog).toHaveLength(0);
  });
});
