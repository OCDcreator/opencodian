/* eslint-disable max-lines -- CodexStreamNormalizer tests keep all event-type × phase × item-type matrix cases in one file for reviewability. */
/**
 * CodexStreamNormalizer tests.
 *
 * These tests validate the ThreadEvent → StreamChunk translation for every
 * event type and item type defined in the Codex SDK. Mock events are plain
 * objects that structurally match the SDK discriminated-union types; no
 * runtime SDK dependency is required.
 */

/* eslint-disable max-lines-per-function -- Normalizer test suite keeps all ThreadEvent/ThreadItem mapping fixtures in one cohesive describe block. */

import {
  CodexStreamNormalizer,
  createCodexStreamNormalizer,
} from '../../../../../src/core/agents/backend';

// ---------------------------------------------------------------------------
// Mock event builders (structurally match @openai/codex-sdk ThreadEvent)
// ---------------------------------------------------------------------------

const mockThreadStarted = (threadId: string) =>
  ({ type: 'thread.started' as const, thread_id: threadId });

const mockTurnStarted = () =>
  ({ type: 'turn.started' as const });

const mockTurnCompleted = (usage: {
  input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
  cached_input_tokens?: number;
}) => ({ type: 'turn.completed' as const, usage });

const mockTurnFailed = (message: string) =>
  ({ type: 'turn.failed' as const, error: { message } });

const mockThreadError = (message: string) =>
  ({ type: 'error' as const, message });

const mockItemStarted = (item: Record<string, unknown>) =>
  ({ type: 'item.started' as const, item });

const mockItemUpdated = (item: Record<string, unknown>) =>
  ({ type: 'item.updated' as const, item });

const mockItemCompleted = (item: Record<string, unknown>) =>
  ({ type: 'item.completed' as const, item });

// Item builders
const agentMessage = (id: string, text: string) =>
  ({ type: 'agent_message' as const, id, text });

const reasoning = (id: string, text: string) =>
  ({ type: 'reasoning' as const, id, text });

const commandExecution = (id: string, command: string, overrides?: Record<string, unknown>) =>
  ({ type: 'command_execution' as const, id, command, aggregated_output: '', status: 'in_progress' as const, ...overrides });

const fileChange = (id: string, changes: Array<{ path: string; kind: string }>, status: 'completed' | 'failed' = 'completed') =>
  ({ type: 'file_change' as const, id, changes, status });

const mcpToolCall = (id: string, server: string, tool: string, overrides?: Record<string, unknown>) =>
  ({ type: 'mcp_tool_call' as const, id, server, tool, arguments: {}, status: 'in_progress' as const, ...overrides });

const webSearch = (id: string, query: string) =>
  ({ type: 'web_search' as const, id, query });

const todoList = (id: string, items: Array<{ text: string; completed: boolean }>) =>
  ({ type: 'todo_list' as const, id, items });

