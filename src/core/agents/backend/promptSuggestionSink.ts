/**
 * Module-level event bus for prompt suggestion lifecycle.
 *
 * Decouples the Claude Code adapter (core layer) and the composer coordinator
 * (features layer) so that `OpenCodianView.ts` never needs to forward
 * prompt-suggestion events — the coordinator self-wires from this bus during
 * `build()` and the adapter/session owner emit through it.
 *
 * ## Scoping
 *
 * The session-change bus supports **channels** to prevent cross-talk between
 * independent chat views (leaves).  Scoping is derived from DOM: each
 * coordinator stamps its channel on its container element during `build()`;
 * the tab-activation provider discovers the channel by walking up from the
 * active tab's messages container to find the nearest stamped scope.
 *
 * When a channel ID is found, emissions and subscriptions are isolated per
 * channel.  The global (no-channel) path is retained for backward
 * compatibility — global emissions reach all subscribers.
 *
 * Usage:
 *   - `ClaudeCodeAdapter` calls `registerPromptSuggestionSink(this)` once ready.
 *   - `ComposerInputShellCoordinator` calls `createPromptSuggestionChannel()`,
 *     `stampPromptSuggestionScope()`, `getPromptSuggestionSink()`, and
 *     `onPromptSuggestionSessionChange(cb, channelId)` during `build()`.
 *   - `TabActivationRuntimeHostProvider` calls
 *     `findPromptSuggestionScope(messagesContainer)` during
 *     `setCurrentConversation` to discover the channel, then emits through
 *     `emitPromptSuggestionSessionChange(sessionId, channelId)`.
 *
 * @module prompt-suggestion-sink
 */

import type { StreamChunk } from '../../types/chat';

/** Minimal adapter contract — only the callback registration method we need. */
export interface PromptSuggestionSink {
  onPostResultChunk(callback: (chunk: StreamChunk) => void): () => void;
}

type SessionCallback = (sessionId: string | null) => void;

// ─── Module-level state ─────────────────────────────────────────

let sink: PromptSuggestionSink | null = null;

/** Global (legacy) subscribers — receive all emissions. */
const globalSessionCallbacks = new Set<SessionCallback>();

/** Per-channel subscribers — receive only emissions on their channel. */
const channelCallbacks = new Map<string, Set<SessionCallback>>();

let channelCounter = 0;

// ─── Sink registration ──────────────────────────────────────────

/** Register a prompt-suggestion-capable adapter (e.g. ClaudeCodeAdapter).
 *  Idempotent: if the same sink is already registered, callbacks are not re-fired. */
export function registerPromptSuggestionSink(s: PromptSuggestionSink): void {
  if (sink === s) return;
  sink = s;
  for (const cb of sinkChangeCallbacks) {
    cb(s);
  }
}

/** Get the currently registered sink, or null. */
export function getPromptSuggestionSink(): PromptSuggestionSink | null {
  return sink;
}

/** Clear the registered sink (used in tests or teardown). */
export function clearPromptSuggestionSink(): void {
  sink = null;
  for (const cb of sinkChangeCallbacks) {
    cb(null);
  }
}

type SinkChangeCallback = (sink: PromptSuggestionSink | null) => void;

const sinkChangeCallbacks = new Set<SinkChangeCallback>();

/**
 * Subscribe to sink registration changes.
 *
 * The callback is invoked immediately with the current sink (or null),
 * and again whenever the sink is registered or cleared.
 * Returns an unsubscribe function.
 */
export function onPromptSuggestionSinkChange(cb: SinkChangeCallback): () => void {
  sinkChangeCallbacks.add(cb);
  cb(sink);
  return () => {
    sinkChangeCallbacks.delete(cb);
  };
}

// ─── Channel management ─────────────────────────────────────────

/**
 * Create a new isolated channel for session-change events.
 * Returns a unique channel ID string.
 */
export function createPromptSuggestionChannel(): string {
  const id = `ps-ch-${++channelCounter}`;
  channelCallbacks.set(id, new Set());
  return id;
}

/**
 * Remove a channel and all its subscribers.
 * Safe to call during coordinator teardown.
 */
