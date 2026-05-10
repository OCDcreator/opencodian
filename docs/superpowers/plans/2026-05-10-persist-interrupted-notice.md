# Persist Interrupted Notice Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the interrupted notice card survive conversation sync so it persists on screen after the user cancels agent output.

**Architecture:** Modify `shouldPreserveInterruptedNoticeOnSync` in `conversationAuthoritativeReloadLocalFallback.ts` to unconditionally return `true` for valid interrupted notice messages, removing the server-side assistant message check that causes the notice to be dropped during sync merges.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add failing tests for unconditional interrupted notice preservation

**Files:**
- Create: `tests/unit/features/chat/conversationAuthoritativeReloadLocalFallback.test.ts`

- [ ] **Step 1: Write the failing test**

Create a test file with three test cases covering the key behaviors:

```typescript
import type { ChatMessage } from '../../../../src/core/types';
import {
  shouldPreserveInterruptedNoticeOnSync,
  shouldBypassCanonicalSyncForInterruptedNotice,
} from '../../../../src/features/chat/services/conversationAuthoritativeReloadLocalFallback';
import type { OpenCodeSessionMessageWithParts } from '../../../../src/core/opencode';

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
    it('preserves interrupted notice when synced messages have no assistant after user', () => {
      const existing = [makeUserMessage(), makeInterruptedNotice()];
      const synced = [makeUserMessage()];

      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, makeInterruptedNotice()),
      ).toBe(true);
    });

    it('preserves interrupted notice even when synced messages have an assistant after user', () => {
      const existing = [makeUserMessage(), makeInterruptedNotice()];
      const synced = [makeUserMessage(), makeAssistantMessage()];

      expect(
        shouldPreserveInterruptedNoticeOnSync(existing, synced, makeInterruptedNotice()),
      ).toBe(true);
    });

    it('preserves interrupted notice when synced messages are empty', () => {
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

    it('returns false when message is not an interrupted notice', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/features/chat/conversationAuthoritativeReloadLocalFallback.test.ts`
Expected: The test "preserves interrupted notice even when synced messages have an assistant after user" FAILS because the current implementation returns `false` in that case.

---

### Task 2: Implement unconditional preservation of interrupted notice

**Files:**
- Modify: `src/features/chat/services/conversationAuthoritativeReloadLocalFallback.ts:47-75`

- [ ] **Step 1: Simplify `shouldPreserveInterruptedNoticeOnSync`**

Replace the function body at lines 47-75 with:

```typescript
export function shouldPreserveInterruptedNoticeOnSync(
  existingMessages: ChatMessage[],
  syncedMessages: ChatMessage[],
  message: ChatMessage,
): boolean {
  if (!isInterruptedNoticeMessage(message)) {
    return false;
  }

  const latestInterruptedNotice = findLatestInterruptedNotice(existingMessages);
  if (!latestInterruptedNotice) {
    return false;
  }

  return true;
}
```

This removes the user lookup and assistant-check logic. Any valid interrupted notice in the existing messages is unconditionally preserved during sync merges.

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/unit/features/chat/conversationAuthoritativeReloadLocalFallback.test.ts`
Expected: ALL tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: ALL tests PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/features/chat/services/conversationAuthoritativeReloadLocalFallback.ts tests/unit/features/chat/conversationAuthoritativeReloadLocalFallback.test.ts
git commit -m "fix: persist interrupted notice card after stream cancellation"
```

---

### Task 3: Update module docs

**Files:**
- Modify: `docs/modules/features/chat/services/conversationAuthoritativeReloadLocalFallback.md`

- [ ] **Step 1: Update module doc to reflect the behavioral change**

Read the current file and update the description of `shouldPreserveInterruptedNoticeOnSync` to note that it now unconditionally preserves interrupted notice messages regardless of server-side state.

- [ ] **Step 2: Verify module docs**

Run: `npm run check:module-docs`
Expected: PASS (no drift).

- [ ] **Step 3: Commit**

```bash
git add docs/modules/features/chat/services/conversationAuthoritativeReloadLocalFallback.md
git commit -m "docs: clarify unconditional interrupted notice preservation"
```

---

### Task 4: Build and verify

- [ ] **Step 1: Run full verify**

Run: `npm run verify`
Expected: lint, typecheck, tests, and build all PASS.

- [ ] **Step 2: Deploy to Test Vault**

```bash
npm run build
cp dist/main.js "C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js"
cp dist/manifest.json "C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\manifest.json"
cp dist/styles.css "C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\styles.css"
```

Verify Test Vault `main.js` contains the newest `BUILD_ID`.
