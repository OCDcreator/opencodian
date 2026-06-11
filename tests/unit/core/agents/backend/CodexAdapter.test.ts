/* eslint-disable max-lines -- Adapter lifecycle, session, identity, DI, sendMessage, and model-passthrough coverage kept in one cohesive file. */
/**
 * CodexAdapter tests.
 *
 * These tests validate the adapter skeleton: identity, capabilities, lifecycle,
 * session management, status change handlers, and the DI seam.
 * No real API calls are made — all Codex SDK interactions are mocked.
 */

/* eslint-disable max-lines-per-function -- Adapter test suite keeps lifecycle, session, DI, and sendMessage tests in one cohesive describe block. */

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import {
  CodexAdapter,
  type CodexAdapterOptions,
} from '../../../../../src/core/agents/backend';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock Codex SDK instance for DI. */
function createMockCodex() {
  const mockThread = {
    id: 'mock-thread-1',
    runStreamed: jest.fn(),
    run: jest.fn(),
  };

  return {
    startThread: jest.fn().mockReturnValue(mockThread),
    resumeThread: jest.fn().mockReturnValue(mockThread),
    _mockThread: mockThread,
  };
}

/** Creates adapter options with a DI mock factory. */
function createAdapterOptions(
  overrides?: Partial<CodexAdapterOptions>,
): CodexAdapterOptions & { _mockCodex: ReturnType<typeof createMockCodex> } {
  const mockCodex = createMockCodex();
  return {
    createCodex: jest.fn().mockResolvedValue(mockCodex),
    ...overrides,
    _mockCodex: mockCodex,
  } as CodexAdapterOptions & { _mockCodex: ReturnType<typeof createMockCodex> };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexAdapter', () => {
  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  describe('identity', () => {
    it('has correct kind', () => {
      const adapter = new CodexAdapter();
      expect(adapter.kind).toBe('codex');
    });

    it('has correct displayName', () => {
      const adapter = new CodexAdapter();
      expect(adapter.displayName).toBe('Codex');
    });

    it('has correct description', () => {
      const adapter = new CodexAdapter();
      expect(adapter.description).toBe('OpenAI Codex coding agent');
    });
  });

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  describe('capabilities', () => {
    it('declares only evidence-backed capabilities', () => {
      const adapter = new CodexAdapter();
      const caps = adapter.capabilities;
      expect(caps.has(AgentCapability.Chat)).toBe(true);
      expect(caps.has(AgentCapability.Sessions)).toBe(true);
      expect(caps.has(AgentCapability.Thinking)).toBe(true);
      expect(caps.has(AgentCapability.FileOps)).toBe(true);
      expect(caps.has(AgentCapability.Shell)).toBe(true);
      expect(caps.has(AgentCapability.Todos)).toBe(true); // todo_list items via tool_use → SessionTodoDock
      expect(caps.has(AgentCapability.Permissions)).toBe(true); // sandbox mode selector
    });

    it('does not declare capabilities without evidence', () => {
      const adapter = new CodexAdapter();
      const caps = adapter.capabilities;
      expect(caps.has(AgentCapability.Mcp)).toBe(false);
      expect(caps.has(AgentCapability.Models)).toBe(false);
      expect(caps.has(AgentCapability.Branching)).toBe(false);
      expect(caps.has(AgentCapability.Fork)).toBe(false);
    });

    it('hasCapability() returns true for declared capabilities', () => {
      const adapter = new CodexAdapter();
      expect(adapter.hasCapability(AgentCapability.Chat)).toBe(true);
      expect(adapter.hasCapability(AgentCapability.Sessions)).toBe(true);
    });

    it('hasCapability() returns false for undeclared capabilities', () => {
      const adapter = new CodexAdapter();
      expect(adapter.hasCapability(AgentCapability.Mcp)).toBe(false);
      expect(adapter.hasCapability(AgentCapability.Branching)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('starts with disconnected status', () => {
      const adapter = new CodexAdapter();
      expect(adapter.status).toBe('disconnected');
    });

    it('transitions to connected after start() with DI factory', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      await adapter.start();
      expect(adapter.status).toBe('connected');
      expect(options.createCodex).toHaveBeenCalledTimes(1);
    });

    it('does not re-create Codex on double start()', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      await adapter.start();
      await adapter.start();
      expect(options.createCodex).toHaveBeenCalledTimes(1);
    });

    it('transitions to disconnected after stop()', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      await adapter.start();
      await adapter.stop();
      expect(adapter.status).toBe('disconnected');
    });

    it('transitions to error if factory throws', async () => {
      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockRejectedValue(new Error('no API key')),
      });
      await expect(adapter.start()).rejects.toThrow('no API key');
      expect(adapter.status).toBe('error');
    });

    it('dispose clears all state', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      await adapter.start();
      await adapter.createSession();
      adapter.dispose();
      expect(adapter.status).toBe('disconnected');
    });
  });

  // -------------------------------------------------------------------------
  // Status change handlers
  // -------------------------------------------------------------------------

  describe('onStatusChange', () => {
    it('notifies handlers on status change', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      const handler = jest.fn();
      adapter.onStatusChange(handler);
      await adapter.start();
      expect(handler).toHaveBeenCalledWith('connecting');
      expect(handler).toHaveBeenCalledWith('connected');
    });

    it('disposable unsubscribes handler', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      const handler = jest.fn();
      const sub = adapter.onStatusChange(handler);
      sub.dispose();
      await adapter.start();
      expect(handler).not.toHaveBeenCalled();
    });

    it('continues if handler throws', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      const badHandler = jest.fn().mockImplementation(() => {
        throw new Error('handler error');
      });
      const goodHandler = jest.fn();
      adapter.onStatusChange(badHandler);
      adapter.onStatusChange(goodHandler);
      await adapter.start();
      // Good handler should still be called despite bad handler throwing
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  describe('sessions', () => {
    it('createSession returns a provisional ID', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      const sessionId = await adapter.createSession();
      expect(sessionId).toMatch(/^codex-local-/);
    });

    it('createSession accepts a title parameter', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      const sessionId = await adapter.createSession('Test Session');
      expect(sessionId).toBeTruthy();
    });

    it('deleteSession removes the session', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      const sessionId = await adapter.createSession();
      await adapter.deleteSession(sessionId);
      const session = await adapter.getSession(sessionId);
      expect(session).toBeNull();
    });

    it('getSession returns session info', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      const sessionId = await adapter.createSession();
      const session = await adapter.getSession(sessionId);
      expect(session).toEqual({
        id: sessionId,
        provisionalId: sessionId,
        threadId: null,
      });
    });

    it('getSession returns null for unknown session', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      const session = await adapter.getSession('nonexistent');
      expect(session).toBeNull();
    });

    it('listSessions returns all sessions', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      const id1 = await adapter.createSession();
      const id2 = await adapter.createSession();
      const sessions = await adapter.listSessions!();
      expect(sessions).toHaveLength(2);
      const ids = sessions.map(s => (s as Record<string, unknown>).provisionalId);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it('updateSessionTitle is a no-op', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      // Should not throw
      await expect(adapter.updateSessionTitle('any-id', 'Title')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage
  // -------------------------------------------------------------------------

  describe('sendMessage', () => {
    it('yields error when adapter is not started', async () => {
      const adapter = new CodexAdapter();
      const chunks: unknown[] = [];
      for await (const chunk of adapter.sendMessage({
        sessionId: 'test',
        content: 'hello',
      })) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual([
        { type: 'error', content: 'Codex adapter not started' },
      ]);
    });

    it('yields error when thread creation fails', async () => {
      const mockCodex = createMockCodex();
      mockCodex.startThread.mockImplementation(() => {
        throw new Error('thread creation failed');
      });
      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();

      const chunks: unknown[] = [];
      for await (const chunk of adapter.sendMessage({
        sessionId: 'test',
        content: 'hello',
      })) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]).toEqual(
        expect.objectContaining({ type: 'error' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancelStream
  // -------------------------------------------------------------------------

  describe('cancelStream', () => {
    it('is a no-op when no active stream exists', () => {
      const adapter = new CodexAdapter();
      expect(() => adapter.cancelStream('nonexistent')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // DI seam
  // -------------------------------------------------------------------------

  describe('DI seam', () => {
    it('uses injected createCodex factory', async () => {
      const mockCodex = createMockCodex();
      const factory = jest.fn().mockResolvedValue(mockCodex);
      const adapter = new CodexAdapter({ createCodex: factory });
      await adapter.start();
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('creates thread via injected Codex on sendMessage', async () => {
      const mockCodex = createMockCodex();
      // Set up runStreamed to yield a simple event stream
      mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'real-thread-1' };
          yield { type: 'turn.started' };
          yield {
            type: 'item.started',
            item: { type: 'agent_message', id: 'm-1', text: 'Hello' },
          };
          yield {
            type: 'item.completed',
            item: { type: 'agent_message', id: 'm-1', text: 'Hello' },
          };
          yield {
            type: 'turn.completed',
            usage: { input_tokens: 10, output_tokens: 5 },
          };
        })(),
      });

      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();
      const sessionId = await adapter.createSession();

      const chunks: unknown[] = [];
      for await (const chunk of adapter.sendMessage({
        sessionId,
        content: 'Hi',
      })) {
        chunks.push(chunk);
      }

      expect(mockCodex.startThread).toHaveBeenCalled();
      expect(chunks.some(c => (c as Record<string, unknown>).type === 'text')).toBe(true);
    });

    it('passes outputSchema from request.options.outputFormat to runStreamed', async () => {
      const mockCodex = createMockCodex();
      mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();
      const sessionId = await adapter.createSession();

      const outputFormat = { type: 'json_schema', schema: { type: 'object', properties: { status: { type: 'string' } } } };
      for await (const _ of adapter.sendMessage({
        sessionId,
        content: 'Hi',
        options: { outputFormat },
      })) { void _; }

      expect(mockCodex._mockThread.runStreamed).toHaveBeenCalledWith(
        'Hi',
        expect.objectContaining({ outputSchema: outputFormat.schema }),
      );
    });

    it('converts ImageAttachment[] to UserInput[] with temp files', async () => {
      const mockCodex = createMockCodex();
      mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();
      const sessionId = await adapter.createSession();

      const images = [
        { data: 'iVBORw0KGgo=', mediaType: 'image/png' as const, filename: 'test.png' },
      ];

      for await (const _ of adapter.sendMessage({
        sessionId,
        content: 'Describe this image',
        images,
      })) { void _; }

      const callArg = mockCodex._mockThread.runStreamed.mock.calls[0][0];
      expect(Array.isArray(callArg)).toBe(true);
      expect(callArg).toHaveLength(2);
      expect(callArg[0]).toEqual({ type: 'text', text: 'Describe this image' });
      expect(callArg[1]).toMatchObject({ type: 'local_image', path: expect.stringContaining('test.png') });
    });

    it('falls back to string payload when no images are provided', async () => {
      const mockCodex = createMockCodex();
      mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();
      const sessionId = await adapter.createSession();

      for await (const _ of adapter.sendMessage({
        sessionId,
        content: 'Hello',
      })) { void _; }

      expect(mockCodex._mockThread.runStreamed).toHaveBeenCalledWith(
        'Hello',
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Finding 2: resume semantics
  // -------------------------------------------------------------------------

  describe('resume semantics (Finding 2)', () => {
    it('provisional ID first turn → alias to real thread ID', async () => {
      const mockCodex = createMockCodex();
      mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'real-thread-abc' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();
      const provisionalId = await adapter.createSession();

      const collected: unknown[] = [];
      for await (const chunk of adapter.sendMessage({ sessionId: provisionalId, content: 'hi' })) {
        collected.push(chunk);
      }
      void collected;

      // getSession by provisional ID should show the aliased thread ID
      const session = await adapter.getSession(provisionalId) as Record<string, unknown>;
      expect(session.threadId).toBe('real-thread-abc');

      // getSession by real thread ID should resolve to the same session
      const byAlias = await adapter.getSession('real-thread-abc') as Record<string, unknown>;
      expect(byAlias.provisionalId).toBe(provisionalId);
    });

    it('real thread ID after adapter restart → resumeThread', async () => {
      const mockCodex = createMockCodex();
      mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();

      // Use a real thread ID directly (simulating adapter restart where only thread ID is known)
      const collected: unknown[] = [];
      for await (const chunk of adapter.sendMessage({ sessionId: 'existing-thread-xyz', content: 'continue' })) {
        collected.push(chunk);
      }
      void collected;

      // Should have called resumeThread, not startThread
      expect(mockCodex.resumeThread).toHaveBeenCalledWith('existing-thread-xyz', expect.objectContaining({
        skipGitRepoCheck: true,
      }));
      expect(mockCodex.startThread).not.toHaveBeenCalled();
    });

    it('unknown provisional-looking ID → startThread (not resume)', async () => {
      const mockCodex = createMockCodex();
      mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();

      // A provisional-looking ID that wasn't created via createSession()
      const collected: unknown[] = [];
      for await (const chunk of adapter.sendMessage({ sessionId: 'codex-local-fake-123', content: 'hi' })) {
        collected.push(chunk);
      }
      void collected;

      expect(mockCodex.startThread).toHaveBeenCalled();
      expect(mockCodex.resumeThread).not.toHaveBeenCalled();
    });

    it('known threadId without Thread object → resumeThread with skipGitRepoCheck', async () => {
      // Simulates adapter restart: a new adapter instance receives a persisted
      // thread ID but has no cached Thread object.
      const mockCodex = createMockCodex();
      mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
        workingDirectory: '/my/vault',
      });
      await adapter.start();

      // Send to a real-looking thread ID (simulates persisted conversation resume)
      for await (const _ of adapter.sendMessage({ sessionId: 'thread-abc', content: 'continue' })) { void _; }

      expect(mockCodex.resumeThread).toHaveBeenCalledWith('thread-abc', expect.objectContaining({
        skipGitRepoCheck: true,
        workingDirectory: '/my/vault',
      }));
      expect(mockCodex.startThread).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Auth boundary (auth-repair round)
  // -------------------------------------------------------------------------

  describe('auth boundary', () => {
    it('does not hard-block when no explicit apiKey is provided (DI factory)', async () => {
      // The adapter does not pre-check for an API key. Auth is deferred to
      // the SDK runtime (thread.runStreamed). The DI factory path should
      // succeed regardless of apiKey presence.
      const mockCodex = createMockCodex();
      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();
      expect(adapter.status).toBe('connected');
    });

    it('succeeds when apiKey is provided alongside DI factory', async () => {
      const mockCodex = createMockCodex();
      const adapter = new CodexAdapter({
        apiKey: 'test-key',
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();
      expect(adapter.status).toBe('connected');
    });

    it('default path does not pre-emptively throw "requires API key"', () => {
      // After the auth-repair round, the adapter no longer has an
      // assertApiKeyAvailable() gate. This test documents the design
      // intent: the default (non-DI) path lets the SDK constructor proceed
      // without pre-checking for an API key. Auth failures surface at
      // thread.runStreamed() time.
      //
      // We cannot easily test the dynamic-import default path without
      // mocking import(), but we verify the method was removed:
      const adapter = new CodexAdapter();
      // @ts-expect-error — asserting the private method no longer exists
      expect(typeof adapter.assertApiKeyAvailable).toBe('undefined');
    });
  });

  // -------------------------------------------------------------------------
  // Per-send message identity
  // -------------------------------------------------------------------------

  describe('per-send message identity', () => {
    it('produces different assistant message IDs across two sends on the same session', async () => {
      const mockCodex = createMockCodex();
      let callIndex = 0;
      mockCodex._mockThread.runStreamed.mockImplementation(() => {
        callIndex++;
        const tid = `thread-same`;
        return Promise.resolve({
          events: (async function* () {
            yield { type: 'thread.started', thread_id: tid };
            yield { type: 'turn.started' };
            yield {
              type: 'item.completed',
              item: { type: 'agent_message', id: `item-0`, text: `Answer ${callIndex}` },
            };
            yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
          })(),
        });
      });

      const adapter = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex),
      });
      await adapter.start();
      const sessionId = await adapter.createSession();

      // First send
      const chunks1: unknown[] = [];
      for await (const chunk of adapter.sendMessage({ sessionId, content: 'first' })) {
        chunks1.push(chunk);
      }

      // Second send on the same session
      const chunks2: unknown[] = [];
      for await (const chunk of adapter.sendMessage({ sessionId, content: 'second' })) {
        chunks2.push(chunk);
      }

      const meta1 = chunks1.find(c => (c as Record<string, unknown>).type === 'message_metadata') as Record<string, unknown> | undefined;
      const meta2 = chunks2.find(c => (c as Record<string, unknown>).type === 'message_metadata') as Record<string, unknown> | undefined;

      expect(meta1).toBeDefined();
      expect(meta2).toBeDefined();
      // messageId is generated via crypto.randomUUID() — unique per turn
      const mid1 = meta1!.messageId as string;
      const mid2 = meta2!.messageId as string;
      expect(mid1).toMatch(/::[0-9a-f-]{36}$/);
      expect(mid2).toMatch(/::[0-9a-f-]{36}$/);
      expect(mid1).not.toBe(mid2);
    });

    it('produces unique identity after adapter restart on resumed thread', async () => {
      // Simulates persisted thread resume: a new adapter instance receives
      // the same threadId from persistence. crypto.randomUUID() ensures
      // uniqueness even though the SDK reuses item-0 per turn and the
      // adapter has no memory of previous send counts.
      const mockCodex1 = createMockCodex();
      mockCodex1._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'persistent-thread-1' };
          yield { type: 'turn.started' };
          yield {
            type: 'item.completed',
            item: { type: 'agent_message', id: 'item-0', text: 'Before restart' },
          };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      // First adapter lifecycle
      const adapter1 = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex1),
      });
      await adapter1.start();
      const chunks1: unknown[] = [];
      for await (const chunk of adapter1.sendMessage({ sessionId: 'persistent-thread-1', content: 'before restart' })) {
        chunks1.push(chunk);
      }
      const meta1 = chunks1.find(c => (c as Record<string, unknown>).type === 'message_metadata') as Record<string, unknown> | undefined;

      // Simulate adapter restart — fresh instance, same threadId resumed
      const mockCodex2 = createMockCodex();
      mockCodex2._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'persistent-thread-1' };
          yield { type: 'turn.started' };
          yield {
            type: 'item.completed',
            item: { type: 'agent_message', id: 'item-0', text: 'After restart' },
          };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const adapter2 = new CodexAdapter({
        createCodex: jest.fn().mockResolvedValue(mockCodex2),
      });
      await adapter2.start();
      const chunks2: unknown[] = [];
      for await (const chunk of adapter2.sendMessage({ sessionId: 'persistent-thread-1', content: 'after restart' })) {
        chunks2.push(chunk);
      }
      const meta2 = chunks2.find(c => (c as Record<string, unknown>).type === 'message_metadata') as Record<string, unknown> | undefined;

      expect(meta1).toBeDefined();
      expect(meta2).toBeDefined();
      const mid1 = meta1!.messageId as string;
      const mid2 = meta2!.messageId as string;
      // Both contain the persisted threadId prefix + unique UUID
      expect(mid1).toMatch(/^persistent-thread-1::[0-9a-f-]{36}$/);
      expect(mid2).toMatch(/^persistent-thread-1::[0-9a-f-]{36}$/);
      // But are different UUIDs — even after restart with same threadId and same SDK item-0
      expect(mid1).not.toBe(mid2);
    });
  });

  // -------------------------------------------------------------------------
  // Model passthrough
  // -------------------------------------------------------------------------

  describe('model passthrough', () => {
    it('passes model option to startThread via buildThreadOptions', async () => {
      const options = createAdapterOptions({ model: 'o4-mini' });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      // Wire up a mock stream so sendMessage completes
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-1' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const chunks: unknown[] = [];
      for await (const chunk of adapter.sendMessage({ sessionId, content: 'test' })) {
        chunks.push(chunk);
      }

      // startThread should have been called with ThreadOptions that includes model
      expect(options._mockCodex.startThread).toHaveBeenCalledTimes(1);
      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.model).toBe('o4-mini');
      expect(threadOpts.skipGitRepoCheck).toBe(true);
    });

    it('omits model from ThreadOptions when not set', async () => {
      const options = createAdapterOptions(); // no model
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-2' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const chunks: unknown[] = [];
      for await (const chunk of adapter.sendMessage({ sessionId, content: 'test' })) {
        chunks.push(chunk);
      }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.model).toBeUndefined();
    });

    it('passes model to resumeThread when resuming a session', async () => {
      const options = createAdapterOptions({ model: 'o3' });
      const adapter = new CodexAdapter(options);
      await adapter.start();

      // Simulate a restored session: has threadId but no thread object
      // (adapter restart scenario)
      const sessionId = 'external-thread-o3-resume';
      // Directly inject a session entry with threadId but no thread
      (adapter as unknown as { sessions: Map<string, { provisionalId: string; threadId: string; thread: unknown }> })
        .sessions.set(sessionId, {
          provisionalId: sessionId,
          threadId: 'real-thread-o3',
          thread: null,
        });

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 'real-thread-o3' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      const chunks: unknown[] = [];
      for await (const chunk of adapter.sendMessage({ sessionId, content: 'resumed' })) {
        chunks.push(chunk);
      }

      // resumeThread should have been called with the stored threadId + model
      expect(options._mockCodex.resumeThread).toHaveBeenCalledTimes(1);
      const resumeArgs = options._mockCodex.resumeThread.mock.calls[0];
      expect(resumeArgs[0]).toBe('real-thread-o3');
      const resumeOpts = resumeArgs[1] as Record<string, unknown>;
      expect(resumeOpts.model).toBe('o3');
      expect(resumeOpts.skipGitRepoCheck).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Sandbox mode passthrough
  // -------------------------------------------------------------------------

  describe('sandboxMode passthrough', () => {
    it('passes sandboxMode to startThread via buildThreadOptions', async () => {
      const options = createAdapterOptions({ sandboxMode: 'read-only' });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-sandbox' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      expect(options._mockCodex.startThread).toHaveBeenCalledTimes(1);
      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.sandboxMode).toBe('read-only');
      expect(threadOpts.skipGitRepoCheck).toBe(true);
    });

    it('omits sandboxMode from ThreadOptions when not set', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-nosandbox' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.sandboxMode).toBeUndefined();
    });

    it('passes sandboxMode and model together', async () => {
      const options = createAdapterOptions({ model: 'o4-mini', sandboxMode: 'danger-full-access' });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-both' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.model).toBe('o4-mini');
      expect(threadOpts.sandboxMode).toBe('danger-full-access');
    });
  });

  // -------------------------------------------------------------------------
  // modelReasoningEffort passthrough
  // -------------------------------------------------------------------------

  describe('modelReasoningEffort passthrough', () => {
    it('passes modelReasoningEffort to startThread', async () => {
      const options = createAdapterOptions({ modelReasoningEffort: 'high' });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-effort' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      expect(options._mockCodex.startThread).toHaveBeenCalledTimes(1);
      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.modelReasoningEffort).toBe('high');
    });

    it('omits modelReasoningEffort when not set', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-noeffort' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.modelReasoningEffort).toBeUndefined();
    });

    it('passes all ThreadOptions fields together', async () => {
      const options = createAdapterOptions({
        model: 'o4-mini',
        sandboxMode: 'workspace-write',
        modelReasoningEffort: 'xhigh',
      });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-all' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.model).toBe('o4-mini');
      expect(threadOpts.sandboxMode).toBe('workspace-write');
      expect(threadOpts.modelReasoningEffort).toBe('xhigh');
      expect(threadOpts.skipGitRepoCheck).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // additionalDirectories passthrough
  // -------------------------------------------------------------------------

  describe('additionalDirectories passthrough', () => {
    it('passes additionalDirectories to startThread', async () => {
      const options = createAdapterOptions({ additionalDirectories: ['/tmp/proj-a', '/tmp/proj-b'] });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-dirs' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.additionalDirectories).toEqual(['/tmp/proj-a', '/tmp/proj-b']);
    });

    it('omits additionalDirectories when empty array', async () => {
      const options = createAdapterOptions({ additionalDirectories: [] });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-nodirs' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.additionalDirectories).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // networkAccessEnabled + webSearchMode passthrough
  // -------------------------------------------------------------------------

  describe('networkAccessEnabled passthrough', () => {
    it('passes networkAccessEnabled=true to startThread', async () => {
      const options = createAdapterOptions({ networkAccessEnabled: true });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-net' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.networkAccessEnabled).toBe(true);
    });

    it('passes networkAccessEnabled=false explicitly', async () => {
      const options = createAdapterOptions({ networkAccessEnabled: false });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-netoff' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.networkAccessEnabled).toBe(false);
    });
  });

  describe('webSearchMode passthrough', () => {
    it('passes webSearchMode to startThread', async () => {
      const options = createAdapterOptions({ webSearchMode: 'live' });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-web' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.webSearchMode).toBe('live');
    });

    it('omits webSearchMode when not set', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-noweb' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.webSearchMode).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // updateModelReasoningEffort — runtime effort update
  // -------------------------------------------------------------------------

  describe('updateModelReasoningEffort', () => {
    it('updates effort used by subsequent thread creation', async () => {
      const options = createAdapterOptions({ modelReasoningEffort: 'medium' });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-updated' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      // Update effort before sending
      adapter.updateModelReasoningEffort('xhigh');

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.modelReasoningEffort).toBe('xhigh');
    });

    it('does not affect already-created threads', async () => {
      const options = createAdapterOptions({ modelReasoningEffort: 'low' });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      // First send uses original effort
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-first' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });
      for await (const _ of adapter.sendMessage({ sessionId, content: 'first' })) { void _; }

      // First thread was created with the original effort
      const firstThreadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(firstThreadOpts.modelReasoningEffort).toBe('low');

      // Update effort
      adapter.updateModelReasoningEffort('high');

      // Second send to the same session resumes the existing thread
      // (the thread was already created, so it uses the existing thread object)
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });
      for await (const _ of adapter.sendMessage({ sessionId, content: 'second' })) { void _; }

      // Verify the adapter's buildThreadOptions() now uses 'high'
      // (the existing thread object is reused, so no new startThread/resumeThread call)
      // but the adapter options are correctly updated
      expect(options._mockCodex.startThread).toHaveBeenCalledTimes(1);
    });

    it('can clear effort by passing undefined', async () => {
      const options = createAdapterOptions({ modelReasoningEffort: 'medium' });
      const adapter = new CodexAdapter(options);
      await adapter.start();

      adapter.updateModelReasoningEffort(undefined);

      const sessionId = await adapter.createSession();
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-cleared' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.modelReasoningEffort).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // updateSandboxMode — runtime sandbox mode update
  // -------------------------------------------------------------------------

  describe('updateSandboxMode', () => {
    it('updates sandbox mode used by subsequent thread creation', async () => {
      const options = createAdapterOptions({ sandboxMode: 'workspace-write' });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-updated' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      adapter.updateSandboxMode('danger-full-access');

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.sandboxMode).toBe('danger-full-access');
    });

    it('can switch to read-only', async () => {
      const options = createAdapterOptions({ sandboxMode: 'workspace-write' });
      const adapter = new CodexAdapter(options);
      await adapter.start();

      adapter.updateSandboxMode('read-only');

      const sessionId = await adapter.createSession();
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-ro' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.sandboxMode).toBe('read-only');
    });

    it('can clear sandbox mode by passing undefined', async () => {
      const options = createAdapterOptions({ sandboxMode: 'workspace-write' });
      const adapter = new CodexAdapter(options);
      await adapter.start();

      adapter.updateSandboxMode(undefined);

      const sessionId = await adapter.createSession();
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-cleared' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.sandboxMode).toBeUndefined();
    });
  });

  describe('updateModel', () => {
    it('updates model used by subsequent thread creation', async () => {
      const options = createAdapterOptions({ model: 'codex-mini-latest' });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-model-update' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      adapter.updateModel('o4-mini');

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.model).toBe('o4-mini');
    });

    it('can clear model by passing undefined', async () => {
      const options = createAdapterOptions({ model: 'codex-mini-latest' });
      const adapter = new CodexAdapter(options);
      await adapter.start();

      adapter.updateModel(undefined);

      const sessionId = await adapter.createSession();
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-model-clear' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.model).toBeUndefined();
    });

    it('trims whitespace from model name', async () => {
      const options = createAdapterOptions();
      const adapter = new CodexAdapter(options);
      await adapter.start();

      adapter.updateModel('  o4-mini  ');

      const sessionId = await adapter.createSession();
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-model-trim' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.model).toBe('o4-mini');
    });

    it('treats blank string as undefined', async () => {
      const options = createAdapterOptions({ model: 'codex-mini-latest' });
      const adapter = new CodexAdapter(options);
      await adapter.start();

      adapter.updateModel('   ');

      const sessionId = await adapter.createSession();
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-model-blank' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.model).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // updateAdditionalDirectories — runtime additional directories update
  // -------------------------------------------------------------------------

  describe('updateAdditionalDirectories', () => {
    it('updates additional directories used by subsequent thread creation', async () => {
      const options = createAdapterOptions({ additionalDirectories: ['/tmp/old'] });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-dirs-updated' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      adapter.updateAdditionalDirectories(['/tmp/new-a', '/tmp/new-b']);

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.additionalDirectories).toEqual(['/tmp/new-a', '/tmp/new-b']);
    });

    it('can clear additional directories by passing undefined', async () => {
      const options = createAdapterOptions({ additionalDirectories: ['/tmp/old'] });
      const adapter = new CodexAdapter(options);
      await adapter.start();

      adapter.updateAdditionalDirectories(undefined);

      const sessionId = await adapter.createSession();
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-dirs-cleared' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.additionalDirectories).toBeUndefined();
    });

    it('treats empty array as undefined', async () => {
      const options = createAdapterOptions({ additionalDirectories: ['/tmp/old'] });
      const adapter = new CodexAdapter(options);
      await adapter.start();

      adapter.updateAdditionalDirectories([]);

      const sessionId = await adapter.createSession();
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-dirs-empty' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.additionalDirectories).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // updateNetworkAccessEnabled — runtime network access update
  // -------------------------------------------------------------------------

  describe('updateNetworkAccessEnabled', () => {
    it('updates network access used by subsequent thread creation', async () => {
      const options = createAdapterOptions({ networkAccessEnabled: false });
      const adapter = new CodexAdapter(options);
      await adapter.start();
      const sessionId = await adapter.createSession();

      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-net-updated' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      adapter.updateNetworkAccessEnabled(true);

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.networkAccessEnabled).toBe(true);
    });

    it('can clear network access by passing undefined', async () => {
      const options = createAdapterOptions({ networkAccessEnabled: true });
      const adapter = new CodexAdapter(options);
      await adapter.start();

      adapter.updateNetworkAccessEnabled(undefined);

      const sessionId = await adapter.createSession();
      options._mockCodex._mockThread.runStreamed.mockResolvedValue({
        events: (async function* () {
          yield { type: 'thread.started', thread_id: 't-net-cleared' };
          yield { type: 'turn.started' };
          yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
        })(),
      });

      for await (const _ of adapter.sendMessage({ sessionId, content: 'test' })) { void _; }

      const threadOpts = options._mockCodex.startThread.mock.calls[0][0] as Record<string, unknown>;
      expect(threadOpts.networkAccessEnabled).toBeUndefined();
    });
  });
});