export function deletePromptSuggestionChannel(channelId: string): void {
  const cbs = channelCallbacks.get(channelId);
  if (cbs) {
    cbs.clear();
    channelCallbacks.delete(channelId);
  }
}

// ─── Session change events ──────────────────────────────────────

/**
 * Emit a session change.
 *
 * When `channelId` is provided, only subscribers on that channel receive it.
 * When `channelId` is omitted, all subscribers (global + every channel) receive it.
 */
export function emitPromptSuggestionSessionChange(sessionId: string | null, channelId?: string): void {
  if (channelId) {
    // Scoped: only that channel's subscribers
    const cbs = channelCallbacks.get(channelId);
    if (cbs) {
      for (const cb of cbs) {
        cb(sessionId);
      }
    }
  } else {
    // Global: all global subscribers + all channel subscribers
    for (const cb of globalSessionCallbacks) {
      cb(sessionId);
    }
    for (const [, cbs] of channelCallbacks) {
      for (const cb of cbs) {
        cb(sessionId);
      }
    }
  }
}

/**
 * Subscribe to session changes.
 *
 * When `channelId` is provided, the callback only receives emissions on that
 * channel (plus global emissions, which reach all subscribers).
 * When `channelId` is omitted, the callback receives all emissions.
 * Returns an unsubscribe function.
 */
export function onPromptSuggestionSessionChange(cb: SessionCallback, channelId?: string): () => void {
  if (channelId) {
    let cbs = channelCallbacks.get(channelId);
    if (!cbs) {
      cbs = new Set();
      channelCallbacks.set(channelId, cbs);
    }
    cbs.add(cb);
    return () => {
      cbs!.delete(cb);
    };
  }
  globalSessionCallbacks.add(cb);
  return () => {
    globalSessionCallbacks.delete(cb);
  };
}

/** Clear all session callbacks (used in tests). */
export function clearAllPromptSuggestionSessionCallbacks(): void {
  globalSessionCallbacks.clear();
  for (const [, cbs] of channelCallbacks) {
    cbs.clear();
  }
  channelCallbacks.clear();
}

// ─── DOM-based scope discovery ──────────────────────────────────

/**
 * Data attribute used to stamp the prompt-suggestion channel on a DOM element.
 * The coordinator stamps this on its container during `build()`.
 */
const SCOPE_ATTR = 'data-opencodian-ps-scope';

/**
 * Stamp a prompt-suggestion channel scope on a DOM container element.
 * Called by the coordinator during `build()` so the tab-activation provider
 * can later discover the channel from any sibling element in the same view.
 */
export function stampPromptSuggestionScope(container: HTMLElement, channelId: string): void {
  container.setAttribute(SCOPE_ATTR, channelId);
}

/**
 * Remove a previously stamped scope from a container element.
 * Called during coordinator teardown / rebuild.
 */
export function removePromptSuggestionScope(container: HTMLElement): void {
  container.removeAttribute(SCOPE_ATTR);
}

/**
 * Find the prompt-suggestion channel scope for a given DOM element by walking
 * up the ancestor chain.  At each ancestor, checks the element itself and its
 * descendants for a stamped scope attribute.  Returns the channel ID or
 * `undefined` if no scope is found (falling back to global emission).
 *
 * This works because both the coordinator's container and the messages
 * container are siblings under a common view root (e.g. `chatContainerEl`).
 * Walking up from the messages container eventually reaches the common
 * ancestor whose `querySelector` finds the coordinator's stamped container.
 */
export function findPromptSuggestionScope(fromElement: Element): string | undefined {
  let current: Element | null = fromElement;
  while (current) {
    // Check the element itself
    const direct = current.getAttribute(SCOPE_ATTR);
    if (direct) return direct;
    // Check descendants (the stamped container is a sibling subtree)
    const stamped = current.querySelector(`[${SCOPE_ATTR}]`);
    if (stamped) {
      return stamped.getAttribute(SCOPE_ATTR) ?? undefined;
    }
    current = current.parentElement;
  }
  return undefined;
}
