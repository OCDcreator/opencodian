/**
 * Renderer-safe AbortController shim for the bundled Claude Agent SDK.
 *
 * The SDK constructs internal AbortControllers unconditionally (for example
 * the `forwardedAbort = Ad()` class field on its subprocess transport) and
 * passes their signals to Node's `events.setMaxListeners`, whose strict
 * `instanceof EventTarget` check rejects the Obsidian renderer's DOM
 * AbortSignal with `ERR_INVALID_ARG_TYPE`. On Electron 39 (Obsidian 1.13+)
 * every `sdk.query()` therefore crashes before a turn can start — the chat
 * path and the auxiliary sessions alike.
 *
 * Two defenses, both defined here:
 *
 * 1. `createRendererSafeAbortController()` — a controller whose signal is a
 *    Node EventEmitter (passes the strict check) carrying the AbortSignal
 *    surface the SDK touches. Passing it as `options.abortController` also
 *    skips the SDK's own default-controller path.
 * 2. `withSdkAbortControllerShim(fn)` — swaps `globalThis.AbortController`
 *    for the safe constructor for the duration of `fn`'s synchronous window.
 *    No other code can interleave (JS is single-threaded) and the original is
 *    always restored. `ClaudeCodeSdkLoader` wraps every facade `query` call
 *    with this so all SDK consumers are covered from one choke point.
 */

import { EventEmitter } from 'node:events';

/** The duck-typed abort surface handed to the bundled SDK. */
export interface RendererSafeAbortController {
  abort(reason?: unknown): void;
  readonly signal: unknown;
}

export function createRendererSafeAbortController(): RendererSafeAbortController {
  const emitter = new EventEmitter();
  let aborted = false;
  let reason: unknown;
  const signal = emitter as unknown as {
    readonly aborted: boolean;
    readonly reason: unknown;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
    throwIfAborted(): void;
  };
  Object.defineProperty(signal, 'aborted', { get: () => aborted });
  Object.defineProperty(signal, 'reason', { get: () => reason });
  signal.addEventListener = (type, listener) => {
    if (type === 'abort') emitter.on('abort', listener);
  };
  signal.removeEventListener = (type, listener) => {
    if (type === 'abort') emitter.off('abort', listener);
  };
  signal.throwIfAborted = () => {
    if (aborted && reason instanceof Error) throw reason;
  };
  return {
    abort(nextReason?: unknown) {
      if (aborted) return;
      aborted = true;
      reason = nextReason ?? new Error('This operation was aborted');
      emitter.emit('abort', { type: 'abort', target: signal });
    },
    signal,
  };
}

/**
 * Run `fn` with `globalThis.AbortController` temporarily replaced by the
 * renderer-safe constructor. Only the synchronous window is covered; async
 * continuations see the restored original, which is correct because the SDK
 * constructs its abort wiring synchronously inside `query()`.
 */
export function withSdkAbortControllerShim<T>(fn: () => T): T {
  const original = globalThis.AbortController;
  try {
    globalThis.AbortController = createRendererSafeAbortController as unknown as typeof AbortController;
    return fn();
  } finally {
    globalThis.AbortController = original;
  }
}
