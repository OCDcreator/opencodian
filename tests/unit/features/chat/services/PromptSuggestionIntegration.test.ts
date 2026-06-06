/**
 * Production lifecycle tests for the prompt suggestion wiring.
 *
 * Exercises PromptSuggestionService as the runtime owner — the same
 * ownership split that production code uses:
 *   - Service: adapter subscription, per-session storage, active session tracking, bar refresh callback
 *   - Coordinator: owns the service, self-wires from the module-level sink bus
 *
 * Uses a SuggestionHostBridge that replicates the host contract that
 * the coordinator exposes (getPromptSuggestion / onPromptSuggestionAccepted).
 * The module-level sink bus (not OpenCodianView) connects adapter events to the coordinator.
 */
import {
  clearPromptSuggestionSink,
  onPromptSuggestionSinkChange,
  registerPromptSuggestionSink,
} from '../../../../../src/core/agents/backend/promptSuggestionSink';
import type { StreamChunk } from '../../../../../src/core/types/chat';
import {
  type PromptSuggestionAdapter,
  PromptSuggestionService,
} from '../../../../../src/features/chat/services/PromptSuggestionService';

/** Simulates the thin host contract the coordinator exposes. */
class SuggestionHostBridge {
  private lastInserted: string | null = null;

  constructor(private readonly service: PromptSuggestionService) {}

  getPromptSuggestion(): string | null {
    return this.service.getActiveSuggestionText();
  }

  acceptSuggestion(): string | null {
    const text = this.service.acceptActiveSuggestion();
    if (text) { this.lastInserted = text; }
    return text;
  }

  getLastInserted(): string | null { return this.lastInserted; }
}

