# Persist Interrupted Notice Card After Stream Cancellation

## Problem

When a user cancels agent output before any visible content appears, an "interrupted" notice card is rendered briefly, then disappears. The user expects this card to persist as a visible record of the interruption.

## Root Cause

During stream finalization (`StreamLocalFinalizer`), when there are no stream content blocks and the stream was interrupted:

1. `StreamShellFinalizer` renders the interrupted notice card into the DOM.
2. `LocalStreamMessagePersistence` appends the `assistant-interrupted-{ts}` message to `conversation.messages`.
3. `shouldSyncFromServer = true` triggers a canonical or server sync.
4. The server's session abort may leave an assistant message record in the canonical cache (`OpenCodeSessionStateStore`).
5. During sync merge, `shouldPreserveInterruptedNoticeOnSync` checks whether synced messages contain an assistant after the latest user message. If the canonical cache has any assistant record (even empty/partial), it returns `false`, causing the interrupted notice to be dropped from the merged message list.
6. `applySyncedConversationUpdate` re-renders the DOM from the merged list, removing the notice card.

## Approach

**Unconditionally preserve the interrupted notice during sync merges.**

Modify `shouldPreserveInterruptedNoticeOnSync` in `conversationAuthoritativeReloadLocalFallback.ts` to always return `true` for valid interrupted notice messages, removing the condition that checks for server-side assistant messages.

This is a frontend-only behavioral change. The interrupted notice is a local client artifact (`displayStyle: 'notice'`, `noticeTone: 'warning'`, no `sourceMessageId`). It should survive sync regardless of what the server reports, because the user's cancellation is a local fact.

## Affected Files

- `src/features/chat/services/conversationAuthoritativeReloadLocalFallback.ts` — modify `shouldPreserveInterruptedNoticeOnSync`
- `src/features/chat/services/conversationAuthoritativeReloadLocalFallback.test.ts` — update/add tests

## Acceptance Criteria

1. When a user cancels agent output before any visible content, the interrupted notice card remains visible indefinitely.
2. Subsequent conversation sync events (canonical or server) do not remove the card.
3. The card persists across conversation reload.
4. Sending a new message after the interrupted card works normally.
5. Existing sync behavior for non-interrupted messages is unchanged.
