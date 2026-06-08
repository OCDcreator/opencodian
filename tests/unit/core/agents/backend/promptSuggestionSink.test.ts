import {
  clearAllPromptSuggestionSessionCallbacks,
  clearPromptSuggestionSink,
  getPromptSuggestionSink,
  onPromptSuggestionSinkChange,
  registerPromptSuggestionSink,
} from '../../../../../src/core/agents/backend/promptSuggestionSink';
import type { StreamChunk } from '../../../../../src/core/types/chat';

/** Minimal sink for testing. */
function createTestSink(): { onPostResultChunk: (cb: (chunk: StreamChunk) => void) => (() => void) } {
  return {
    onPostResultChunk: () => () => {},
  };
}

describe('promptSuggestionSink – sink change notifications', () => {
  beforeEach(() => {
    clearPromptSuggestionSink();
    clearAllPromptSuggestionSessionCallbacks();
  });

  it('notifies subscriber when sink is registered', () => {
    const changes: Array<ReturnType<typeof getPromptSuggestionSink>> = [];
    const unsub = onPromptSuggestionSinkChange((sink) => {
      changes.push(sink);
    });

    // Subscriber is immediately notified with current sink (null)
    expect(changes).toEqual([null]);

    const sink = createTestSink();
    registerPromptSuggestionSink(sink);

    expect(changes).toEqual([null, sink]);

    unsub();
  });

  it('notifies subscriber when sink is cleared', () => {
    const sink = createTestSink();
    registerPromptSuggestionSink(sink);

    const changes: Array<ReturnType<typeof getPromptSuggestionSink>> = [];
    const unsub = onPromptSuggestionSinkChange((s) => {
      changes.push(s);
    });

    // Subscriber is immediately notified with current sink
    expect(changes).toEqual([sink]);

    clearPromptSuggestionSink();

    expect(changes).toEqual([sink, null]);

    unsub();
  });

  it('does not notify after unsubscribe', () => {
    const changes: Array<ReturnType<typeof getPromptSuggestionSink>> = [];
    const unsub = onPromptSuggestionSinkChange((sink) => {
      changes.push(sink);
    });

    // Immediate notification with current null sink
    expect(changes).toEqual([null]);

    unsub();
    registerPromptSuggestionSink(createTestSink());

    // No additional notifications after unsubscribe
    expect(changes).toEqual([null]);
  });

  it('supports multiple subscribers', () => {
    const changesA: Array<ReturnType<typeof getPromptSuggestionSink>> = [];
    const changesB: Array<ReturnType<typeof getPromptSuggestionSink>> = [];

    onPromptSuggestionSinkChange((sink) => { changesA.push(sink); });
    onPromptSuggestionSinkChange((sink) => { changesB.push(sink); });

    const sink = createTestSink();
    registerPromptSuggestionSink(sink);

    // Each subscriber got the initial null, then the registered sink
    expect(changesA).toEqual([null, sink]);
    expect(changesB).toEqual([null, sink]);
  });

  it('notifies new subscriber with current sink immediately', () => {
    const sink = createTestSink();
    registerPromptSuggestionSink(sink);

    const changes: Array<ReturnType<typeof getPromptSuggestionSink>> = [];
    onPromptSuggestionSinkChange((s) => { changes.push(s); });

    expect(changes).toEqual([sink]);
  });

  it('notifies new subscriber with null when no sink is registered', () => {
    const changes: Array<ReturnType<typeof getPromptSuggestionSink>> = [];
    onPromptSuggestionSinkChange((s) => { changes.push(s); });

    expect(changes).toEqual([null]);
  });
});
