# Session Lifecycle Tier 2 Cache Eviction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded full-message memory retention for conversations and canonical OpenCode session state while preserving all open-tab conversation behavior.

**Architecture:** Keep `.opencodian/sessions/{id}.json` as the durable full-conversation truth and keep `.opencodian/session-metas/{id}.json` as the lightweight history-list truth. Add a small pure full-message cache policy owner that trims in-memory `Conversation.messages` only for unpinned conversations, and add explicit canonical session eviction APIs to `OpenCodeSessionStateStore`. The first iteration pins every open tab, which safely covers active, restored, streaming, finalizing, syncing, and background-task tabs without teaching storage about chat runtime internals.

**Tech Stack:** TypeScript, Jest, Obsidian plugin storage adapter, existing OpenCode canonical session graph, `npm run graphify:update:src`, `npm run verify`.

---

## Scope Check

This plan implements the Council Tier 2 items from `docs/status/session-lifecycle-council-review-2026-05-10.md`:

- Obsidian-adapted LRU full-message cache: metadata index plus pinned full conversations plus bounded unpinned full-message retention.
- Canonical session map eviction API: explicit local deletion for `OpenCodeSessionStateStore.sessions` and associated diff entries.

This plan does not remove all runtime reads from `Conversation.messages`; that is the larger Tier 3 canonical-only migration and should follow after this bounded-cache layer is stable.

## File Structure

- Modify `src/core/opencode/OpenCodeSessionStateStore.ts`
  - Add local session eviction helpers: `deleteSession()`, `deleteSessions()`, `getSessionIds()`, and `getSessionCount()`.
  - Keep deletion local to canonical graph state and diff-entry cache.
- Modify `src/core/opencode/OpenCodeService.ts`
  - Clear local canonical state when `deleteSession()` completes or throws, so deleted conversations do not keep canonical messages in memory.
- Create `src/core/storage/ConversationFullMessageCache.ts`
  - Pure policy owner for tracking full-message LRU order and replacing evicted unpinned conversations with metadata-only copies.
- Modify `src/main.ts`
  - Own a `ConversationFullMessageCache` instance.
  - Expose `registerConversationCachePinProvider()` / `unregisterConversationCachePinProvider()` so multiple chat views can pin open-tab conversations.
  - Touch full-message cache entries after create, load, and save.
  - Trim unpinned full-message entries after load/save/delete.
- Modify `src/features/chat/OpenCodianView.ts`
  - Register a pin provider on open and clear it on close.
  - Pin every conversation currently represented by an open tab plus the current conversation.