describe('Prompt suggestion production lifecycle', () => {
  let service: PromptSuggestionService;
  let bridge: SuggestionHostBridge;
  let barRefreshCount: number;
  let adapterCallback: ((chunk: StreamChunk) => void) | null;

  beforeEach(() => {
    service = new PromptSuggestionService();
    bridge = new SuggestionHostBridge(service);
    barRefreshCount = 0;
    adapterCallback = null;

    service.onBarRefreshRequested(() => { barRefreshCount++; });

    // Attach a mock adapter
    const adapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { adapterCallback = cb; return () => {}; },
    };
    service.attachAdapter(adapter);
  });

  // ─── Full lifecycle ────────────────────────────────────────────

  it('adapter → service → host shows → user accepts → cleared', () => {
    service.onActiveSessionChanged('sess-1');

    adapterCallback!({
      type: 'prompt_suggestion',
      suggestion: 'Write unit tests',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });

    expect(bridge.getPromptSuggestion()).toBe('Write unit tests');
    expect(barRefreshCount).toBeGreaterThan(0);
    const prevRefreshCount = barRefreshCount;

    bridge.acceptSuggestion();

    expect(bridge.getPromptSuggestion()).toBeNull();
    expect(bridge.getLastInserted()).toBe('Write unit tests');
    expect(barRefreshCount).toBeGreaterThan(prevRefreshCount);
  });

  // ─── Tab switch isolation ──────────────────────────────────────

  it('switching tabs shows correct session suggestion', () => {
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'For A', uuid: 'ps-A', sessionId: 'sess-A' });
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'For B', uuid: 'ps-B', sessionId: 'sess-B' });

    service.onActiveSessionChanged('sess-A');
    expect(bridge.getPromptSuggestion()).toBe('For A');

    service.onActiveSessionChanged('sess-B');
    expect(bridge.getPromptSuggestion()).toBe('For B');
  });

  it('new turn on session A does not clear session B', () => {
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'A', uuid: 'ps-A', sessionId: 'sess-A' });
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'B', uuid: 'ps-B', sessionId: 'sess-B' });
    service.onActiveSessionChanged('sess-A');

    service.clearActiveOnTurnStart();

    expect(bridge.getPromptSuggestion()).toBeNull();
    service.onActiveSessionChanged('sess-B');
    expect(bridge.getPromptSuggestion()).toBe('B');
  });

  // ─── Backend switch ────────────────────────────────────────────

  it('backend switch clears all and fires bar refresh', () => {
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'X', uuid: 'ps-1', sessionId: 'sess-1' });
    service.onActiveSessionChanged('sess-1');
    expect(bridge.getPromptSuggestion()).toBe('X');
    const prevRefreshCount = barRefreshCount;

    service.clearAll();

    expect(bridge.getPromptSuggestion()).toBeNull();
    // clearAll fires bar refresh since suggestions existed
    expect(barRefreshCount).toBeGreaterThan(prevRefreshCount);
  });

  // ─── Subscription without active conversation ──────────────────

  it('suggestion received before any session is active is stored for later', () => {
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'Stored', uuid: 'ps-1', sessionId: 'sess-1' });

    // No active session → bar stays hidden
    expect(bridge.getPromptSuggestion()).toBeNull();

    // Switching to that session makes it visible
    service.onActiveSessionChanged('sess-1');
    expect(bridge.getPromptSuggestion()).toBe('Stored');
  });

  it('suggestion for null activeSessionId requests bar refresh so host can sync', () => {
    // Simulate: conversation activated before backendSessionId was set.
    // activeSessionId is null — the SDK has not yet returned a session id.
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'First message suggestion', uuid: 'ps-1', sessionId: 'sdk-sess-1' });

    // Bar refresh was requested because activeSessionId was null
    // (coordinator will call getCurrentBackendSessionId() and sync).
    expect(barRefreshCount).toBeGreaterThan(0);

    // Suggestion is stored but not yet visible
    expect(bridge.getPromptSuggestion()).toBeNull();

    // Simulate what ComposerInputShellCoordinator.refreshSuggestionBar does:
    // after the host reports backendSessionId = sdk-sess-1, it calls
    // setActiveSession('sdk-sess-1') and re-renders.
    service.setActiveSession('sdk-sess-1');

    // Now the suggestion is visible
    expect(bridge.getPromptSuggestion()).toBe('First message suggestion');
  });

  // ─── Never auto-sends ──────────────────────────────────────────

  it('accept only inserts, never sends', () => {
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'Text', uuid: 'ps-1', sessionId: 'sess-1' });
    service.onActiveSessionChanged('sess-1');

    bridge.acceptSuggestion();

    expect(bridge.getLastInserted()).toBe('Text');
    expect((service as unknown as Record<string, unknown>).send).toBeUndefined();
    expect((service as unknown as Record<string, unknown>).autoSend).toBeUndefined();
  });

  // ─── Production race: suggestion arrives before backendSessionId is finalized ───

  it('suggestion arriving before backendSessionId finalized becomes visible after sync', () => {
    // Simulate: adapter fires suggestion for sdk-sess-1 BEFORE activeSessionId is known.
    // activeSessionId is null — simulates new conversation before first turn completes.
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'Race-test suggestion', uuid: 'ps-race', sessionId: 'sdk-sess-1' });

    // Bar refresh was requested because activeSessionId was null, but host has no
    // backendSessionId yet — suggestion remains stored but invisible.
    expect(barRefreshCount).toBeGreaterThan(0);
    expect(bridge.getPromptSuggestion()).toBeNull();
    expect(service.getSuggestion('sdk-sess-1')!.suggestion).toBe('Race-test suggestion');

    // Simulate what happens in production AFTER LocalStreamMessagePersistence writes
    // backendSessionId and MessageFinalizationService calls setActiveTabConversation,
    // which triggers OpenCodianView to call coordinator.syncPromptSuggestionSession().
    // This is the explicit signal that closes the race.
    service.setActiveSession('sdk-sess-1');
    barRefreshCount++; // simulate the refresh triggered by sync

    // Now the suggestion is visible because activeSessionId matches
    expect(bridge.getPromptSuggestion()).toBe('Race-test suggestion');
  });

  // ─── Stale replacement ─────────────────────────────────────────

  it('new suggestion for same session replaces old', () => {
    service.onActiveSessionChanged('sess-1');
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'Old', uuid: 'ps-1', sessionId: 'sess-1' });
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'New', uuid: 'ps-2', sessionId: 'sess-1' });

    expect(bridge.getPromptSuggestion()).toBe('New');
  });

  // ─── Adapter unsubscribe lifecycle ──────────────────────────────

  it('adapter unsubscribe stops all callbacks', () => {
    let capturedCallback: ((chunk: StreamChunk) => void) | null = null;
    const mockAdapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => {
        capturedCallback = cb;
        return () => {};
      },
    };

    const unsub = service.attachAdapter(mockAdapter);
    unsub();

    // After unsubscribe, even if the callback is invoked externally, service ignores it
    service.setActiveSession('sess-1');
    capturedCallback!({ type: 'prompt_suggestion', suggestion: 'After unsub', uuid: 'ps-late', sessionId: 'sess-1' });
    expect(service.getActiveSuggestionText()).toBeNull();
  });

  // ─── Sink cleared (backend stop/restart) ───────────────────────

  it('sink cleared hides active suggestion and refreshes bar', () => {
    service.onActiveSessionChanged('sess-1');
    adapterCallback!({ type: 'prompt_suggestion', suggestion: 'Hide me', uuid: 'ps-1', sessionId: 'sess-1' });

    expect(bridge.getPromptSuggestion()).toBe('Hide me');
    const prevRefreshCount = barRefreshCount;

    // Simulate the coordinator behaviour on sink=null after the fix:
    // 1) unsubAdapter, 2) service.clearAll(), 3) refresh bar
    service.clearAll();
    service.onActiveSessionChanged('sess-1'); // triggers bar refresh

    expect(bridge.getPromptSuggestion()).toBeNull();
    expect(barRefreshCount).toBeGreaterThan(prevRefreshCount);
  });
});

