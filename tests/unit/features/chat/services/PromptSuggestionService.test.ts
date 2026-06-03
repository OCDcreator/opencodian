import type { StreamChunk } from '../../../../../src/core/types/chat';
import {
  type PromptSuggestionAdapter,
  PromptSuggestionService,
} from '../../../../../src/features/chat/services/PromptSuggestionService';

describe('PromptSuggestionService – storage & active session', () => {
  let service: PromptSuggestionService;

  beforeEach(() => {
    service = new PromptSuggestionService();
  });

  // ─── Per-session storage ──────────────────────────────────────

  it('starts with no suggestion for any session', () => {
    expect(service.getSuggestion('sess-1')).toBeNull();
  });

  it('stores a prompt suggestion per session', () => {
    service.setSuggestion({
      type: 'prompt_suggestion',
      suggestion: 'Refactor this function',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });

    expect(service.getSuggestion('sess-1')).toEqual({
      type: 'prompt_suggestion',
      suggestion: 'Refactor this function',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });
    expect(service.getSuggestion('sess-2')).toBeNull();
  });

  it('stores suggestions independently per session', () => {
    service.setSuggestion({
      type: 'prompt_suggestion',
      suggestion: 'Write tests',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });
    service.setSuggestion({
      type: 'prompt_suggestion',
      suggestion: 'Add docs',
      uuid: 'ps-2',
      sessionId: 'sess-2',
    });

    expect(service.getSuggestion('sess-1')!.suggestion).toBe('Write tests');
    expect(service.getSuggestion('sess-2')!.suggestion).toBe('Add docs');
  });

  it('clears suggestion for a specific session', () => {
    service.setSuggestion({
      type: 'prompt_suggestion',
      suggestion: 'A',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });
    service.setSuggestion({
      type: 'prompt_suggestion',
      suggestion: 'B',
      uuid: 'ps-2',
      sessionId: 'sess-2',
    });
    service.clearForSession('sess-1');

    expect(service.getSuggestion('sess-1')).toBeNull();
    expect(service.getSuggestion('sess-2')!.suggestion).toBe('B');
  });

  it('clears all suggestions', () => {
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'A', uuid: 'ps-1', sessionId: 'sess-1' });
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'B', uuid: 'ps-2', sessionId: 'sess-2' });
    service.clearAll();

    expect(service.getSuggestion('sess-1')).toBeNull();
    expect(service.getSuggestion('sess-2')).toBeNull();
  });

  it('drops suggestions without sessionId', () => {
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'No session', uuid: 'ps-ns' });
    expect(service.getSuggestion('')).toBeNull();
  });

  // ─── Active session + bar refresh ─────────────────────────────

  it('getActiveSuggestionText returns null when no active session', () => {
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'Hello', uuid: 'ps-1', sessionId: 'sess-1' });
    expect(service.getActiveSuggestionText()).toBeNull();
  });

  it('getActiveSuggestionText returns suggestion for active session', () => {
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'Hello', uuid: 'ps-1', sessionId: 'sess-1' });
    service.setActiveSession('sess-1');
    expect(service.getActiveSuggestionText()).toBe('Hello');
  });

  it('getActiveSuggestionText returns null when active session has no suggestion', () => {
    service.setActiveSession('sess-nope');
    expect(service.getActiveSuggestionText()).toBeNull();
  });

  it('acceptActiveSuggestion returns text and clears', () => {
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'Accept me', uuid: 'ps-1', sessionId: 'sess-1' });
    service.setActiveSession('sess-1');

    const text = service.acceptActiveSuggestion();
    expect(text).toBe('Accept me');
    expect(service.getActiveSuggestionText()).toBeNull();
  });

  it('acceptActiveSuggestion returns null when no active suggestion', () => {
    service.setActiveSession('sess-1');
    expect(service.acceptActiveSuggestion()).toBeNull();
  });

  it('clearActiveOnTurnStart clears and triggers bar refresh', () => {
    const refreshCb = jest.fn();
    service.onBarRefreshRequested(refreshCb);
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'Old', uuid: 'ps-1', sessionId: 'sess-1' });
    service.setActiveSession('sess-1');

    service.clearActiveOnTurnStart();

    expect(service.getActiveSuggestionText()).toBeNull();
    expect(refreshCb).toHaveBeenCalledTimes(1);
  });

  it('clearActiveOnTurnStart does nothing when no active suggestion', () => {
    const refreshCb = jest.fn();
    service.onBarRefreshRequested(refreshCb);
    service.setActiveSession('sess-1');

    service.clearActiveOnTurnStart();

    expect(refreshCb).not.toHaveBeenCalled();
  });

  it('onActiveSessionChanged triggers bar refresh', () => {
    const refreshCb = jest.fn();
    service.onBarRefreshRequested(refreshCb);

    service.onActiveSessionChanged('sess-1');

    expect(refreshCb).toHaveBeenCalledTimes(1);
    expect(service.getActiveSuggestionText()).toBeNull();
  });

  it('onActiveSessionChanged with session shows its suggestion', () => {
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'Visible now', uuid: 'ps-1', sessionId: 'sess-1' });
    const refreshCb = jest.fn();
    service.onBarRefreshRequested(refreshCb);

    service.onActiveSessionChanged('sess-1');

    expect(service.getActiveSuggestionText()).toBe('Visible now');
    expect(refreshCb).toHaveBeenCalledTimes(1);
  });
});

