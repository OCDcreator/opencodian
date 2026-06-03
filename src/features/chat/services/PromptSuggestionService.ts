/**
 * Runtime coordinator for Claude Code prompt suggestions.
 *
 * Owns the full suggestion lifecycle:
 *   - Per-session suggestion storage
 *   - Adapter callback subscription
 *   - Active session tracking (for bar refresh gating)
 *   - Lifecycle clearing on turn start / teardown
 *
 * The coordinator self-wires from the module-level prompt suggestion sink
 * during `build()` — no view forwarding required.  The service does NOT own
 * any DOM — that stays in `ComposerInputShellCoordinator`.
 *
 * Never auto-sends — click always inserts into the composer only.
 *
 * @module prompt-suggestion-service
 */

import type { StreamChunk } from '../../../core/types/chat';
import { createLogger } from '../../../shared';

const logger = createLogger('PromptSuggestionService');

export type PromptSuggestionData = Extract<StreamChunk, { type: 'prompt_suggestion' }>;

/** Minimal adapter contract — only the callback registration method we need. */
export type PromptSuggestionAdapter = import('../../../core/agents/backend/promptSuggestionSink').PromptSuggestionSink;

type SuggestionCallback = (suggestion: PromptSuggestionData) => void;
type ClearCallback = (sessionId: string) => void;
type BarRefreshCallback = () => void;

export class PromptSuggestionService {
  /** Per-session suggestion state. Keyed by sessionId. */
  private readonly suggestions = new Map<string, PromptSuggestionData>();
  private readonly suggestionListeners = new Set<SuggestionCallback>();
  private readonly clearListeners = new Set<ClearCallback>();
  private readonly barRefreshCallbacks = new Set<BarRefreshCallback>();

  /** Current active session ID (updated by the coordinator's scoped-bus subscription on tab/conversation change). */
  private activeSessionId: string | null = null;

  /**
   * Subscribe to the adapter's post-result chunk callback.
   * Call once at coordinator build; the service filters and routes internally.
   * Returns an unsubscribe function (for test cleanup).
   */
  attachAdapter(adapter: PromptSuggestionAdapter): () => void {
    let active = true;
    const unsub = adapter.onPostResultChunk((chunk: StreamChunk) => {
      if (!active) { return; }
      if (chunk.type === 'prompt_suggestion' && chunk.sessionId) {
        this.setSuggestion(chunk);
        // Refresh the bar if the suggestion is for the active session,
        // or if the active session is not yet known (allows the
        // coordinator to sync from host once backendSessionId is
        // established, e.g. after the first message in a new
        // conversation).
        if (this.activeSessionId === chunk.sessionId || this.activeSessionId === null) {
          this.requestBarRefresh();
        }
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }

  /** Set the active session ID. Called when the user switches tabs/conversations. */
  setActiveSession(sessionId: string | null): void {
    this.activeSessionId = sessionId;
  }

  /** Get the suggestion text for the active session, or null. */
  getActiveSuggestionText(): string | null {
    if (!this.activeSessionId) { return null; }
    return this.suggestions.get(this.activeSessionId)?.suggestion ?? null;
  }

  /**
   * Accept (consume) the active suggestion — clears it and fires bar refresh.
   * Returns the accepted text, or null if no active suggestion.
   */
  acceptActiveSuggestion(): string | null {
    if (!this.activeSessionId) { return null; }
    const data = this.suggestions.get(this.activeSessionId);
    if (!data) { return null; }
    const text = data.suggestion;
    this.clearForSession(this.activeSessionId);
    this.requestBarRefresh();
    return text;
  }

  /**
   * Clear the active session's suggestion on new user turn.
   * Fires bar refresh if a suggestion was actually cleared.
   */
  clearActiveOnTurnStart(): void {
    if (!this.activeSessionId) { return; }
    if (this.suggestions.has(this.activeSessionId)) {
      this.clearForSession(this.activeSessionId);
      this.requestBarRefresh();
    }
  }

  /** Notify on active session change (tab switch) — triggers bar refresh. */
  onActiveSessionChanged(newSessionId: string | null): void {
    this.activeSessionId = newSessionId;
    this.requestBarRefresh();
  }

  /** Clear all on backend switch or view teardown. */
  clearAll(): void {
    this.suggestions.clear();
  }

  /** Register a callback that triggers bar refresh in the coordinator. */
  onBarRefreshRequested(callback: BarRefreshCallback): () => void {
    this.barRefreshCallbacks.add(callback);
    return () => { this.barRefreshCallbacks.delete(callback); };
  }

  // ─── Low-level access (for tests) ─────────────────────────────

  /** Get the suggestion for a specific session, or null. */
  getSuggestion(sessionId: string): PromptSuggestionData | null {
    return this.suggestions.get(sessionId) ?? null;
  }

  /** Store a suggestion for a session and notify listeners. */
  setSuggestion(suggestion: PromptSuggestionData): void {
    const sid = suggestion.sessionId ?? '';
    if (!sid) {
      logger.debug('setSuggestion: dropping suggestion without sessionId');
      return;
    }
    this.suggestions.set(sid, suggestion);
    for (const listener of this.suggestionListeners) {
      listener(suggestion);
    }
  }

  /** Clear the suggestion for a specific session. */
  clearForSession(sessionId: string): void {
    const had = this.suggestions.has(sessionId);
    this.suggestions.delete(sessionId);
    if (had) {
      for (const listener of this.clearListeners) {
        listener(sessionId);
      }
    }
  }

  /** Subscribe to new suggestions being set. Returns unsubscribe function. */
  onSuggestionSet(callback: SuggestionCallback): () => void {
    this.suggestionListeners.add(callback);
    return () => { this.suggestionListeners.delete(callback); };
  }

  /** Subscribe to suggestions being cleared for a session. Returns unsubscribe function. */
  onSuggestionCleared(callback: ClearCallback): () => void {
    this.clearListeners.add(callback);
    return () => { this.clearListeners.delete(callback); };
  }

  // ─── Internal ─────────────────────────────────────────────────

  private requestBarRefresh(): void {
    for (const cb of this.barRefreshCallbacks) {
      cb();
    }
  }
}