describe('PromptSuggestionService – adapter teardown', () => {
  it('adapter unsubscribe prevents stale callbacks after adapter stop/dispose', () => {
    const service = new PromptSuggestionService();
    let capturedCallback: ((chunk: StreamChunk) => void) | null = null;

    const adapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { capturedCallback = cb; return () => {}; },
    };

    // Simulate production: coordinator wires adapter, then adapter is disposed
    const unsub = service.attachAdapter(adapter);
    unsub();

    service.setActiveSession('sess-1');

    // Adapter callback fires after dispose — service must not accept it
    capturedCallback!({ type: 'prompt_suggestion', suggestion: 'Stale', uuid: 'ps-stale', sessionId: 'sess-1' });
    expect(service.getActiveSuggestionText()).toBeNull();
  });
});

describe('Prompt suggestion sink-null production path', () => {
  beforeEach(() => {
    clearPromptSuggestionSink();
  });

  afterEach(() => {
    clearPromptSuggestionSink();
  });

  it('coordinator callback through real sink bus clears suggestion and refreshes bar', () => {
    const service = new PromptSuggestionService();

    // Simulate ComposerInputShellCoordinator.wirePromptSuggestionFromSink()
    // using the REAL module-level sink bus (not internal service methods).
    let unsubAdapter: (() => void) | null = null;
    let refreshBarCallCount = 0;

    const unsubSinkChange = onPromptSuggestionSinkChange((sink) => {
      if (unsubAdapter) { unsubAdapter(); }
      unsubAdapter = null;
      if (sink) {
        unsubAdapter = service.attachAdapter(sink);
      } else {
        // This is the production fix path: when backend stops/restarts,
        // coordinator must clear service state AND refresh the bar.
        service.clearAll();
        refreshBarCallCount++;
      }
    });

    // Step 1: ClaudeCodeAdapter.start() registers sink
    let adapterCb: ((chunk: StreamChunk) => void) | null = null;
    registerPromptSuggestionSink({
      onPostResultChunk: (cb) => { adapterCb = cb; return () => {}; },
    });

    // Step 2: Active session receives a suggestion
    service.onActiveSessionChanged('sess-1');
    adapterCb!({
      type: 'prompt_suggestion',
      suggestion: 'Should disappear on backend stop',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });

    expect(service.getActiveSuggestionText()).toBe('Should disappear on backend stop');

    // Step 3: Backend stops — clearPromptSuggestionSink() fires onPromptSuggestionSinkChange(null)
    clearPromptSuggestionSink();

    // Without the fix in ComposerInputShellCoordinator, clearAll() + refreshSuggestionBar()
    // would NOT be called, and the chip would remain visible.
    expect(service.getActiveSuggestionText()).toBeNull();
    // onPromptSuggestionSinkChange fires immediately on subscribe with current state (null),
    // then again when clearPromptSuggestionSink() fires -> total 2 null callbacks.
    expect(refreshBarCallCount).toBe(2);

    unsubSinkChange();
    unsubAdapter?.();
  });
});

// ─── Session identity transition tests (RED first) ────────────────
//
// These test the real production race where:
//   1. Conversation starts with a provisional session id (e.g. "claude-code-xxx")
//   2. SDK backendSessionId is written after stream (e.g. "321c351f-...")
//   3. prompt_suggestion arrives with the real SDK session id
//   4. Without fix: suggestion is stored but never shown because activeSessionId
//      still holds the provisional id (or null), not the final SDK id.
//   5. After finalization's setActiveTabConversation triggers session resync,
//      the suggestion becomes visible.