describe('PromptSuggestionService – adapter & events', () => {
  let service: PromptSuggestionService;

  beforeEach(() => {
    service = new PromptSuggestionService();
  });

  // ─── Adapter subscription ─────────────────────────────────────

  it('attachAdapter receives suggestions through callback', () => {
    let capturedCallback: ((chunk: StreamChunk) => void) | null = null;
    const mockAdapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { capturedCallback = cb; return () => {}; },
    };

    service.attachAdapter(mockAdapter);
    service.setActiveSession('sess-1');
    const refreshCb = jest.fn();
    service.onBarRefreshRequested(refreshCb);

    // Simulate adapter firing callback
    capturedCallback!({
      type: 'prompt_suggestion',
      suggestion: 'From adapter',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });

    expect(service.getActiveSuggestionText()).toBe('From adapter');
    expect(refreshCb).toHaveBeenCalledTimes(1);
  });

  it('attachAdapter does not trigger bar refresh for inactive session', () => {
    let capturedCallback: ((chunk: StreamChunk) => void) | null = null;
    const mockAdapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { capturedCallback = cb; return () => {}; },
    };

    service.attachAdapter(mockAdapter);
    service.setActiveSession('sess-active');
    const refreshCb = jest.fn();
    service.onBarRefreshRequested(refreshCb);

    // Suggestion for a different session
    capturedCallback!({
      type: 'prompt_suggestion',
      suggestion: 'For other session',
      uuid: 'ps-2',
      sessionId: 'sess-other',
    });

    expect(service.getActiveSuggestionText()).toBeNull();
    expect(refreshCb).not.toHaveBeenCalled();
    // But it IS stored
    expect(service.getSuggestion('sess-other')!.suggestion).toBe('For other session');
  });

  it('attachAdapter triggers bar refresh when activeSessionId is null (allows coordinator host sync)', () => {
    let capturedCallback: ((chunk: StreamChunk) => void) | null = null;
    const mockAdapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { capturedCallback = cb; return () => {}; },
    };

    service.attachAdapter(mockAdapter);
    // activeSessionId is null by default — simulates a new conversation
    // before backendSessionId has been established.
    const refreshCb = jest.fn();
    service.onBarRefreshRequested(refreshCb);

    capturedCallback!({
      type: 'prompt_suggestion',
      suggestion: 'For current context',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });

    // Suggestion is stored but not yet visible because activeSessionId is null
    expect(service.getActiveSuggestionText()).toBeNull();
    // Bar refresh is requested so the coordinator can sync activeSessionId
    // from host.getCurrentBackendSessionId() and then re-render.
    expect(refreshCb).toHaveBeenCalledTimes(1);
    expect(service.getSuggestion('sess-1')!.suggestion).toBe('For current context');
  });

  it('attachAdapter unsubscribe stops receiving callbacks', () => {
    let capturedCallback: ((chunk: StreamChunk) => void) | null = null;
    const mockAdapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { capturedCallback = cb; return () => {}; },
    };

    const unsub = service.attachAdapter(mockAdapter);
    unsub();

    service.setActiveSession('sess-1');
    capturedCallback!({
      type: 'prompt_suggestion',
      suggestion: 'Ignored',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });

    expect(service.getActiveSuggestionText()).toBeNull();
  });

  it('attachAdapter ignores chunks without sessionId', () => {
    let capturedCallback: ((chunk: StreamChunk) => void) | null = null;
    const mockAdapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { capturedCallback = cb; return () => {}; },
    };

    service.attachAdapter(mockAdapter);
    capturedCallback!({ type: 'prompt_suggestion', suggestion: 'No session', uuid: 'ps-ns' });

    expect(service.getSuggestion('')).toBeNull();
  });

  it('multiple attachAdapter calls register distinct callbacks on the same adapter', () => {
    const callbacks: Array<(chunk: StreamChunk) => void> = [];
    const mockAdapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { callbacks.push(cb); return () => {}; },
    };

    service.attachAdapter(mockAdapter);
    const service2 = new PromptSuggestionService();
    service2.attachAdapter(mockAdapter);

    expect(callbacks.length).toBe(2);
  });

  it('destroying one coordinator does not break another on the same adapter', () => {
    const callbacks: Array<(chunk: StreamChunk) => void> = [];
    const mockAdapter: PromptSuggestionAdapter = {
      onPostResultChunk: (cb) => { callbacks.push(cb); return () => {}; },
    };

    const unsub1 = service.attachAdapter(mockAdapter);
    const service2 = new PromptSuggestionService();
    service2.attachAdapter(mockAdapter);

    service.setActiveSession('sess-1');
    service2.setActiveSession('sess-1');

    // Destroy coordinator 1
    unsub1();

    // Coordinator 2 should still receive
    callbacks[1]!({
      type: 'prompt_suggestion',
      suggestion: 'Still works',
      uuid: 'ps-2',
      sessionId: 'sess-1',
    });

    expect(service2.getActiveSuggestionText()).toBe('Still works');
    expect(service.getActiveSuggestionText()).toBeNull();
  });

  // ─── Never auto-sends ─────────────────────────────────────────

  it('has no send/autoSend methods', () => {
    expect((service as unknown as Record<string, unknown>).send).toBeUndefined();
    expect((service as unknown as Record<string, unknown>).autoSend).toBeUndefined();
  });

  // ─── Event listeners ─────────────────────────────────────────

  it('onSuggestionSet notifies listeners', () => {
    const cb = jest.fn();
    service.onSuggestionSet(cb);
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'Hi', uuid: 'ps-1', sessionId: 'sess-1' });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ suggestion: 'Hi' }));
  });

  it('onSuggestionCleared notifies listeners', () => {
    const cb = jest.fn();
    service.onSuggestionCleared(cb);
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'Hi', uuid: 'ps-1', sessionId: 'sess-1' });
    service.clearForSession('sess-1');
    expect(cb).toHaveBeenCalledWith('sess-1');
  });

  it('onSuggestionSet unsubscribe stops notifications', () => {
    const cb = jest.fn();
    const unsub = service.onSuggestionSet(cb);
    unsub();
    service.setSuggestion({ type: 'prompt_suggestion', suggestion: 'Hi', uuid: 'ps-1', sessionId: 'sess-1' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('onBarRefreshRequested unsubscribe stops notifications', () => {
    const cb = jest.fn();
    const unsub = service.onBarRefreshRequested(cb);
    unsub();
    service.onActiveSessionChanged('sess-1');
    expect(cb).not.toHaveBeenCalled();
  });
});
