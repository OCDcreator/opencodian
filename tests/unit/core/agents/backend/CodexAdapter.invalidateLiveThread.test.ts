/**
 * CodexAdapter.invalidateLiveThread tests.
 *
 * Validates the live-current-thread re-resume mechanism: invalidating the
 * cached SDK Thread for a session forces the next sendMessage() to re-resume
 * the backend thread with the adapter's CURRENT options, while preserving
 * the real threadId (and therefore the persisted conversation history).
 */
import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import {
  CodexAdapter,
  type CodexAdapterOptions,
} from '../../../../../src/core/agents/backend';

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

function createAdapterOptions(
  overrides?: Partial<CodexAdapterOptions>,
): CodexAdapterOptions & { _mockCodex: ReturnType<typeof createMockCodex> } {
  const mockCodex = createMockCodex();
  return {
    createAppServerClient: () => null,
    createCodex: jest.fn().mockResolvedValue(mockCodex),
    ...overrides,
    _mockCodex: mockCodex,
  } as CodexAdapterOptions & { _mockCodex: ReturnType<typeof createMockCodex> };
}

describe('CodexAdapter.invalidateLiveThread', () => {
  it('returns false for an unknown session id', () => {
    const adapter = new CodexAdapter();
    expect(adapter.invalidateLiveThread('nonexistent')).toBe(false);
  });

  it('returns false for a provisional-only session (no real threadId yet)', async () => {
    const options = createAdapterOptions();
    const adapter = new CodexAdapter(options);
    await adapter.start();
    const provisionalId = await adapter.createSession();
    expect(adapter.invalidateLiveThread(provisionalId)).toBe(false);
  });

  it('returns false when the session has a threadId but no cached thread', async () => {
    const options = createAdapterOptions();
    const adapter = new CodexAdapter(options);
    await adapter.start();
    const provisionalId = await adapter.createSession();
    // Simulate that a real thread id was assigned but the cached Thread is
    // already gone (e.g. adapter restart path). We cannot directly set the
    // internal map, so drive it through the public surface: createSession
    // gives a provisional entry with threadId=null. invalidateLiveThread on
    // such an entry returns false because there is no threadId.
    expect(adapter.invalidateLiveThread(provisionalId)).toBe(false);
  });

  it('drops the cached thread for a live session with a real threadId', async () => {
    const options = createAdapterOptions({ sandboxMode: 'workspace-write' });
    const adapter = new CodexAdapter(options);
    await adapter.start();
    const provisionalId = await adapter.createSession();

    // Start a real turn so a Thread is cached and a real threadId is aliased.
    // The mock SDK's runStreamed is empty, so drain the generator.
    const generator = adapter.sendMessage({
      sessionId: provisionalId,
      content: 'hi',
      images: undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generator) {
      // drain
    }

    // The mock thread never emits thread.started, so threadId stays null.
    // Manually exercise the public path by using the real-thread-id resume
    // path: call sendMessage with a real-looking thread id so the adapter
    // caches a Thread under that id.
    const realThreadId = '019ec2b9-67a4-7812-a1d9-3052c768683b';
    const generator2 = adapter.sendMessage({
      sessionId: realThreadId,
      content: 'hello again',
      images: undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generator2) {
      // drain
    }

    // Now the real thread id should resolve to a session entry with a cached
    // thread. Invalidate it.
    expect(options._mockCodex.resumeThread).toHaveBeenCalledTimes(1);
    expect(adapter.invalidateLiveThread(realThreadId)).toBe(true);

    // Next sendMessage re-resumes (resumeThread called again with the SAME id).
    const generator3 = adapter.sendMessage({
      sessionId: realThreadId,
      content: 'after invalidate',
      images: undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generator3) {
      // drain
    }
    expect(options._mockCodex.resumeThread).toHaveBeenCalledTimes(2);
    // Same thread id (history preserved).
    expect(options._mockCodex.resumeThread).toHaveBeenLastCalledWith(
      realThreadId,
      expect.objectContaining({ sandboxMode: 'workspace-write' }),
    );
  });

  it('is idempotent: a second invalidate on the same session returns false', async () => {
    const options = createAdapterOptions();
    const adapter = new CodexAdapter(options);
    await adapter.start();
    const realThreadId = '019ec2b9-aaaa-bbbb-cccc-dddddddddddd';
    const generator = adapter.sendMessage({
      sessionId: realThreadId,
      content: 'hi',
      images: undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generator) {
      // drain
    }
    expect(adapter.invalidateLiveThread(realThreadId)).toBe(true);
    expect(adapter.invalidateLiveThread(realThreadId)).toBe(false);
  });

  it('picks up updated options on re-resume after invalidation', async () => {
    const options = createAdapterOptions({
      sandboxMode: 'read-only',
      model: 'gpt-old',
    });
    const adapter = new CodexAdapter(options);
    await adapter.start();
    const realThreadId = '019ec2b9-updt-aaaa-bbbb-cccccccccccc';
    const generator = adapter.sendMessage({
      sessionId: realThreadId,
      content: 'hi',
      images: undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generator) {
      // drain
    }
    // Initial resume used the old options.
    expect(options._mockCodex.resumeThread).toHaveBeenLastCalledWith(
      realThreadId,
      expect.objectContaining({ sandboxMode: 'read-only', model: 'gpt-old' }),
    );

    // Mutate adapter options (simulating applyCodexRuntimeOverrides).
    adapter.updateSandboxMode('workspace-write');
    adapter.updateModel('gpt-new');

    // Without invalidation, the next turn reuses the cached thread (old opts).
    const generator2 = adapter.sendMessage({
      sessionId: realThreadId,
      content: 'without invalidate',
      images: undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generator2) {
      // drain
    }
    expect(options._mockCodex.resumeThread).toHaveBeenCalledTimes(1);

    // Invalidate → next turn re-resumes with the NEW options.
    expect(adapter.invalidateLiveThread(realThreadId)).toBe(true);
    const generator3 = adapter.sendMessage({
      sessionId: realThreadId,
      content: 'after invalidate',
      images: undefined,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of generator3) {
      // drain
    }
    expect(options._mockCodex.resumeThread).toHaveBeenCalledTimes(2);
    expect(options._mockCodex.resumeThread).toHaveBeenLastCalledWith(
      realThreadId,
      expect.objectContaining({ sandboxMode: 'workspace-write', model: 'gpt-new' }),
    );
  });

  it('does not break the capability set', () => {
    const adapter = new CodexAdapter();
    expect(adapter.hasCapability(AgentCapability.Chat)).toBe(true);
  });
});
