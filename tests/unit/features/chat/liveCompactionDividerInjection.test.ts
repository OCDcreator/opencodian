import type { ChatMessage } from '../../../../src/core/types';
import { injectLiveCompactionDivider } from '../../../../src/features/chat/renderGroups';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? 'message-1',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? '',
    timestamp: overrides.timestamp ?? 1,
    ...overrides,
  };
}

describe('injectLiveCompactionDivider', () => {
  it('injects a synthetic divider at the end when no summary exists and compactingAt is set', () => {
    const messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi', timestamp: 100 }),
      createMessage({ id: 'asst-1', role: 'assistant', content: 'Hello', timestamp: 200 }),
    ];

    const result = injectLiveCompactionDivider({ messages, compactingAt: 300, tabId: 'tab-1' });

    expect(result).toHaveLength(3);
    expect(result[2].compactionDivider).toEqual({
      auto: true,
      overflow: false,
      tailStartId: '',
      live: true,
    });
    expect(result[2].role).toBe('user');
    expect(result[2].id).toBe('__live-compaction-tab-1');
  });

  it('injects before the first summary after the compaction point', () => {
    const messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi', timestamp: 100 }),
      createMessage({ id: 'summary-1', role: 'assistant', content: 'Compressed', timestamp: 400, summary: true }),
      createMessage({ id: 'asst-2', role: 'assistant', content: 'New answer', timestamp: 500 }),
    ];

    const result = injectLiveCompactionDivider({ messages, compactingAt: 300, tabId: 'tab-1' });

    expect(result).toHaveLength(4);
    expect(result[1].compactionDivider?.live).toBe(true);
    expect(result[1].id).toBe('__live-compaction-tab-1');
    expect(result[2].summary).toBe(true);
  });

  it('suppresses synthetic divider when a persisted divider already exists for the phase', () => {
    const messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi', timestamp: 100 }),
      createMessage({
        id: 'divider-1',
        role: 'user',
        content: '',
        timestamp: 350,
        compactionDivider: { auto: true, overflow: false, tailStartId: '' },
      }),
      createMessage({ id: 'summary-1', role: 'assistant', content: 'Compressed', timestamp: 400, summary: true }),
    ];

    const result = injectLiveCompactionDivider({ messages, compactingAt: 300, tabId: 'tab-1' });

    expect(result).toHaveLength(3);
    expect(result.every((m) => !m.id.includes('__live-compaction'))).toBe(true);
  });

  it('does not inject when compactingAt is null', () => {
    const messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi', timestamp: 100 }),
    ];

    const result = injectLiveCompactionDivider({ messages, compactingAt: null, tabId: 'tab-1' });

    expect(result).toHaveLength(1);
  });

  it('does not match a persisted divider from an earlier compaction phase', () => {
    const messages = [
      createMessage({
        id: 'divider-old',
        role: 'user',
        content: '',
        timestamp: 100,
        compactionDivider: { auto: true, overflow: false, tailStartId: '' },
      }),
      createMessage({ id: 'user-2', role: 'user', content: 'More', timestamp: 200 }),
    ];

    const result = injectLiveCompactionDivider({ messages, compactingAt: 300, tabId: 'tab-1' });

    expect(result).toHaveLength(3);
    expect(result[2].compactionDivider?.live).toBe(true);
    expect(result[2].id).toBe('__live-compaction-tab-1');
  });

  it('does not suppress when only a live divider exists for the same phase', () => {
    const messages = [
      createMessage({
        id: '__live-compaction-tab-other',
        role: 'user',
        content: '',
        timestamp: 310,
        compactionDivider: { auto: true, overflow: false, tailStartId: '', live: true },
      }),
    ];

    const result = injectLiveCompactionDivider({ messages, compactingAt: 300, tabId: 'tab-1' });

    expect(result).toHaveLength(2);
    expect(result[1].compactionDivider?.live).toBe(true);
  });

  it('binds the synthetic divider id to the provided tab id', () => {
    const result = injectLiveCompactionDivider({
      messages: [createMessage({ id: 'm-1' })],
      compactingAt: 100,
      tabId: 'my-tab',
    });

    expect(result[1].id).toBe('__live-compaction-my-tab');
  });
});
