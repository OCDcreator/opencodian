/**
 * Unit tests for the CodexAppServerClientNormalization paginated page
 * normalizers (thread/turns/list and thread/items/list → preview pages).
 */

import { describe, expect, it } from '@jest/globals';

import {
  normalizeThreadItemsPageToPreviewMessages,
  normalizeTurnsPageToPreviewMessages,
} from '../../../../../src/core/agents/backend/CodexAppServerClientNormalization';
import type {
  AppServerItem,
  AppServerThreadItemEntry,
  AppServerThreadItemsPage,
  AppServerThreadTurnsPage,
  AppServerTurn,
} from '../../../../../src/core/agents/backend/CodexAppServerClientTypes';

function makeTurn(id: string, items: AppServerItem[]): AppServerTurn {
  return { id, items };
}

function makeItemEntry(item: AppServerItem, turnId = 'turn-1'): AppServerThreadItemEntry {
  return { item, turnId };
}

describe('normalizeTurnsPageToPreviewMessages', () => {
  it('normalizes a summary-view turns page into messages plus cursors', () => {
    const page: AppServerThreadTurnsPage = {
      data: [
        makeTurn('turn-1', [
          { type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'hello codex' }] },
          { type: 'agentMessage', id: 'a1', text: 'hi there' },
          { type: 'reasoning', id: 'r1' },
        ]),
        makeTurn('turn-2', [
          { type: 'mcpToolCall', id: 't1', server: 'fs', tool: 'read', arguments: {} },
          { type: 'agentMessage', id: 'a2', text: 'done' },
        ]),
      ],
      nextCursor: 'cursor-2',
      backwardsCursor: null,
    };

    const result = normalizeTurnsPageToPreviewMessages(page);

    expect(result.messages).toEqual([
      { role: 'user', parts: [{ type: 'text', text: 'hello codex' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'hi there' }] },
      { role: 'activity', parts: [{ type: 'tool_call', text: 'fs/read' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'done' }] },
    ]);
    expect(result.nextCursor).toBe('cursor-2');
    expect(result.backwardsCursor).toBeNull();
  });

  it('matches the flat normalizeTurnsToPreviewMessages output shape exactly', async () => {
    const { normalizeTurnsToPreviewMessages } = await import('../../../../../src/core/agents/backend/CodexAppServerClientNormalization');
    const turns = [
      makeTurn('turn-1', [
        { type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'q' }] },
        { type: 'fileChange', id: 'f1', changes: [{ path: 'a.ts', kind: 'edit' }] },
        { type: 'webSearch', id: 'w1', query: 'docs' },
      ]),
    ];
    const page: AppServerThreadTurnsPage = { data: turns, nextCursor: null, backwardsCursor: 'back' };

    const flat = normalizeTurnsToPreviewMessages(turns);
    const paged = normalizeTurnsPageToPreviewMessages(page);

    expect(paged.messages).toEqual(flat);
    expect(paged.nextCursor).toBeNull();
    expect(paged.backwardsCursor).toBe('back');
  });

  it('normalizes missing cursors to null and keeps empty pages empty', () => {
    const page = {
      data: [],
      nextCursor: undefined,
      backwardsCursor: undefined,
    } as unknown as AppServerThreadTurnsPage;

    const result = normalizeTurnsPageToPreviewMessages(page);

    expect(result.messages).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.backwardsCursor).toBeNull();
  });
});

describe('normalizeThreadItemsPageToPreviewMessages', () => {
  it('normalizes item entries through the same extraction as turn-embedded items', () => {
    const page: AppServerThreadItemsPage = {
      data: [
        makeItemEntry({ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'expand me' }] }),
        makeItemEntry({ type: 'agentMessage', id: 'a1', text: 'full reply text' }),
        makeItemEntry({ type: 'contextCompaction', id: 'c1' }),
        makeItemEntry({ type: 'mcpToolCall', id: 't1', server: 'srv', tool: 'grep', arguments: {} }, 'turn-9'),
      ],
      nextCursor: 'items-cursor-2',
      backwardsCursor: null,
    };

    const result = normalizeThreadItemsPageToPreviewMessages(page);

    expect(result.messages).toEqual([
      { role: 'user', parts: [{ type: 'text', text: 'expand me' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'full reply text' }] },
      { role: 'activity', parts: [{ type: 'tool_call', text: 'srv/grep' }] },
    ]);
    expect(result.nextCursor).toBe('items-cursor-2');
    expect(result.backwardsCursor).toBeNull();
  });

  it('returns an empty message list for an empty page', () => {
    const page: AppServerThreadItemsPage = { data: [], nextCursor: null, backwardsCursor: null };

    const result = normalizeThreadItemsPageToPreviewMessages(page);

    expect(result.messages).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});
