import { createRendererSafeAbortController } from '../../../../../src/core/agents/backend/claude/ClaudeCodeSdkAbortShim';

describe('Claude renderer-safe abort teardown', () => {
  it('supports the SDK unref timeout and restores renderer timers after synchronous listeners', () => {
    const originalSet = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    const rendererSet = jest.fn(() => 123) as unknown as typeof globalThis.setTimeout;
    const rendererClear = jest.fn() as unknown as typeof globalThis.clearTimeout;
    const controller = createRendererSafeAbortController();
    const signal = controller.signal as { addEventListener(type: string, callback: () => void): void };
    let notifications = 0;
    signal.addEventListener('abort', () => {
      notifications++;
      const timer = setTimeout(() => undefined, 60_000);
      timer.unref();
      clearTimeout(timer);
    });
    try {
      globalThis.setTimeout = rendererSet;
      globalThis.clearTimeout = rendererClear;
      expect(() => controller.abort()).not.toThrow();
      expect(globalThis.setTimeout).toBe(rendererSet);
      expect(globalThis.clearTimeout).toBe(rendererClear);
      controller.abort();
      expect(notifications).toBe(1);
      expect(rendererSet).not.toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = originalSet;
      globalThis.clearTimeout = originalClear;
    }
  });

  it('restores host timers even when an abort listener throws', () => {
    const originalSet = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    const controller = createRendererSafeAbortController();
    const signal = controller.signal as { addEventListener(type: string, callback: () => void): void };
    signal.addEventListener('abort', () => { throw new Error('owned listener failure'); });
    expect(() => controller.abort()).toThrow('owned listener failure');
    expect(globalThis.setTimeout).toBe(originalSet);
    expect(globalThis.clearTimeout).toBe(originalClear);
  });
});