- Modify `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
  - Call plugin cache trimming from the existing tab-manager `onChanged` callback after render/persist.
- Update tests:
  - `tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts`
  - `tests/unit/core/storage/ConversationFullMessageCache.test.ts`
  - `tests/unit/main.test.ts`
- Update docs:
  - `docs/modules/core/opencode/OpenCodeSessionStateStore.md`
  - Create `docs/modules/core/storage/ConversationFullMessageCache.md`
  - Update `docs/modules/core/storage/StorageService.md`
  - Update `docs/modules/features/chat/OpenCodianView.md`
  - Append a Tier 2 plan link to `docs/status/session-lifecycle-council-review-2026-05-10.md`
- Generated:
  - `graphify-out/**`

## Task 1: Add Canonical Session Eviction API

**Files:**
- Modify: `src/core/opencode/OpenCodeSessionStateStore.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`
- Test: `tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts`
- Docs: `docs/modules/core/opencode/OpenCodeSessionStateStore.md`

- [ ] **Step 1: Write the failing store eviction tests**

Append these tests inside `describe('OpenCodeSessionStateStore', () => { ... })` in `tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts`, before the existing `describe('session diff entries', () => { ... })` block:

```typescript
  it('deletes one canonical session and its diff entries without touching other sessions', () => {
    const store = new OpenCodeSessionStateStore();
    store.replaceSessionSnapshot('session-1', [
      { info: createMessage('msg-1', { sessionID: 'session-1' }), parts: [] },
    ]);
    store.replaceSessionSnapshot('session-2', [
      { info: createMessage('msg-2', { sessionID: 'session-2' }), parts: [] },
    ]);
    store.setSessionDiffEntries('session-1', [
      { file: 'a.ts', additions: 1, deletions: 0 },
    ]);
    store.setSessionDiffEntries('session-2', [
      { file: 'b.ts', additions: 2, deletions: 0 },
    ]);

    const deleted = store.deleteSession('session-1');

    expect(deleted).toBe(true);
    expect(store.getSessionState('session-1')).toBeNull();
    expect(store.getSessionDiffEntries('session-1')).toEqual([]);
    expect(store.getSessionState('session-2')?.messages.map((message) => message.id)).toEqual(['msg-2']);
    expect(store.getSessionDiffEntries('session-2')).toEqual([
      { file: 'b.ts', additions: 2, deletions: 0 },
    ]);
  });

  it('returns false when deleting an unknown canonical session', () => {
    const store = new OpenCodeSessionStateStore();

    expect(store.deleteSession('missing-session')).toBe(false);
    expect(store.getSessionCount()).toBe(0);
    expect(store.getSessionIds()).toEqual([]);
  });

  it('deletes multiple canonical sessions and reports deleted ids in request order', () => {
    const store = new OpenCodeSessionStateStore();
    store.replaceSessionSnapshot('session-1', [
      { info: createMessage('msg-1', { sessionID: 'session-1' }), parts: [] },
    ]);
    store.replaceSessionSnapshot('session-2', [
      { info: createMessage('msg-2', { sessionID: 'session-2' }), parts: [] },
    ]);
    store.replaceSessionSnapshot('session-3', [
      { info: createMessage('msg-3', { sessionID: 'session-3' }), parts: [] },
    ]);

    expect(store.deleteSessions(['session-3', 'missing-session', 'session-1'])).toEqual([
      'session-3',
      'session-1',
    ]);
    expect(store.getSessionIds()).toEqual(['session-2']);
    expect(store.getSessionCount()).toBe(1);
  });
```

- [ ] **Step 2: Run the failing store test**

Run:

```bash
npm run test -- tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts --runInBand
```

Expected: FAIL with TypeScript errors for `deleteSession`, `deleteSessions`, `getSessionCount`, and `getSessionIds`.

- [ ] **Step 3: Add eviction helpers to the store**

In `src/core/opencode/OpenCodeSessionStateStore.ts`, add these methods after `removeSessionDiffEntries()` and before `getSessionState()`:

```typescript
  deleteSession(sessionID: string): boolean {
    const deleted = this.sessions.delete(sessionID);
    this.diffEntriesBySessionId.delete(sessionID);
    return deleted;
  }

  deleteSessions(sessionIDs: Iterable<string>): string[] {
    const deletedSessionIds: string[] = [];
    for (const sessionID of sessionIDs) {
      if (this.deleteSession(sessionID)) {
        deletedSessionIds.push(sessionID);
      }
    }
    return deletedSessionIds;
  }

  getSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
```

- [ ] **Step 4: Clear local canonical state after OpenCode session deletion**

In `src/core/opencode/OpenCodeService.ts`, replace the current `deleteSession()` method:

```typescript
  async deleteSession(sessionId: string): Promise<void> {
    return this.sessionLifecycle.deleteSession(sessionId);
  }
```

with:

```typescript
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.sessionLifecycle.deleteSession(sessionId);
    } finally {
      this.sessionStateStore.deleteSession(sessionId);
    }
  }
```

- [ ] **Step 5: Run focused OpenCode tests**

Run:

```bash
npm run test -- tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts tests/unit/core/opencode/OpenCodeService.sessionRuntime.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Update the OpenCode session-store module doc**

In `docs/modules/core/opencode/OpenCodeSessionStateStore.md`, add `session eviction` to the overview list:

```markdown
- session 级 eviction，用于删除会话或长期运行缓存收缩时释放 canonical graph
```

Add these rows to the key-method table:

```markdown
| `deleteSession()` | 删除单个 session 的 canonical graph 与 diff entries |
| `deleteSessions()` | 按请求顺序批量删除多个 session，并返回实际删除的 session id |
| `getSessionIds()` | 返回当前 canonical store 持有的 session id 列表 |
| `getSessionCount()` | 返回当前 canonical store 持有的 session 数 |
```

Add this note under `## 注意事项`:

```markdown
- `deleteSession()` 只清理本地 canonical graph；服务端删除仍由 `OpenCodeSessionLifecycleCoordinator` / `OpenCodeService.deleteSession()` 发起。
```

- [ ] **Step 7: Commit Task 1**

```bash
git add src/core/opencode/OpenCodeSessionStateStore.ts src/core/opencode/OpenCodeService.ts tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts docs/modules/core/opencode/OpenCodeSessionStateStore.md
git commit -m "refactor: add canonical session eviction"
```

## Task 2: Add A Pure Full-Message Cache Policy Owner

**Files:**
- Create: `src/core/storage/ConversationFullMessageCache.ts`
- Test: `tests/unit/core/storage/ConversationFullMessageCache.test.ts`
- Docs: `docs/modules/core/storage/ConversationFullMessageCache.md`

- [ ] **Step 1: Write the failing cache-policy tests**

Create `tests/unit/core/storage/ConversationFullMessageCache.test.ts`:

```typescript
import type { Conversation } from '../../../../src/core/types';
import {
  ConversationFullMessageCache,
  cloneConversationMetadataOnly,
} from '../../../../src/core/storage/ConversationFullMessageCache';

function createConversation(
  id: string,
  updatedAt: number,
  messageCount: number,
): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: updatedAt - 1,
    updatedAt,
    openCodeSessionId: `session-${id}`,
    messages: Array.from({ length: messageCount }, (_, index) => ({
      id: `${id}-msg-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message ${index}`,
      timestamp: updatedAt + index,
    })),
  };
}

describe('ConversationFullMessageCache', () => {
  it('returns a metadata-only clone without mutating the original conversation', () => {
    const full = createConversation('one', 10, 2);

    const metadataOnly = cloneConversationMetadataOnly(full);

    expect(metadataOnly).toEqual({
      ...full,
      messages: [],
    });
    expect(full.messages).toHaveLength(2);
  });

  it('keeps pinned conversations with full messages even when over capacity', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 1 });
    const conversations = [
      createConversation('pinned', 30, 2),
      createConversation('old', 10, 2),
    ];
    cache.touch('pinned', 300);
    cache.touch('old', 100);

    const snapshot = cache.trim(conversations, new Set(['pinned']));

    expect(conversations.find((item) => item.id === 'pinned')?.messages).toHaveLength(2);
    expect(conversations.find((item) => item.id === 'old')?.messages).toHaveLength(0);
    expect(snapshot.evictedConversationIds).toEqual(['old']);
    expect(snapshot.pinnedConversationIds).toEqual(['pinned']);
    expect(snapshot.fullConversationIds).toEqual(['pinned']);
  });

  it('evicts least-recently-used unpinned conversations and keeps the newest touches', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 2 });
    const conversations = [
      createConversation('old', 10, 1),
      createConversation('middle', 20, 1),
      createConversation('new', 30, 1),
    ];
    cache.touch('old', 100);
    cache.touch('middle', 200);
    cache.touch('new', 300);

    const snapshot = cache.trim(conversations, new Set());

    expect(conversations.map((conversation) => [
      conversation.id,
      conversation.messages.length,
    ])).toEqual([
      ['old', 0],
      ['middle', 1],
      ['new', 1],
    ]);
    expect(snapshot.evictedConversationIds).toEqual(['old']);
    expect(snapshot.fullConversationIds).toEqual(['middle', 'new']);
  });

  it('forgets deleted conversations from LRU tracking', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 2 });
    cache.touch('gone', 100);
    cache.touch('kept', 200);
    const conversations = [
      createConversation('gone', 10, 1),
      createConversation('kept', 20, 1),
    ];
    cache.trim(conversations, new Set());

    cache.forget('gone');

    expect(cache.getTrackedConversationIds()).toEqual(['kept']);
    expect(cache.isEvicted('gone')).toBe(false);
  });

  it('is idempotent when trimming twice with the same state', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 1 });
    const conversations = [
      createConversation('old', 10, 1),
      createConversation('new', 20, 1),
    ];
    cache.touch('old', 100);
    cache.touch('new', 200);

    const first = cache.trim(conversations, new Set());
    const second = cache.trim(conversations, new Set());

    expect(first.evictedConversationIds).toEqual(['old']);
    expect(second.evictedConversationIds).toEqual([]);
    expect(conversations[0].messages).toHaveLength(0);
    expect(conversations[1].messages).toHaveLength(1);
  });

  it('evicts all unpinned conversations when maxFullConversations is zero', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 0 });
    const conversations = [
      createConversation('a', 10, 1),
      createConversation('b', 20, 1),
    ];
    cache.touch('a', 100);
    cache.touch('b', 200);

    const snapshot = cache.trim(conversations, new Set());

    expect(conversations[0].messages).toHaveLength(0);
    expect(conversations[1].messages).toHaveLength(0);
    expect(snapshot.evictedConversationIds).toEqual(['a', 'b']);
  });

  it('evicts nothing when all conversations are pinned over capacity', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 1 });
    const conversations = [
      createConversation('a', 10, 1),
      createConversation('b', 20, 1),
    ];
    cache.touch('a', 100);
    cache.touch('b', 200);

    const snapshot = cache.trim(conversations, new Set(['a', 'b']));

    expect(conversations[0].messages).toHaveLength(1);
    expect(conversations[1].messages).toHaveLength(1);
    expect(snapshot.evictedConversationIds).toEqual([]);
  });

  it('tracks evicted conversations until they are rehydrated', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 1 });
    const conversations = [
      createConversation('old', 10, 1),
      createConversation('new', 20, 1),
    ];
    cache.touch('old', 100);
    cache.touch('new', 200);

    cache.trim(conversations, new Set());
    expect(cache.isEvicted('old')).toBe(true);

    cache.touch('old', 300);
    expect(cache.isEvicted('old')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing cache-policy test**

Run:

```bash
npm run test -- tests/unit/core/storage/ConversationFullMessageCache.test.ts --runInBand
```

Expected: FAIL with a module resolution error for `ConversationFullMessageCache`.

- [ ] **Step 3: Implement the cache-policy owner**

Create `src/core/storage/ConversationFullMessageCache.ts`:

```typescript
import type { Conversation } from '../types';

export interface ConversationFullMessageCacheOptions {
  readonly maxFullConversations: number;
}

export interface ConversationFullMessageCacheSnapshot {
  readonly fullConversationIds: string[];
  readonly pinnedConversationIds: string[];
  readonly evictedConversationIds: string[];
}

export function cloneConversationMetadataOnly(conversation: Conversation): Conversation {
  return {
    ...conversation,
    messages: [],
  };
}

function hasFullMessages(conversation: Conversation): boolean {
  return conversation.messages.length > 0;
}

export class ConversationFullMessageCache {
  private readonly lastAccessedAtByConversationId = new Map<string, number>();
  private readonly evictedConversationIds = new Set<string>();

  constructor(private readonly options: ConversationFullMessageCacheOptions) {}

  touch(conversationId: string, now = Date.now()): void {
    this.lastAccessedAtByConversationId.set(conversationId, now);
    this.evictedConversationIds.delete(conversationId);
  }

  forget(conversationId: string): void {
    this.lastAccessedAtByConversationId.delete(conversationId);
    this.evictedConversationIds.delete(conversationId);
  }

  getTrackedConversationIds(): string[] {
    return [...this.lastAccessedAtByConversationId.keys()];
  }

  isEvicted(conversationId: string): boolean {
    return this.evictedConversationIds.has(conversationId);
  }

  trim(
    conversations: Conversation[],
    pinnedConversationIds: ReadonlySet<string>,
  ): ConversationFullMessageCacheSnapshot {
    const fullConversationIds = conversations
      .filter(hasFullMessages)
      .map((conversation) => conversation.id);
    const evictable = conversations
      .filter((conversation) => hasFullMessages(conversation))
      .filter((conversation) => !pinnedConversationIds.has(conversation.id))
      .sort((left, right) => {
        const leftTouched = this.lastAccessedAtByConversationId.get(left.id) ?? left.updatedAt;
        const rightTouched = this.lastAccessedAtByConversationId.get(right.id) ?? right.updatedAt;
        return leftTouched - rightTouched;
      });

    const maxUnpinnedFullConversations = Math.max(0, this.options.maxFullConversations);
    const pinnedFullCount = fullConversationIds
      .filter((conversationId) => pinnedConversationIds.has(conversationId))
      .length;
    const allowedUnpinnedCount = Math.max(0, maxUnpinnedFullConversations - pinnedFullCount);
    const evictCount = Math.max(0, evictable.length - allowedUnpinnedCount);
    const evictedConversationIds: string[] = [];

    for (const conversation of evictable.slice(0, evictCount)) {
      const index = conversations.findIndex((item) => item.id === conversation.id);
      if (index === -1) {
        continue;
      }
      conversations[index] = cloneConversationMetadataOnly(conversation);
      this.forget(conversation.id);
      this.evictedConversationIds.add(conversation.id);
      evictedConversationIds.push(conversation.id);
    }

    return {
      fullConversationIds: conversations
        .filter(hasFullMessages)
        .map((conversation) => conversation.id),
      pinnedConversationIds: [...pinnedConversationIds],
      evictedConversationIds,
    };
  }
}
```

- [ ] **Step 4: Run the cache-policy test**

Run:

```bash
npm run test -- tests/unit/core/storage/ConversationFullMessageCache.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Create the cache-policy module doc**

Create `docs/modules/core/storage/ConversationFullMessageCache.md`:

```markdown
# ConversationFullMessageCache

> **源码**: `src/core/storage/ConversationFullMessageCache.ts`
> **状态**: [REVIEW]

## 概述

`ConversationFullMessageCache` 是完整 conversation message 数组的内存保留策略 owner。它不读写磁盘，不知道 Obsidian adapter，也不决定 conversation list 的排序；它只根据 pin 集合与 LRU touch 时间，把 unpinned 的完整 `Conversation.messages` 从内存对象中裁剪为空数组。

## 公开接口

```typescript
class ConversationFullMessageCache {
  touch(conversationId: string, now?: number): void;
  forget(conversationId: string): void;
  getTrackedConversationIds(): string[];
  isEvicted(conversationId: string): boolean;
  trim(
    conversations: Conversation[],
    pinnedConversationIds: ReadonlySet<string>,
  ): ConversationFullMessageCacheSnapshot;
}
```

## 关键行为

- pinned conversations 永远不会被 `trim()` 清空 messages。
- unpinned conversations 按 `touch()` 时间从旧到新驱逐。
- `isEvicted(id)` 只在当前内存生命周期内标记“messages 被 LRU 裁剪过”，用于保存前防止 metadata-only conversation 覆盖磁盘完整消息。
- 驱逐只影响内存对象，完整消息仍保存在 `.opencodian/sessions/{id}.json`。
- 被驱逐 conversation 会保留 id/title/timestamps/openCodeSessionId/sessionSettings/backgroundTaskMetadata 等 metadata 字段。

## 边界

- 本模块不调用 `StorageService.loadFullConversation()`。
- 本模块不调用 `StorageService.saveConversation()`。
- 本模块不访问 `OpenCodianView` 或 tab runtime。
```

- [ ] **Step 6: Commit Task 2**

```bash
git add src/core/storage/ConversationFullMessageCache.ts tests/unit/core/storage/ConversationFullMessageCache.test.ts docs/modules/core/storage/ConversationFullMessageCache.md
git commit -m "refactor: add conversation full-message cache policy"
```

## Task 3: Integrate Full-Message LRU Into Plugin Conversation Cache

**Files:**
- Modify: `src/main.ts`
- Test: `tests/unit/main.test.ts`

- [ ] **Step 1: Write failing plugin cache tests**

Append these tests to `describe('OpenCodianPlugin.getConversationById', () => { ... })` in `tests/unit/main.test.ts`:

```typescript
  it('trims unpinned full-message conversations after loading over the cache limit', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
      trimConversationFullMessageCache: () => void;
    };
    const storedConversations = Array.from({ length: 13 }, (_, index): Conversation => {
      const number = index + 1;
      return {
        id: `conv-${number}`,
        title: `Conversation ${number}`,
        createdAt: number,
        updatedAt: number,
        openCodeSessionId: `session-${number}`,
        messages: [{
          id: `m${number}`,
          role: 'user',
          content: `message ${number}`,
          timestamp: number,
        }],
      };
    });

    plugin.conversations = storedConversations.map((conversation) => ({
      ...conversation,
      messages: [],
    }));
    plugin.storage = {
      loadFullConversation: jest.fn(async (id: string) =>
        storedConversations.find((conversation) => conversation.id === id) ?? null),
    } as Pick<StorageService, 'loadFullConversation'>;
    for (const conversation of storedConversations) {
      await plugin.getConversationById(conversation.id);
    }
    plugin.trimConversationFullMessageCache();

    expect(plugin.conversations.find((item) => item.id === 'conv-1')?.messages).toEqual([]);
    expect(plugin.conversations.find((item) => item.id === 'conv-2')?.messages).toHaveLength(1);
    expect(plugin.conversations.find((item) => item.id === 'conv-13')?.messages).toHaveLength(1);
  });

  it('does not trim pinned full-message conversations', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
      trimConversationFullMessageCache: () => void;
      registerConversationCachePinProvider: (provider: () => Iterable<string>) => void;
    };
    const pinned: Conversation = {
      id: 'conv-pinned',
      title: 'Pinned',
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'session-pinned',
      messages: [{ id: 'p1', role: 'user', content: 'pinned', timestamp: 1 }],
    };

    plugin.conversations = [pinned];
    plugin.storage = {
      loadFullConversation: jest.fn(),
    } as Pick<StorageService, 'loadFullConversation'>;
    plugin.registerConversationCachePinProvider(() => ['conv-pinned']);

    plugin.trimConversationFullMessageCache();

    expect(plugin.conversations[0].messages).toHaveLength(1);
  });

  it('aggregates pinned conversations from multiple views', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      trimConversationFullMessageCache: () => void;
      registerConversationCachePinProvider: (provider: () => Iterable<string>) => void;
      unregisterConversationCachePinProvider: (provider: () => Iterable<string>) => void;
    };
    const conversations: Conversation[] = Array.from({ length: 13 }, (_, index) => {
      const number = index + 1;
      return {
        id: `conv-${number}`,
        title: `Conversation ${number}`,
        createdAt: number,
        updatedAt: number,
        openCodeSessionId: `session-${number}`,
        messages: [{ id: `m${number}`, role: 'user', content: `message ${number}`, timestamp: number }],
      };
    });
    const firstViewProvider = () => ['conv-1'];
    const secondViewProvider = () => ['conv-13'];

    plugin.conversations = conversations;
    plugin.registerConversationCachePinProvider(firstViewProvider);
    plugin.registerConversationCachePinProvider(secondViewProvider);
    plugin.trimConversationFullMessageCache();

    expect(plugin.conversations.find((item) => item.id === 'conv-1')?.messages).toHaveLength(1);
    expect(plugin.conversations.find((item) => item.id === 'conv-13')?.messages).toHaveLength(1);

    plugin.unregisterConversationCachePinProvider(secondViewProvider);
    plugin.trimConversationFullMessageCache();

    expect(plugin.conversations.find((item) => item.id === 'conv-1')?.messages).toHaveLength(1);
  });

  it('rehydrates an evicted conversation when it is requested again', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
      trimConversationFullMessageCache: () => void;
    };
    const stored: Conversation = {
      id: 'conv-evicted',
      title: 'Evicted',
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'session-evicted',
      messages: [{ id: 'm1', role: 'user', content: 'full', timestamp: 1 }],
    };
    plugin.conversations = [{ ...stored, messages: [] }];
    plugin.storage = {
      loadFullConversation: jest.fn().mockResolvedValue(stored),
    } as Pick<StorageService, 'loadFullConversation'>;

    const result = await plugin.getConversationById('conv-evicted');

    expect(result?.messages).toHaveLength(1);
    expect(plugin.conversations[0].messages).toHaveLength(1);
  });

  it('reloads full messages before saving an evicted metadata-only conversation', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation' | 'saveConversation'>;
      conversationFullMessageCache: {
        isEvicted(conversationId: string): boolean;
        touch(conversationId: string): void;
      };
      trimConversationFullMessageCache: () => void;
    };
    const fullConversation: Conversation = {
      id: 'conv-save',
      title: 'Full',
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'session-save',
      messages: [{ id: 'm1', role: 'user', content: 'full', timestamp: 1 }],
    };
    const metadataOnly: Conversation = {
      ...fullConversation,
      title: 'Renamed',
      updatedAt: 2,
      messages: [],
    };
    plugin.conversations = [metadataOnly];
    plugin.storage = {
      loadFullConversation: jest.fn().mockResolvedValue(fullConversation),
      saveConversation: jest.fn().mockResolvedValue(undefined),
    } as Pick<StorageService, 'loadFullConversation' | 'saveConversation'>;
    plugin.conversationFullMessageCache = {
      isEvicted: jest.fn().mockReturnValue(true),
      touch: jest.fn(),
    };
    plugin.trimConversationFullMessageCache = jest.fn();

    await plugin.saveConversation(metadataOnly);

    expect(plugin.storage.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Renamed',
      updatedAt: 2,
      messages: fullConversation.messages,
    }));
  });
```

- [ ] **Step 2: Run the failing plugin cache tests**

Run:

```bash
npm run test -- tests/unit/main.test.ts --runInBand
```

Expected: FAIL because `registerConversationCachePinProvider()`, `unregisterConversationCachePinProvider()`, and `trimConversationFullMessageCache()` do not exist.

- [ ] **Step 3: Import and own the full-message cache in `main.ts`**

In `src/main.ts`, add the import near the existing storage imports:

```typescript
import { ConversationFullMessageCache } from './core/storage/ConversationFullMessageCache';
```

Add this type near the plugin class:

```typescript
type ConversationCachePinProvider = () => Iterable<string>;
```

Add these private fields to `OpenCodianPlugin`:

```typescript
  private readonly conversationFullMessageCache = new ConversationFullMessageCache({
    maxFullConversations: 12,
  });
  private readonly conversationCachePinProviders = new Set<ConversationCachePinProvider>();
```

- [ ] **Step 4: Add pin-provider and trim methods**

Add these public methods after `getConversations()` in `src/main.ts`:

```typescript
  registerConversationCachePinProvider(provider: ConversationCachePinProvider): void {
    this.conversationCachePinProviders.add(provider);
    this.trimConversationFullMessageCache();
  }

  unregisterConversationCachePinProvider(provider: ConversationCachePinProvider): void {
    this.conversationCachePinProviders.delete(provider);
    this.trimConversationFullMessageCache();
  }

  trimConversationFullMessageCache(): void {
    const pinnedConversationIds = this.getConversationCachePinnedIds();
    const snapshot = this.conversationFullMessageCache.trim(
      this.conversations,
      pinnedConversationIds,
    );
    if (snapshot.evictedConversationIds.length > 0) {
      logger.debug('Trimmed full conversation messages from memory cache', {
        evictedConversationIds: snapshot.evictedConversationIds,
        pinnedConversationIds: snapshot.pinnedConversationIds,
        fullConversationIds: snapshot.fullConversationIds,
      });
    }
  }

  private getConversationCachePinnedIds(): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const provider of this.conversationCachePinProviders) {
      for (const id of provider()) {
        if (typeof id === 'string' && id.length > 0) {
          ids.add(id);
        }
      }
    }
    return ids;
  }
```

- [ ] **Step 5: Touch and trim around create/load/save/delete**

In `createConversation()`, after `this.conversations.unshift(conversation);`, add:

```typescript
    this.conversationFullMessageCache.touch(conversation.id);
```

In `createConversationFromSession()`, after `this.conversations.unshift(conversation);`, add:

```typescript
    this.conversationFullMessageCache.touch(conversation.id);
```

Replace `saveConversation()` with this guarded version so an evicted metadata-only object cannot overwrite the durable full-message file:

```typescript
  async saveConversation(conversation: Conversation): Promise<void> {
    const index = this.conversations.findIndex((item) => item.id === conversation.id);
    let nextConversation = conversation;

    if (
      index !== -1
      && conversation.messages.length === 0
      && this.conversationFullMessageCache.isEvicted(conversation.id)
    ) {
      const fullConversation = await this.storage.loadFullConversation(conversation.id);
      if (fullConversation && fullConversation.messages.length > 0) {
        nextConversation = {
          ...fullConversation,
          title: conversation.title,
          updatedAt: conversation.updatedAt,
          lastResponseAt: conversation.lastResponseAt,
          titleGenerationStatus: conversation.titleGenerationStatus,
          currentNote: conversation.currentNote,
          externalContextPaths: conversation.externalContextPaths,
          sessionSettings: conversation.sessionSettings,
          backgroundTaskMetadata: conversation.backgroundTaskMetadata,
        };
      }
    }

    if (index === -1) {
      this.conversations.unshift(nextConversation);
    } else {
      this.conversations[index] = nextConversation;
    }

    this.conversationFullMessageCache.touch(nextConversation.id);
    this.trimConversationFullMessageCache();
    await this.storage.saveConversation(nextConversation);
  }
```

In `getConversationById()`, after replacing the cached conversation with `fullConversation`, add:

```typescript
      this.conversationFullMessageCache.touch(fullConversation.id);
      this.trimConversationFullMessageCache();
```

In `deleteConversation()`, after `this.conversations.splice(index, 1);`, add:

```typescript
    this.conversationFullMessageCache.forget(id);
```

- [ ] **Step 6: Run the plugin cache tests**

Run:

```bash
npm run test -- tests/unit/main.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/main.ts tests/unit/main.test.ts
git commit -m "refactor: bound full conversation message cache"
```

## Task 4: Pin Open-Tab Conversations From The Chat View

**Files:**
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
- Test: `tests/unit/main.test.ts`

- [ ] **Step 1: Add a tab-runtime host seam for cache trimming**

In `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`, extend `ConversationTabRuntimeCoordinatorHost`:

```typescript
  trimConversationFullMessageCache(): void;
```

Extend `TabRuntimePluginSource`:

```typescript
  trimConversationFullMessageCache(): void;
```

In `createConversationTabRuntimeCoordinatorHost()`, add this host member after `savePersistedTabState`:

```typescript
    trimConversationFullMessageCache: () => {
      plugin.trimConversationFullMessageCache();
    },
```

- [ ] **Step 2: Add an open-tab pin helper**

In `src/features/chat/OpenCodianView.ts`, add this stable provider field and helper near the other private view state helpers:

```typescript
  private readonly conversationCachePinProvider = (): Iterable<string> =>
    this.getPinnedConversationIdsForFullMessageCache();

  private getPinnedConversationIdsForFullMessageCache(): ReadonlySet<string> {
    const ids = new Set<string>();
    if (this.currentConversation?.id) {
      ids.add(this.currentConversation.id);
    }

    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      if (tab.conversationId) {
        ids.add(tab.conversationId);
      }
    }

    return ids;
  }
```

- [ ] **Step 3: Register and clear the pin provider with view lifecycle**

In `onOpen()`, after `await measureStep('initializeFirstTab', () => this.initializeFirstTab());`, add:

```typescript
    this.plugin.registerConversationCachePinProvider(this.conversationCachePinProvider);
```

In `onClose()`, before `this.persistTabState({ flush: true });`, add:

```typescript
    this.plugin.unregisterConversationCachePinProvider(this.conversationCachePinProvider);
```

- [ ] **Step 4: Ensure tab changes can trigger trimming**

In `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`, replace the `onChanged` callback inside `createTabManager()`:

```typescript
      onChanged: () => {
        this.renderTabBar();
        this.persistTabState();
      },
```

with:

```typescript
      onChanged: () => {
        this.renderTabBar();
        this.persistTabState();
        this.host.trimConversationFullMessageCache();
      },
```

- [ ] **Step 5: Run view-adjacent tests**

Run:

```bash
npm run test -- tests/unit/main.test.ts tests/unit/features/chat/tabs/TabManager.test.ts tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/features/chat/OpenCodianView.ts src/features/chat/services/ConversationTabRuntimeCoordinator.ts tests/unit/main.test.ts
git commit -m "refactor: pin open tab conversations in message cache"
```

## Task 5: Documentation, Graph, And Verification

**Files:**
- Modify: `docs/modules/core/storage/StorageService.md`
- Modify: `docs/modules/features/chat/OpenCodianView.md`
- Modify: `docs/status/session-lifecycle-council-review-2026-05-10.md`
- Generated: `graphify-out/**`

- [ ] **Step 1: Update `StorageService` module docs**

In `docs/modules/core/storage/StorageService.md`, after the paragraph ending with `backgroundTaskMetadata` under `### 会话持久化`, add:

```markdown
完整消息的磁盘真值仍是 `sessions/{id}.json`。内存层现在可以通过 `ConversationFullMessageCache` 把未 pin 的 `Conversation.messages` 裁剪为空数组；下一次打开该 conversation 时会再走 `loadFullConversation(id)` 从磁盘恢复完整消息。
```

Under `### 会话列表与删除`, add:

```markdown
删除 conversation 时，插件层还会同步调用 `ConversationFullMessageCache.forget(id)` 与 `OpenCodeService.deleteSession()`；后者会在服务端删除尝试结束后清理本地 canonical session graph。
```

- [ ] **Step 2: Update `OpenCodianView` module docs**

In `docs/modules/features/chat/OpenCodianView.md`, add this paragraph near the tab-system section:

```markdown
聊天视图在 `onOpen()` 注册 conversation full-message cache pin provider，并在 `onClose()` 清除它。第一版 pin 策略保守地保留所有打开 tab 对应 conversation 的完整 messages，因此 active、restored、streaming、syncing、finalizing 与 background-task tab 都不会被内存 LRU 裁剪；历史列表中未打开的旧 conversation 可以只保留 metadata，按需再从 storage hydrate。
```

- [ ] **Step 3: Link the Council review to this Tier 2 plan**

In `docs/status/session-lifecycle-council-review-2026-05-10.md`, update the existing Tier 1 implementation-plan section so it includes both plans:

```markdown
本审查的 Tier 1 收敛已落到实施计划：`docs/superpowers/plans/2026-05-10-session-lifecycle-tier1-convergence.md`。

Tier 2 扩展性收敛计划：`docs/superpowers/plans/2026-05-10-session-lifecycle-tier2-cache-eviction.md`。
```

- [ ] **Step 4: Refresh graphify after source changes**

Run:

```bash
npm run graphify:update:src
```

Expected: command exits 0 and updates committed root `graphify-out/` artifacts.

- [ ] **Step 5: Run docs and graph gates**

Run:

```bash
npm run check:module-docs
```

Expected: PASS.

Run:

```bash
npm run check:graphify
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS with lint reporting `0 errors / 0 warnings`.

- [ ] **Step 7: Deploy to Test Vault and verify BUILD_ID**

Since `main.ts` is a deploy-relevant file, after `npm run verify` passes, copy the build artifacts to the Test Vault:

```bash
cp dist/main.js "/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/"
cp dist/manifest.json "/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/"
cp dist/styles.css "/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/"
```

Then verify the Test Vault `main.js` contains the newest `BUILD_ID` from the build.

```bash
BUILD_ID=$(node -e "const fs=require('fs'); const text=fs.readFileSync('dist/main.js','utf8'); const match=text.match(/BUILD_ID\\s*=\\s*\"([^\"]+)\"/); console.log(match ? match[1] : '')")
rg -F "$BUILD_ID" "/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js"
```

Expected: `rg` prints one or more matches for the same non-empty `BUILD_ID`.

- [ ] **Step 8: Commit Task 5**

```bash
git add docs/modules/core/storage/StorageService.md docs/modules/features/chat/OpenCodianView.md docs/status/session-lifecycle-council-review-2026-05-10.md graphify-out
git commit -m "docs: record session lifecycle cache eviction"
```

## Council Review Feedback

This plan was reviewed by Council (4/4 models). The following adjustments were made based on review feedback:

| Issue | Severity | Adjustment |
|-------|----------|------------|
| **Multi-view pin provider overwrite** | Medium | Changed from single `conversationCachePinProvider` callback to `Set<ConversationCachePinProvider>` to support multiple OpenCodian views (Obsidian multi-leaf) |
| **Saving evicted conversations** | Medium | Added guard in `saveConversation()` to reload full messages from storage before saving if the cached copy was evicted |
| **`messages: []` ambiguity** | Low | Added `ConversationFullMessageCache.isEvicted(id)` as an explicit in-memory marker so save guards do not rely on `messages.length` alone |
| **Missing boundary tests** | Low | Added tests: idempotent double-trim, `maxFullConversations: 0`, all-pinned-over-capacity, rehydration, multi-view provider aggregation, and evicted-save guard |
| **Test Vault deployment** | Low | Added Step 7 to Task 5: copy to Test Vault and verify `BUILD_ID` after `npm run verify` passes |

### Unresolved Discussion

- **Tab switch thrashing**: `TabManager.onChanged` triggers trim on every tab switch/close/create. Council suggested debouncing, but the plan keeps immediate trimming for simplicity in the first iteration. If performance issues arise, add debounce in a follow-up.
- **Persistent evicted marker**: The plan uses an in-memory `isEvicted(id)` marker rather than adding `messagesEvicted` to the persisted `Conversation` schema. If future code needs this distinction across plugin reloads, add a persisted flag in a separate migration.

## Self-Review

Spec coverage:

- Council Tier 2 LRU/full-message cache maps to Tasks 2, 3, and 4.
- Council canonical session eviction maps to Task 1.
- Documentation, module-doc, graphify, and verify gates map to Task 5.
- Tier 3 canonical-only runtime reads are intentionally excluded and named in the scope check.

Placeholder scan:

- The plan uses concrete paths, concrete code blocks, concrete test names, and concrete commands.
- The implementation snippets define every new public method before another task uses it.
- No step relies on unspecified validation or unspecified tests.

Type consistency:

- `ConversationFullMessageCache`, `ConversationFullMessageCacheOptions`, and `ConversationFullMessageCacheSnapshot` are introduced in Task 2 before use in Task 3.
- `ConversationCachePinProvider`, `registerConversationCachePinProvider()`, `unregisterConversationCachePinProvider()`, and `trimConversationFullMessageCache()` are introduced in Task 3 before `OpenCodianView` calls them in Task 4.
- `deleteSession()`, `deleteSessions()`, `getSessionIds()`, and `getSessionCount()` all use `sessionID` / `sessionId` names consistently with nearby OpenCode code.