const errorItem = (id: string, message: string) =>
  ({ type: 'error' as const, id, message });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexStreamNormalizer', () => {
  let normalizer: CodexStreamNormalizer;

  beforeEach(() => {
    normalizer = new CodexStreamNormalizer();
  });

  // -------------------------------------------------------------------------
  // Thread lifecycle events
  // -------------------------------------------------------------------------

  describe('thread.started', () => {
    it('captures sessionId but emits no chunks (metadata deferred to turn.started)', () => {
      const chunks = normalizer.transformEvent(mockThreadStarted('thread-abc') as never);
      expect(chunks).toEqual([]);
    });
  });

  describe('turn.started', () => {
    it('emits message_start only (no metadata — deferred to agent_message)', () => {
      normalizer.transformEvent(mockThreadStarted('thread-abc') as never);
      const chunks = normalizer.transformEvent(mockTurnStarted() as never);
      expect(chunks).toEqual([{ type: 'message_start' }]);
    });
  });

  describe('agent_message identity', () => {
    it('emits message_metadata with generated UUID as messageId on first agent_message', () => {
      normalizer.transformEvent(mockThreadStarted('thread-abc') as never);
      normalizer.transformEvent(mockTurnStarted() as never);
      const chunks = normalizer.transformEvent(
        mockItemStarted(agentMessage('item-0', 'Hello')) as never,
      );
      expect(chunks).toEqual([
        {
          type: 'message_metadata',
          messageId: expect.stringMatching(/^thread-abc::[0-9a-f-]{36}$/),
          timestamp: expect.any(Number),
          sessionId: 'thread-abc',
        },
        { type: 'text', content: 'Hello' },
      ]);
    });

    it('does not re-emit message_metadata for subsequent agent_message events', () => {
      normalizer.transformEvent(mockThreadStarted('thread-abc') as never);
      normalizer.transformEvent(mockTurnStarted() as never);
      normalizer.transformEvent(
        mockItemStarted(agentMessage('item-0', 'Hello')) as never,
      );
      const chunks = normalizer.transformEvent(
        mockItemUpdated(agentMessage('item-0', 'Hello world')) as never,
      );
      // Only text delta, no metadata
      expect(chunks).toEqual([{ type: 'text', content: ' world' }]);
    });

    it('generates different UUID for each agent_message across turns', () => {
      normalizer.transformEvent(mockThreadStarted('thread-abc') as never);
      // Turn 1
      normalizer.transformEvent(mockTurnStarted() as never);
      const turn1Item = normalizer.transformEvent(
        mockItemCompleted(agentMessage('item-0', 'Answer 1')) as never,
      );
      normalizer.transformEvent(mockTurnCompleted({ input_tokens: 1, output_tokens: 1 }) as never);
      // Turn 2 — SDK may reuse item-0 but UUID is always fresh
      normalizer.transformEvent(mockTurnStarted() as never);
      const turn2Item = normalizer.transformEvent(
        mockItemCompleted(agentMessage('item-0', 'Answer 2')) as never,
      );

      const meta1 = turn1Item.find(c => c.type === 'message_metadata');
      const meta2 = turn2Item.find(c => c.type === 'message_metadata');
      const id1 = (meta1 as Record<string, unknown>)?.messageId as string;
      const id2 = (meta2 as Record<string, unknown>)?.messageId as string;
      // Both contain threadId prefix
      expect(id1).toMatch(/^thread-abc::[0-9a-f-]{36}$/);
      expect(id2).toMatch(/^thread-abc::[0-9a-f-]{36}$/);
      // But are different UUIDs
      expect(id1).not.toBe(id2);
    });

    it('produces unique identity across fresh normalizer instances on resumed thread', () => {
      // Simulates adapter restart: fresh normalizer, same thread.
      // Even though SDK reuses item-0 per turn, crypto.randomUUID() gives fresh IDs.
      const normalizer1 = new CodexStreamNormalizer();
      normalizer1.transformEvent(mockThreadStarted('thread-abc') as never);
      normalizer1.transformEvent(mockTurnStarted() as never);
      const send1 = normalizer1.transformEvent(
        mockItemCompleted(agentMessage('item-0', 'First')) as never,
      );

      // Fresh normalizer after restart — same threadId, SDK also reuses item-0
      const normalizer2 = new CodexStreamNormalizer();
      normalizer2.transformEvent(mockThreadStarted('thread-abc') as never);
      normalizer2.transformEvent(mockTurnStarted() as never);
      const send2 = normalizer2.transformEvent(
        mockItemCompleted(agentMessage('item-0', 'Second')) as never,
      );

      const id1 = ((send1.find(c => c.type === 'message_metadata') as Record<string, unknown>)?.messageId) as string;
      const id2 = ((send2.find(c => c.type === 'message_metadata') as Record<string, unknown>)?.messageId) as string;
      expect(id1).toMatch(/^thread-abc::[0-9a-f-]{36}$/);
      expect(id2).toMatch(/^thread-abc::[0-9a-f-]{36}$/);
      // Even with same threadId and same SDK item-0, UUIDs are different
      expect(id1).not.toBe(id2);
    });

    it('persisted-thread resume: UUIDs never collide across plugin reload cycles', () => {
      // Product path: user sends a message, plugin reloads, user sends another message
      // on the same persisted Codex thread. The restored sessionId is the real threadId,
      // and the normalizer is fresh (sendCount/reset state lost).
      // crypto.randomUUID() guarantees uniqueness regardless.
      const THREAD_ID = 'persisted-thread-xyz';

      // --- Session 1 (before reload) ---
      const s1 = new CodexStreamNormalizer();
      s1.transformEvent(mockThreadStarted(THREAD_ID) as never);
      s1.transformEvent(mockTurnStarted() as never);
      const s1send1 = s1.transformEvent(
        mockItemCompleted(agentMessage('item-0', 'Turn 1 before reload')) as never,
      );
      s1.transformEvent(mockTurnCompleted({ input_tokens: 1, output_tokens: 1 }) as never);
      const id_s1_t1 = ((s1send1.find(c => c.type === 'message_metadata') as Record<string, unknown>)?.messageId) as string;

      // --- Plugin reload: all in-memory state is gone ---
      // --- Session 2 (after reload, resumed conversation) ---
      // resolveOrCreateThread returns the SAME threadId from persistence.
      // Normalizer is fresh, sendCount is 0, turnMetadataEmitted is false.
      const s2 = new CodexStreamNormalizer();
      s2.transformEvent(mockThreadStarted(THREAD_ID) as never);
      s2.transformEvent(mockTurnStarted() as never);
      const s2send1 = s2.transformEvent(
        mockItemCompleted(agentMessage('item-0', 'Turn 2 after reload')) as never,
      );
      s2.transformEvent(mockTurnCompleted({ input_tokens: 2, output_tokens: 2 }) as never);
      const id_s2_t1 = ((s2send1.find(c => c.type === 'message_metadata') as Record<string, unknown>)?.messageId) as string;

      // Second send within the same resumed session
      s2.transformEvent(mockTurnStarted() as never);
      const s2send2 = s2.transformEvent(
        mockItemCompleted(agentMessage('item-0', 'Turn 3 after reload')) as never,
      );
      s2.transformEvent(mockTurnCompleted({ input_tokens: 3, output_tokens: 3 }) as never);
      const id_s2_t2 = ((s2send2.find(c => c.type === 'message_metadata') as Record<string, unknown>)?.messageId) as string;

      // All three IDs share the threadId prefix but have distinct UUIDs
      expect(id_s1_t1).toMatch(/^persisted-thread-xyz::[0-9a-f-]{36}$/);
      expect(id_s2_t1).toMatch(/^persisted-thread-xyz::[0-9a-f-]{36}$/);
      expect(id_s2_t2).toMatch(/^persisted-thread-xyz::[0-9a-f-]{36}$/);

      // CRITICAL: no collisions — across reload AND within same resumed session
      const uniqueIds = new Set([id_s1_t1, id_s2_t1, id_s2_t2]);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('turn.completed', () => {
    it('emits fallback metadata + usage + message_stop when no agent_message seen', () => {
      const chunks = normalizer.transformEvent(
        mockTurnCompleted({ input_tokens: 100, output_tokens: 50, reasoning_output_tokens: 20 }) as never,
      );
      expect(chunks).toEqual([
        { type: 'message_metadata', messageId: expect.stringContaining('fallback-'), timestamp: expect.any(Number) },
        { type: 'usage', inputTokens: 100, outputTokens: 70 },
        { type: 'message_stop' },
      ]);
    });

    it('includes reasoning_output_tokens in outputTokens', () => {
      const chunks = normalizer.transformEvent(
        mockTurnCompleted({ input_tokens: 10, output_tokens: 30, reasoning_output_tokens: 15 }) as never,
      );
      const usageChunk = chunks.find(c => (c as Record<string, unknown>).type === 'usage');
      expect(usageChunk).toEqual(
        expect.objectContaining({ type: 'usage', outputTokens: 45 }),
      );
    });

    it('omits reasoning_output_tokens when absent', () => {
      const chunks = normalizer.transformEvent(
        mockTurnCompleted({ input_tokens: 10, output_tokens: 30 }) as never,
      );
      const usageChunk = chunks.find(c => (c as Record<string, unknown>).type === 'usage');
      expect(usageChunk).toEqual(
        expect.objectContaining({ type: 'usage', outputTokens: 30 }),
      );
    });

    it('includes sessionId in usage when set via thread.started', () => {
      normalizer.transformEvent(mockThreadStarted('s-1') as never);
      const chunks = normalizer.transformEvent(
        mockTurnCompleted({ input_tokens: 10, output_tokens: 5 }) as never,
      );
      expect(chunks[0]).toEqual(
        expect.objectContaining({ sessionId: 's-1' }),
      );
    });
  });

  describe('turn.failed', () => {
    it('emits error with failure message', () => {
      const chunks = normalizer.transformEvent(mockTurnFailed('something broke') as never);
      expect(chunks).toEqual([{ type: 'error', content: 'something broke' }]);
    });
  });

  describe('ThreadErrorEvent', () => {
    it('emits error for top-level stream error', () => {
      const chunks = normalizer.transformEvent(mockThreadError('fatal error') as never);
      expect(chunks).toEqual([{ type: 'error', content: 'fatal error' }]);
    });
  });

  // -------------------------------------------------------------------------
  // Item lifecycle — agent_message
  // -------------------------------------------------------------------------

  describe('agent_message', () => {
    it('emits metadata + text on first started', () => {
      const chunks = normalizer.transformEvent(
        mockItemStarted(agentMessage('msg-1', 'Hello')) as never,
      );
      expect(chunks).toEqual([
        { type: 'message_metadata', messageId: expect.stringMatching(/^msg::[0-9a-f-]{36}$/), timestamp: expect.any(Number) },
        { type: 'text', content: 'Hello' },
      ]);
    });

    it('emits only new text on updated (delta tracking, no re-emitted metadata)', () => {
      normalizer.transformEvent(mockItemStarted(agentMessage('msg-1', 'Hello')) as never);
      const chunks = normalizer.transformEvent(
        mockItemUpdated(agentMessage('msg-1', 'Hello world')) as never,
      );
      expect(chunks).toEqual([{ type: 'text', content: ' world' }]);
    });

    it('emits nothing on completed after started (text already emitted)', () => {
      normalizer.transformEvent(mockItemStarted(agentMessage('msg-1', 'Hello')) as never);
      const chunks = normalizer.transformEvent(
        mockItemCompleted(agentMessage('msg-1', 'Hello')) as never,
      );
      expect(chunks).toEqual([]);
    });

    it('emits metadata + final text on completed with no prior started/updated', () => {
      // Real Codex runtime: text only appears on item.completed, not on started/updated
      const chunks = normalizer.transformEvent(
        mockItemCompleted(agentMessage('msg-1', 'Hello world')) as never,
      );
      expect(chunks).toEqual([
        { type: 'message_metadata', messageId: expect.stringMatching(/^msg::[0-9a-f-]{36}$/), timestamp: expect.any(Number) },
        { type: 'text', content: 'Hello world' },
      ]);
    });

    it('emits delta on completed when completed text extends beyond updated', () => {
      normalizer.transformEvent(mockItemUpdated(agentMessage('msg-1', 'Hello')) as never);
      const chunks = normalizer.transformEvent(
        mockItemCompleted(agentMessage('msg-1', 'Hello world')) as never,
      );
      expect(chunks).toEqual([{ type: 'text', content: ' world' }]);
    });

    it('emits nothing for duplicate text (same length)', () => {
      normalizer.transformEvent(mockItemStarted(agentMessage('msg-1', 'Hi')) as never);
      const chunks = normalizer.transformEvent(
        mockItemUpdated(agentMessage('msg-1', 'Hi')) as never,
      );
      expect(chunks).toEqual([]);
    });

    it('emits metadata only (no text) for empty initial text', () => {
      const chunks = normalizer.transformEvent(
        mockItemStarted(agentMessage('msg-1', '')) as never,
      );
      expect(chunks).toEqual([
        { type: 'message_metadata', messageId: expect.stringMatching(/^msg::[0-9a-f-]{36}$/), timestamp: expect.any(Number) },
      ]);
    });

    it('emits structured_output backend_event on completed when outputSchema is set and text is JSON', () => {
      const structuredNormaliser = new CodexStreamNormalizer({ outputSchema: { type: 'object' } });
      structuredNormaliser.transformEvent(mockItemStarted(agentMessage('msg-1', '{"status":"ok"}')) as never);
      const chunks = structuredNormaliser.transformEvent(
        mockItemCompleted(agentMessage('msg-1', '{"status":"ok"}')) as never,
      );
      expect(chunks).toEqual([
        expect.objectContaining({
          type: 'backend_event',
          source: 'codex',
          event: 'structured_output',
          status: 'received',
          content: '{"status":"ok"}',
          metadata: { structuredOutput: { status: 'ok' } },
        }),
      ]);
    });

    it('does not emit structured_output when outputSchema is set but text is not JSON', () => {
      const structuredNormaliser = new CodexStreamNormalizer({ outputSchema: { type: 'object' } });
      structuredNormaliser.transformEvent(mockItemStarted(agentMessage('msg-1', 'Hello world')) as never);
      const chunks = structuredNormaliser.transformEvent(
        mockItemCompleted(agentMessage('msg-1', 'Hello world')) as never,
      );
      expect(chunks).toEqual([]);
    });

    it('does not emit structured_output when outputSchema is not set', () => {
      normalizer.transformEvent(mockItemStarted(agentMessage('msg-1', '{"status":"ok"}')) as never);
      const chunks = normalizer.transformEvent(
        mockItemCompleted(agentMessage('msg-1', '{"status":"ok"}')) as never,
      );
      expect(chunks).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Item lifecycle — reasoning
  // -------------------------------------------------------------------------

  describe('reasoning', () => {
    it('emits thinking on started', () => {
      const chunks = normalizer.transformEvent(
        mockItemStarted(reasoning('r-1', 'Let me think')) as never,
      );
      expect(chunks).toEqual([{ type: 'thinking', content: 'Let me think', partId: 'r-1' }]);
    });

    it('emits thinking delta on updated', () => {
      normalizer.transformEvent(mockItemStarted(reasoning('r-1', 'Step 1')) as never);
      const chunks = normalizer.transformEvent(
        mockItemUpdated(reasoning('r-1', 'Step 1: analyze')) as never,
      );
      expect(chunks).toEqual([{ type: 'thinking', content: ': analyze', partId: 'r-1' }]);
    });

    it('emits nothing on completed after started (thinking already emitted)', () => {
      normalizer.transformEvent(mockItemStarted(reasoning('r-1', 'Done')) as never);
      const chunks = normalizer.transformEvent(
        mockItemCompleted(reasoning('r-1', 'Done')) as never,
      );
      expect(chunks).toEqual([]);
    });

    it('emits final thinking on completed with no prior started/updated', () => {
      const chunks = normalizer.transformEvent(
        mockItemCompleted(reasoning('r-1', 'Deep thought')) as never,
      );
      expect(chunks).toEqual([{ type: 'thinking', content: 'Deep thought', partId: 'r-1' }]);
    });

    it('emits thinking delta on completed when text extends beyond updated', () => {
      normalizer.transformEvent(mockItemUpdated(reasoning('r-1', 'Step 1')) as never);
      const chunks = normalizer.transformEvent(
        mockItemCompleted(reasoning('r-1', 'Step 1: final')) as never,
      );
      expect(chunks).toEqual([{ type: 'thinking', content: ': final', partId: 'r-1' }]);
    });
  });

  // -------------------------------------------------------------------------
  // Item lifecycle — command_execution
  // -------------------------------------------------------------------------

  describe('command_execution', () => {
    it('full lifecycle: started → updated → completed', () => {
      // started
      const started = normalizer.transformEvent(
        mockItemStarted(commandExecution('cmd-1', 'npm test')) as never,
      );
      expect(started).toEqual([{
        type: 'tool_use',
        id: 'cmd-1',
        name: 'command_execution',
        kind: 'builtin',
        input: { command: 'npm test' },
      }]);

      // updated
      const updated = normalizer.transformEvent(
        mockItemUpdated(commandExecution('cmd-1', 'npm test', { aggregated_output: 'running...', status: 'in_progress' })) as never,
      );
      expect(updated).toEqual([{
        type: 'backend_event',
        source: 'codex',
        event: 'tool_progress',
        id: 'cmd-1',
        name: 'command_execution',
        status: 'in_progress',
        content: 'running...',
      }]);

      // completed
      const completed = normalizer.transformEvent(
        mockItemCompleted(commandExecution('cmd-1', 'npm test', { aggregated_output: 'all tests passed', status: 'completed', exit_code: 0 })) as never,
      );
      expect(completed).toEqual([{
        type: 'tool_result',
        toolUseId: 'cmd-1',
        content: 'all tests passed',
        isError: false,
      }]);
    });

    it('marks tool_result as error when command fails', () => {
      normalizer.transformEvent(
        mockItemStarted(commandExecution('cmd-2', 'bad-cmd')) as never,
      );
      const chunks = normalizer.transformEvent(
        mockItemCompleted(commandExecution('cmd-2', 'bad-cmd', { status: 'failed', exit_code: 1 })) as never,
      );
      expect(chunks[0]).toEqual(
        expect.objectContaining({ type: 'tool_result', isError: true }),
      );
    });

    it('omits content when aggregated_output is empty on update', () => {
      const chunks = normalizer.transformEvent(
        mockItemUpdated(commandExecution('cmd-3', 'npm test', { aggregated_output: '' })) as never,
      );
      expect(chunks).toEqual([{
        type: 'backend_event',
        source: 'codex',
        event: 'tool_progress',
        id: 'cmd-3',
        name: 'command_execution',
        status: 'in_progress',
      }]);
    });
  });

  // -------------------------------------------------------------------------
  // Item lifecycle — file_change
  // -------------------------------------------------------------------------

  describe('file_change', () => {
    it('emits file_edited + tool_use on started, tool_result on completed', () => {
      const changes = [
        { path: '/src/foo.ts', kind: 'update' as const },
        { path: '/src/bar.ts', kind: 'add' as const },
      ];

      // started
      const started = normalizer.transformEvent(
        mockItemStarted(fileChange('fc-1', changes)) as never,
      );
      expect(started).toEqual([
        { type: 'file_edited', file: '/src/foo.ts' },
        { type: 'file_edited', file: '/src/bar.ts' },
        {
          type: 'tool_use',
          id: 'fc-1',
          name: 'file_change',
          kind: 'builtin',
          input: { changes: [{ path: '/src/foo.ts', kind: 'update' }, { path: '/src/bar.ts', kind: 'add' }] },
        },
      ]);

      // completed
      const completed = normalizer.transformEvent(
        mockItemCompleted(fileChange('fc-1', changes, 'completed')) as never,
      );
      expect(completed).toEqual([{
        type: 'tool_result',
        toolUseId: 'fc-1',
        content: 'Patch completed',
        isError: false,
      }]);
    });

    it('marks tool_result as error on failed patch', () => {
      normalizer.transformEvent(
        mockItemStarted(fileChange('fc-2', [{ path: '/x.ts', kind: 'delete' }])) as never,
      );
      const chunks = normalizer.transformEvent(
        mockItemCompleted(fileChange('fc-2', [{ path: '/x.ts', kind: 'delete' }], 'failed')) as never,
      );
      expect(chunks[0]).toEqual(
        expect.objectContaining({ type: 'tool_result', isError: true }),
      );
    });

    it('emits nothing on updated', () => {
      normalizer.transformEvent(
        mockItemStarted(fileChange('fc-3', [{ path: '/a.ts', kind: 'update' }])) as never,
      );
      const chunks = normalizer.transformEvent(
        mockItemUpdated(fileChange('fc-3', [{ path: '/a.ts', kind: 'update' }])) as never,
      );
      expect(chunks).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Item lifecycle — mcp_tool_call
  // -------------------------------------------------------------------------

  describe('mcp_tool_call', () => {
    it('full lifecycle: started → completed with result', () => {
      // started
      const started = normalizer.transformEvent(
        mockItemStarted(mcpToolCall('mcp-1', 'filesystem', 'read_file', { arguments: { path: '/foo.ts' } })) as never,
      );
      expect(started).toEqual([{
        type: 'tool_use',
        id: 'mcp-1',
        name: 'read_file',
        kind: 'mcp',
        input: { path: '/foo.ts' },
        toolMetadata: { server: 'filesystem' },
      }]);

      // completed with result
      const completed = normalizer.transformEvent(
        mockItemCompleted(mcpToolCall('mcp-1', 'filesystem', 'read_file', {
          status: 'completed',
          result: { content: [{ type: 'text', text: 'file content' }], structured_content: null },
        })) as never,
      );
      expect(completed[0].type).toBe('tool_result');
      expect(completed[0]).toEqual(
        expect.objectContaining({ toolUseId: 'mcp-1', isError: false }),
      );
    });

    it('completed with error', () => {
      normalizer.transformEvent(
        mockItemStarted(mcpToolCall('mcp-2', 'git', 'status')) as never,
      );
      const chunks = normalizer.transformEvent(
        mockItemCompleted(mcpToolCall('mcp-2', 'git', 'status', {
          status: 'failed',
          error: { message: 'not a git repo' },
        })) as never,
      );
      expect(chunks).toEqual([{
        type: 'tool_result',
        toolUseId: 'mcp-2',
        content: 'not a git repo',
        isError: true,
      }]);
    });

    it('updated emits tool_progress', () => {
      normalizer.transformEvent(
        mockItemStarted(mcpToolCall('mcp-3', 'web', 'fetch')) as never,
      );
      const chunks = normalizer.transformEvent(
        mockItemUpdated(mcpToolCall('mcp-3', 'web', 'fetch', { status: 'in_progress' })) as never,
      );
      expect(chunks).toEqual([{
        type: 'backend_event',
        source: 'codex',
        event: 'tool_progress',
        id: 'mcp-3',
        name: 'fetch',
        status: 'in_progress',
      }]);
    });
  });

  // -------------------------------------------------------------------------
  // Item lifecycle — web_search
  // -------------------------------------------------------------------------

  describe('web_search', () => {
    it('emits tool_use on started (visible tool block)', () => {
      const chunks = normalizer.transformEvent(
        mockItemStarted(webSearch('ws-1', 'latest TypeScript features')) as never,
      );
      expect(chunks).toEqual([{
        type: 'tool_use',
        id: 'ws-1',
        name: 'web_search',
        kind: 'builtin',
        input: { query: 'latest TypeScript features' },
      }]);
    });

    it('emits tool_result on completed (visible result block)', () => {
      const chunks = normalizer.transformEvent(
        mockItemCompleted(webSearch('ws-2', 'OpenAI latest news')) as never,
      );
      expect(chunks).toEqual([{
        type: 'tool_result',
        toolUseId: 'ws-2',
        content: 'Web search completed',
        isError: false,
      }]);
    });

    it('emits backend_event tool_progress on updated', () => {
      const chunks = normalizer.transformEvent(
        mockItemUpdated(webSearch('ws-3', 'searching...')) as never,
      );
      expect(chunks).toEqual([{
        type: 'backend_event',
        source: 'codex',
        event: 'tool_progress',
        id: 'ws-3',
        name: 'web_search',
        status: 'updated',
        content: 'searching...',
      }]);
    });

    it('full lifecycle: started → updated → completed', () => {
      const allChunks: unknown[] = [];

      allChunks.push(...normalizer.transformEvent(
        mockItemStarted(webSearch('ws-4', 'React 19 features')) as never,
      ));
      allChunks.push(...normalizer.transformEvent(
        mockItemUpdated(webSearch('ws-4', 'React 19 features')) as never,
      ));
      allChunks.push(...normalizer.transformEvent(
        mockItemCompleted(webSearch('ws-4', 'React 19 features')) as never,
      ));

      expect(allChunks).toEqual([
        { type: 'tool_use', id: 'ws-4', name: 'web_search', kind: 'builtin', input: { query: 'React 19 features' } },
        { type: 'backend_event', source: 'codex', event: 'tool_progress', id: 'ws-4', name: 'web_search', status: 'updated', content: 'React 19 features' },
        { type: 'tool_result', toolUseId: 'ws-4', content: 'Web search completed', isError: false },
      ]);
    });

    it('never emits structured_output (avoids StreamChunkRouter collision)', () => {
      const chunks = normalizer.transformEvent(
        mockItemStarted(webSearch('ws-1', 'query')) as never,
      );
      expect(chunks[0]).not.toEqual(
        expect.objectContaining({ event: 'structured_output' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Item lifecycle — todo_list
  // -------------------------------------------------------------------------

  describe('todo_list', () => {
    it('emits tool_use on started with mapped todos', () => {
      const items = [
        { text: 'Step 1', completed: false },
        { text: 'Step 2', completed: true },
      ];
      const chunks = normalizer.transformEvent(
        mockItemStarted(todoList('tl-1', items)) as never,
      );
      expect(chunks).toEqual([{
        type: 'tool_use',
        id: 'tl-1',
        name: 'todowrite',
        kind: 'builtin',
        input: {
          todos: [
            { content: 'Step 1', status: 'pending' },
            { content: 'Step 2', status: 'completed' },
          ],
        },
      }]);
    });

    it('emits refreshed tool_use + tool_result on completed when started was seen', () => {
      normalizer.transformEvent(
        mockItemStarted(todoList('tl-2', [
          { text: 'A', completed: false },
          { text: 'B', completed: true },
        ])) as never,
      );
      const chunks = normalizer.transformEvent(
        mockItemCompleted(todoList('tl-2', [
          { text: 'A', completed: true },
          { text: 'B', completed: true },
        ])) as never,
      );
      expect(chunks).toEqual([
        {
          type: 'tool_use',
          id: 'tl-2',
          name: 'todowrite',
          kind: 'builtin',
          input: {
            todos: [
              { content: 'A', status: 'completed' },
              { content: 'B', status: 'completed' },
            ],
          },
        },
        {
          type: 'tool_result',
          toolUseId: 'tl-2',
          content: 'Todo list: 2 items (2 completed)',
          isError: false,
        },
      ]);
    });

    it('refreshes todo snapshot on completed when todos progressed from started (3-item regression)', () => {
      // Regression for Checkpoint 7B: Codex todo_list must refresh the
      // snapshot on completed so the dock/transcript don't stay stale.
      normalizer.transformEvent(
        mockItemStarted(todoList('tl-2b', [
          { text: 'Step 1', completed: true },
          { text: 'Step 2', completed: false },
          { text: 'Step 3', completed: false },
        ])) as never,
      );
      const chunks = normalizer.transformEvent(
        mockItemCompleted(todoList('tl-2b', [
          { text: 'Step 1', completed: true },
          { text: 'Step 2', completed: true },
          { text: 'Step 3', completed: true },
        ])) as never,
      );
      expect(chunks).toEqual([
        {
          type: 'tool_use',
          id: 'tl-2b',
          name: 'todowrite',
          kind: 'builtin',
          input: {
            todos: [
              { content: 'Step 1', status: 'completed' },
              { content: 'Step 2', status: 'completed' },
              { content: 'Step 3', status: 'completed' },
            ],
          },
        },
        {
          type: 'tool_result',
          toolUseId: 'tl-2b',
          content: 'Todo list: 3 items (3 completed)',
          isError: false,
        },
      ]);
    });

    it('emits tool_use on completed when started was never seen', () => {
      const chunks = normalizer.transformEvent(
        mockItemCompleted(todoList('tl-3', [
          { text: 'Only item', completed: true },
        ])) as never,
      );
      expect(chunks).toEqual([
        {
          type: 'tool_use',
          id: 'tl-3',
          name: 'todowrite',
          kind: 'builtin',
          input: {
            todos: [
              { content: 'Only item', status: 'completed' },
            ],
          },
        },
        {
          type: 'tool_result',
          toolUseId: 'tl-3',
          content: 'Todo list: 1 items (1 completed)',
          isError: false,
        },
      ]);
    });

    it('emits backend_event diagnostic on updated', () => {
      normalizer.transformEvent(
        mockItemStarted(todoList('tl-4', [{ text: 'X', completed: false }])) as never,
      );
      const chunks = normalizer.transformEvent(
        mockItemUpdated(todoList('tl-4', [{ text: 'X', completed: true }])) as never,
      );
      expect(chunks).toEqual([{
        type: 'backend_event',
        source: 'codex',
        event: 'tool_progress',
        id: 'tl-4',
        name: 'todo_list',
        status: 'updated',
        metadata: { items: [{ text: 'X', completed: true }] },
      }]);
    });

    it('handles empty todo list', () => {
      const chunks = normalizer.transformEvent(
        mockItemStarted(todoList('tl-5', [])) as never,
      );
      expect(chunks).toEqual([{
        type: 'tool_use',
        id: 'tl-5',
        name: 'todowrite',
        kind: 'builtin',
        input: { todos: [] },
      }]);
    });

    it('never emits structured_output (avoids StreamChunkRouter collision)', () => {
      const chunks = normalizer.transformEvent(
        mockItemStarted(todoList('tl-6', [])) as never,
      );
      expect(chunks[0]).toEqual(
        expect.objectContaining({ type: 'tool_use' }),
      );
      expect(chunks[0]).not.toEqual(
        expect.objectContaining({ event: 'structured_output' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Item lifecycle — error item
  // -------------------------------------------------------------------------

  describe('error item', () => {
    it('emits error chunk', () => {
      const chunks = normalizer.transformEvent(
        mockItemStarted(errorItem('err-1', 'non-fatal failure')) as never,
      );
      expect(chunks).toEqual([{ type: 'error', content: 'non-fatal failure' }]);
    });
  });

  // -------------------------------------------------------------------------
  // reset()
  // -------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears sessionId and tracking maps', () => {
      normalizer.transformEvent(mockThreadStarted('t-1') as never);
      normalizer.transformEvent(mockItemStarted(agentMessage('m-1', 'Hi')) as never);
      normalizer.reset();
      // After reset, session should be gone — next turn.completed won't have sessionId
      const chunks = normalizer.transformEvent(
        mockTurnCompleted({ input_tokens: 5, output_tokens: 3 }) as never,
      );
      expect(chunks[0]).not.toHaveProperty('sessionId');
    });
  });

  // -------------------------------------------------------------------------
  // Factory function
  // -------------------------------------------------------------------------

  describe('createCodexStreamNormalizer()', () => {
    it('creates an instance with options', () => {
      const instance = createCodexStreamNormalizer({ sessionId: 'test-session' });
      expect(instance).toBeInstanceOf(CodexStreamNormalizer);
    });
  });

  // -------------------------------------------------------------------------
  // Full pipeline integration
  // -------------------------------------------------------------------------

  describe('full pipeline', () => {
    it('processes a complete conversation turn', () => {
      const allChunks: unknown[] = [];

      const events = [
        mockThreadStarted('thread-42'),
        mockTurnStarted(),
        mockItemStarted(reasoning('r-1', 'Thinking...')),
        mockItemCompleted(reasoning('r-1', 'Thinking...')),
        mockItemStarted(agentMessage('msg-1', '')),
        mockItemUpdated(agentMessage('msg-1', 'Hello')),
        mockItemUpdated(agentMessage('msg-1', 'Hello world')),
        mockItemCompleted(agentMessage('msg-1', 'Hello world')),
        mockTurnCompleted({ input_tokens: 100, output_tokens: 50, reasoning_output_tokens: 10 }),
      ];

      for (const event of events) {
        const chunks = normalizer.transformEvent(event as never);
        allChunks.push(...chunks);
      }

      expect(allChunks).toEqual([
        // thread.started → no chunks (sessionId captured internally)
        // turn.started → message_start only
        { type: 'message_start' },
        // reasoning started
        { type: 'thinking', content: 'Thinking...', partId: 'r-1' },
        // reasoning completed → nothing (already emitted)
        // agent_message started (empty) → message_metadata + empty text
        { type: 'message_metadata', messageId: expect.stringMatching(/^thread-42::[0-9a-f-]{36}$/), timestamp: expect.any(Number), sessionId: 'thread-42' },
        // agent_message updated → "Hello"
        { type: 'text', content: 'Hello' },
        // agent_message updated → " world"
        { type: 'text', content: ' world' },
        // agent_message completed → nothing (already emitted)
        // turn.completed
        { type: 'usage', inputTokens: 100, outputTokens: 60, sessionId: 'thread-42' },
        { type: 'message_stop' },
      ]);
    });

    it('processes completed-only turn (no streaming, text on completed only)', () => {
      // Real Obsidian runtime: text appears only on item.completed
      const allChunks: unknown[] = [];

      const events = [
        mockThreadStarted('thread-99'),
        mockTurnStarted(),
        mockItemCompleted(agentMessage('msg-1', 'Final answer')),
        mockTurnCompleted({ input_tokens: 50, output_tokens: 20, reasoning_output_tokens: 0 }),
      ];

      for (const event of events) {
        const chunks = normalizer.transformEvent(event as never);
        allChunks.push(...chunks);
      }

      expect(allChunks).toEqual([
        { type: 'message_start' },
        // agent_message completed → emits metadata + full text since no prior started/updated
        { type: 'message_metadata', messageId: expect.stringMatching(/^thread-99::[0-9a-f-]{36}$/), timestamp: expect.any(Number), sessionId: 'thread-99' },
        { type: 'text', content: 'Final answer' },
        { type: 'usage', inputTokens: 50, outputTokens: 20, sessionId: 'thread-99' },
        { type: 'message_stop' },
      ]);
    });

    it('processes completed-only turn with reasoning', () => {
      const allChunks: unknown[] = [];

      const events = [
        mockThreadStarted('thread-100'),
        mockTurnStarted(),
        mockItemCompleted(reasoning('r-1', 'Analysis complete')),
        mockItemCompleted(agentMessage('msg-1', 'Result')),
        mockTurnCompleted({ input_tokens: 50, output_tokens: 20, reasoning_output_tokens: 10 }),
      ];

      for (const event of events) {
        const chunks = normalizer.transformEvent(event as never);
        allChunks.push(...chunks);
      }

      expect(allChunks).toEqual([
        { type: 'message_start' },
        { type: 'thinking', content: 'Analysis complete', partId: 'r-1' },
        { type: 'message_metadata', messageId: expect.stringMatching(/^thread-100::[0-9a-f-]{36}$/), timestamp: expect.any(Number), sessionId: 'thread-100' },
        { type: 'text', content: 'Result' },
        { type: 'usage', inputTokens: 50, outputTokens: 30, sessionId: 'thread-100' },
        { type: 'message_stop' },
      ]);
    });

    it('emits unique per-turn messageId across multiple turns in one thread', () => {
      const allChunks: unknown[] = [];

      const events = [
        mockThreadStarted('thread-multi'),
        // Turn 1
        mockTurnStarted(),
        mockItemCompleted(agentMessage('msg-1', 'First answer')),
        mockTurnCompleted({ input_tokens: 10, output_tokens: 5 }),
        // Turn 2
        mockTurnStarted(),
        mockItemCompleted(agentMessage('msg-2', 'Second answer')),
        mockTurnCompleted({ input_tokens: 20, output_tokens: 10 }),
      ];

      for (const event of events) {
        const chunks = normalizer.transformEvent(event as never);
        allChunks.push(...chunks);
      }

      const metadataChunks = allChunks.filter(c => (c as Record<string, unknown>).type === 'message_metadata');
      expect(metadataChunks).toHaveLength(2);
      const mid1 = (metadataChunks[0] as Record<string, unknown>).messageId as string;
      const mid2 = (metadataChunks[1] as Record<string, unknown>).messageId as string;
      // Both have threadId prefix + UUID suffix
      expect(mid1).toMatch(/^thread-multi::[0-9a-f-]{36}$/);
      expect(mid2).toMatch(/^thread-multi::[0-9a-f-]{36}$/);
      // But are distinct UUIDs
      expect(mid1).not.toBe(mid2);
    });
  });
});