describe('Prompt suggestion session identity transition', () => {
  let service: PromptSuggestionService;
  let barRefreshCount: number;
  let adapterCallback: ((chunk: StreamChunk) => void) | null;

  beforeEach(() => {
    service = new PromptSuggestionService();
    barRefreshCount = 0;
    adapterCallback = null;

    service.onBarRefreshRequested(() => { barRefreshCount++; });

    const adapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { adapterCallback = cb; return () => {}; },
    };
    service.attachAdapter(adapter);
  });

  it('case A: provisional activeSessionId does not match SDK suggestion sessionId — suggestion not visible', () => {
    // Simulate: conversation activated with provisional id
    service.setActiveSession('claude-code-provisional-123');

    // Suggestion arrives from SDK with the real session id
    adapterCallback!({
      type: 'prompt_suggestion',
      suggestion: 'Write tests for this module',
      uuid: 'ps-sdk-1',
      sessionId: '321c351f-c991-4799-9b16-9d18975bef4c',
    });

    // BUG: suggestion is stored but not visible because activeSessionId doesn't match
    expect(service.getSuggestion('321c351f-c991-4799-9b16-9d18975bef4c')).not.toBeNull();
    expect(service.getActiveSuggestionText()).toBeNull();
    // Bar refresh should NOT have fired (no match, no null activeSessionId)
    expect(barRefreshCount).toBe(0);
  });

  it('case A fixed: after session resync with final SDK id, suggestion becomes visible', () => {
    // Start with provisional id
    service.setActiveSession('claude-code-provisional-123');

    // Suggestion arrives from SDK with final id
    adapterCallback!({
      type: 'prompt_suggestion',
      suggestion: 'Write tests for this module',
      uuid: 'ps-sdk-1',
      sessionId: '321c351f-c991-4799-9b16-9d18975bef4c',
    });

    expect(service.getActiveSuggestionText()).toBeNull();

    // Simulate: finalization writes backendSessionId and resync triggers
    // session change through the prompt-suggestion bus
    service.onActiveSessionChanged('321c351f-c991-4799-9b16-9d18975bef4c');

    // NOW the suggestion should be visible
    expect(service.getActiveSuggestionText()).toBe('Write tests for this module');
    expect(barRefreshCount).toBeGreaterThan(0);
  });

  it('case B: after finalization session resync, suggestion stored under SDK id matches active session', () => {
    // Simulate full production flow:
    // 1. Conversation activated — no backend session id yet
    service.setActiveSession(null);

    // 2. Suggestion arrives from SDK (post-result) with real session id
    adapterCallback!({
      type: 'prompt_suggestion',
      suggestion: 'Refactor the error handler',
      uuid: 'ps-sdk-2',
      sessionId: 'sdk-sess-abc-def',
    });

    // Bar refresh fires because activeSessionId === null
    expect(barRefreshCount).toBeGreaterThan(0);
    // But suggestion is NOT visible yet (activeSessionId is null)
    expect(service.getActiveSuggestionText()).toBeNull();

    const prevRefreshCount = barRefreshCount;

    // 3. backendSessionId is written, finalization triggers session resync
    service.onActiveSessionChanged('sdk-sess-abc-def');

    // NOW the suggestion is visible
    expect(service.getActiveSuggestionText()).toBe('Refactor the error handler');
    expect(barRefreshCount).toBeGreaterThan(prevRefreshCount);
  });

  it('case C: session resync does not steal suggestions from other sessions', () => {
    // Two sessions active in different tabs
    service.setActiveSession('claude-code-tab-A');

    // Tab B receives a suggestion (stored but not visible for tab A)
    adapterCallback!({
      type: 'prompt_suggestion',
      suggestion: 'For tab B',
      uuid: 'ps-B',
      sessionId: 'sdk-sess-tab-B',
    });

    // Tab A's active session doesn't match — no bar refresh
    expect(service.getActiveSuggestionText()).toBeNull();

    // Tab A receives its own suggestion
    adapterCallback!({
      type: 'prompt_suggestion',
      suggestion: 'For tab A',
      uuid: 'ps-A',
      sessionId: 'sdk-sess-tab-A',
    });

    // Still not visible — provisional id doesn't match SDK id
    expect(service.getActiveSuggestionText()).toBeNull();

    // Tab A's finalization resyncs to the real SDK id
    service.onActiveSessionChanged('sdk-sess-tab-A');

    // Tab A's suggestion is now visible, Tab B's is NOT
    expect(service.getActiveSuggestionText()).toBe('For tab A');
    // Tab B's suggestion is still stored correctly
    expect(service.getSuggestion('sdk-sess-tab-B')!.suggestion).toBe('For tab B');
  });
});
