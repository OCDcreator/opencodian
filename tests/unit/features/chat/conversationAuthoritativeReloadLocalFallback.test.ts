import type { OpenCodeSessionMessageWithParts } from '../../../../src/core/opencode';
import type { ChatMessage } from '../../../../src/core/types';
import {
  shouldBypassCanonicalSyncForInterruptedNotice,
  shouldPreserveInterruptedNoticeOnSync,
} from '../../../../src/features/chat/services/conversationAuthoritativeReloadLocalFallback';

function makeInterruptedNotice(timestamp = 2000): ChatMessage {
  return {
    id: `assistant-interrupted-${timestamp}`,
    role: 'assistant',
    content: 'Stream was interrupted',
    timestamp,
    modelId: 'test-model',
    displayStyle: 'notice',
    noticeTitle: 'Interrupted',
    noticeTone: 'warning',
  };
}

function makeUserMessage(id = 'user-1', timestamp = 1000, sourceMessageId?: string): ChatMessage {
  return {
    id,
    role: 'user',
    content: 'Hello',
    timestamp,
    sourceMessageId,
  };
}

function makeAssistantMessage(id = 'assistant-1', timestamp = 3000, sourceMessageId?: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'Response',
    timestamp,
    modelId: 'test-model',
    sourceMessageId,
  };
}

describe('conversationAuthoritativeReloadLocalFallback', () => {
  describe('shouldPreserveInterruptedNoticeOnSync', () => {
    it('preserves the latest interrupted notice when synced messages have no assistant after user', () => {
      const existing = [makeUserMessage(), makeInterruptedNotice()];
      const synced = [makeUserMessage()];

      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, makeInterruptedNotice()),
      ).toBe(true);
    });

    it('preserves the latest interrupted notice even when synced messages have an assistant after user', () => {
      const existing = [makeUserMessage(), makeInterruptedNotice()];
      const synced = [makeUserMessage(), makeAssistantMessage()];

      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, makeInterruptedNotice()),
      ).toBe(true);
    });

    it('preserves the latest interrupted notice when synced messages are empty', () => {
      const existing = [makeUserMessage(), makeInterruptedNotice()];
      const synced: ChatMessage[] = [];

      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, makeInterruptedNotice()),
      ).toBe(true);
    });

    it('returns false for non-interrupted-notice messages', () => {
      const existing = [makeUserMessage(), makeAssistantMessage()];
      const synced = [makeUserMessage()];

      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, makeAssistantMessage()),
      ).toBe(false);
    });

    it('returns false when message is a notice but not an interrupted notice', () => {
      const regularNotice: ChatMessage = {
        id: 'assistant-notice-1',
        role: 'assistant',
        content: 'Some notice',
        timestamp: 2000,
        displayStyle: 'notice',
        noticeTone: 'info',
      };
      const existing = [makeUserMessage(), regularNotice];
      const synced = [makeUserMessage()];

      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, regularNotice),
      ).toBe(false);
    });

    it('returns false for a stale interrupted notice that is not the latest', () => {
      const oldNotice = makeInterruptedNotice(1500);
      const newNotice = makeInterruptedNotice(2000);
      const existing = [makeUserMessage(), oldNotice, makeUserMessage('user-2', 1800), newNotice];
      const synced: ChatMessage[] = [];

      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, oldNotice),
      ).toBe(false);
    });

    it('preserves the latest interrupted notice while dropping older ones', () => {
      const oldNotice = makeInterruptedNotice(1500);
      const newNotice = makeInterruptedNotice(2000);
      const existing = [makeUserMessage(), oldNotice, makeUserMessage('user-2', 1800), newNotice];
      const synced: ChatMessage[] = [];

      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, newNotice),
      ).toBe(true);
      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, oldNotice),
      ).toBe(false);
    });
  });

  describe('shouldBypassCanonicalSyncForInterruptedNotice', () => {
    it('bypasses canonical sync when no canonical assistant matches the user', () => {
      const existing = [makeUserMessage('user-1', 1000, 'src-user-1'), makeInterruptedNotice()];
      const canonical: OpenCodeSessionMessageWithParts[] = [
        { info: { id: 'msg-1', role: 'user', sessionID: 'sess-1', parentID: '' } as never, parts: [] },
      ];

      expect(
        shouldBypassCanonicalSyncForInterruptedNotice(existing, canonical),
      ).toBe(true);
    });

    it('does not bypass when no interrupted notice exists', () => {
      const existing = [makeUserMessage()];
      const canonical: OpenCodeSessionMessageWithParts[] = [];

      expect(
        shouldBypassCanonicalSyncForInterruptedNotice(existing, canonical),
      ).toBe(false);
    });
  });
});
