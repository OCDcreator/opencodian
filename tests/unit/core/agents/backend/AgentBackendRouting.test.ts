/* eslint-disable max-lines -- AgentBackendRouting tests keep the shared backend-aware seam matrix in one file so routing behaviors stay reviewable together. */
import { describe, expect, it } from '@jest/globals';

import { AgentCapability, OPENCODE_FULL_CAPABILITIES } from '../../../../../src/core/agents/AgentCapability';
import {
  getActiveSessionHistoryService,
  getBackendSessionPreview,
  getConversationSessionBackendService,
  getConversationSessionHistoryService,
  hasSessionCreationCapability,
  listBackendSessions,
  loadBackendSessionMessages,
  readBackendSessionShareUrl,
  readBackendSessionTitle,
} from '../../../../../src/core/agents/backend/AgentBackendRouting';
import type {
  AgentService,
  AgentSessionCapability,
} from '../../../../../src/core/agents/backend/AgentService';
import type { AgentBackendKind } from '../../../../../src/core/types/chat';

// ---------------------------------------------------------------------------
// Mock adapters
// ---------------------------------------------------------------------------

function createMockSessionAdapter(
  kind: AgentBackendKind,
  caps = OPENCODE_FULL_CAPABILITIES,
  extra?: Partial<AgentSessionCapability>,
): AgentService & AgentSessionCapability {
  return {
    kind,
    displayName: `Mock ${kind}`,
    description: `Mock ${kind} adapter`,
    capabilities: caps,
    status: 'connected' as const,
    hasCapability(cap: AgentCapability) { return caps.has(cap); },
    start: async () => {},
    stop: async () => {},
    dispose() {},
    onStatusChange() { return { dispose() {} }; },
    createSession: async () => 'mock-session',
    deleteSession: async () => {},
    updateSessionTitle: async () => {},
    ...extra,
  } as unknown as AgentService & AgentSessionCapability;
}

function createMockRegistry(adapters: Map<AgentBackendKind, AgentService>) {
  return {
    get(kind: AgentBackendKind) { return adapters.get(kind); },
    getActive() {
      const first = adapters.values().next();
      return first.done ? undefined : first.value;
    },
  } as { get: (kind: AgentBackendKind) => AgentService | undefined; getActive: () => AgentService | undefined };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getConversationSessionBackendService', () => {
    it('returns session-capable adapter for opencode conversation', () => {
      const adapter = createMockSessionAdapter('opencode');
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = getConversationSessionBackendService(registry, { backend: 'opencode' });
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('opencode');
    });

    it('returns null when registry is null', () => {
      const result = getConversationSessionBackendService(null, { backend: 'opencode' });
      expect(result).toBeNull();
    });

    it('defaults to opencode when conversation has no backend', () => {
      const adapter = createMockSessionAdapter('opencode');
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = getConversationSessionBackendService(registry, {});
      expect(result).not.toBeNull();
    });

    it('returns declared session adapter even when it only supports read seams', () => {
      const malformedSessionAdapter = createMockSessionAdapter('claude-code', new Set([
        AgentCapability.Sessions,
      ]), {
        createSession: undefined,
      } as unknown as Partial<AgentSessionCapability>);
      const registry = createMockRegistry(new Map([['claude-code', malformedSessionAdapter]]));

      const result = getConversationSessionBackendService(registry, { backend: 'claude-code' });

      expect(result).toBe(malformedSessionAdapter);
    });
  });

describe('hasSessionCreationCapability', () => {
    it('rejects adapter that declares sessions but lacks createSession', () => {
      const malformedSessionAdapter = createMockSessionAdapter('claude-code', new Set([
        AgentCapability.Sessions,
      ]), {
        createSession: undefined,
        getSession: async () => ({ id: 'session-1', summary: 'read-only session' }),
        listSessions: async () => [],
        getSessionMessages: async () => [],
      } as unknown as Partial<AgentSessionCapability>);

      expect(hasSessionCreationCapability(malformedSessionAdapter)).toBe(false);
    });

    it('accepts adapter that declares sessions and can create sessions', () => {
      const adapter = createMockSessionAdapter('claude-code', new Set([
        AgentCapability.Sessions,
      ]));

      expect(hasSessionCreationCapability(adapter)).toBe(true);
    });
  });

describe('getConversationSessionHistoryService', () => {
    it('returns null when adapter lacks getSessionMessages', () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        // No getSessionMessages
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = getConversationSessionHistoryService(registry, { backend: 'opencode' });
      expect(result).toBeNull();
    });

    it('returns history service when adapter has getSessionMessages', () => {
      const mockMessages = [{ id: 'msg-1', role: 'user' }];
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSessionMessages: async () => mockMessages,
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = getConversationSessionHistoryService(registry, { backend: 'opencode' });
      expect(result).not.toBeNull();
      expect(typeof result!.getSessionMessages).toBe('function');
    });

    it('returns null for conversation without session backend', () => {
      const registry = createMockRegistry(new Map());
      const result = getConversationSessionHistoryService(registry, { backend: 'opencode' });
      expect(result).toBeNull();
    });

    it('returns null when registry is null', () => {
      const result = getConversationSessionHistoryService(null, { backend: 'opencode' });
      expect(result).toBeNull();
    });

    it('works for claude-code backend with session history', async () => {
      const claudeMessages = [{ type: 'user', content: 'hello' }];
      const adapter = createMockSessionAdapter('claude-code', new Set([
        AgentCapability.Chat,
        AgentCapability.Sessions,
        AgentCapability.Fork,
      ]), {
        getSessionMessages: async () => claudeMessages,
      });
      const registry = createMockRegistry(new Map([['claude-code', adapter]]));
      const result = getConversationSessionHistoryService(registry, { backend: 'claude-code' });
      expect(result).not.toBeNull();
      const messages = await result!.getSessionMessages('session-1');
      expect(messages).toEqual(claudeMessages);
    });
  });

describe('getActiveSessionHistoryService', () => {
    it('returns null when registry is null', () => {
      const result = getActiveSessionHistoryService(null);
      expect(result).toBeNull();
    });

    it('returns null when active adapter lacks getSessionMessages', () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        // No getSessionMessages
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = getActiveSessionHistoryService(registry);
      expect(result).toBeNull();
    });

    it('returns history service when active adapter has getSessionMessages', async () => {
      const mockMessages = [{ id: 'msg-1', role: 'user' }];
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSessionMessages: async () => mockMessages,
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = getActiveSessionHistoryService(registry);
      expect(result).not.toBeNull();
      expect(typeof result!.getSessionMessages).toBe('function');
      const messages = await result!.getSessionMessages('session-1');
      expect(messages).toEqual(mockMessages);
    });

    it('returns null when no active backend exists', () => {
      const registry = createMockRegistry(new Map());
      const result = getActiveSessionHistoryService(registry);
      expect(result).toBeNull();
    });
  });

describe('loadBackendSessionMessages', () => {
    it('returns empty array when sessionId is null', async () => {
      const result = await loadBackendSessionMessages(null, null, null);
      expect(result).toEqual([]);
    });

    it('returns empty array when no history service is available', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES);
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await loadBackendSessionMessages(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toEqual([]);
    });

    it('normalizes OpenCode messages with info/parts shape', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSessionMessages: async () => [
          { info: { id: 'msg-1', role: 'user', time: { created: 1000 } }, parts: [{ type: 'text' }] },
          { info: { id: 'msg-2', role: 'assistant', time: { created: 2000 } }, parts: [] },
        ],
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await loadBackendSessionMessages(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'msg-1',
        role: 'user',
        createdAt: 1000,
        payload: expect.stringContaining('"id": "msg-1"'),
      });
    });

    it('normalizes Claude messages with generic fallback', async () => {
      const adapter = createMockSessionAdapter('claude-code', new Set([
        AgentCapability.Chat,
        AgentCapability.Sessions,
        AgentCapability.Fork,
      ]), {
        getSessionMessages: async () => [
          { id: 'claude-msg-1', role: 'user', content: 'hello', created_at: 3000 },
          { type: 'assistant', content: 'hi' },
        ],
      });
      const registry = createMockRegistry(new Map([['claude-code', adapter]]));
      const result = await loadBackendSessionMessages(registry, { backend: 'claude-code' }, 'ses-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('claude-msg-1');
      expect(result[0].role).toBe('user');
      expect(result[0].createdAt).toBe(3000);
      expect(result[1].id).toBe('msg-1'); // fallback index
      expect(result[1].role).toBe('assistant');
    });

    it('propagates error when getSessionMessages throws', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSessionMessages: async () => { throw new Error('backend error'); },
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      await expect(
        loadBackendSessionMessages(registry, { backend: 'opencode' }, 'ses-1'),
      ).rejects.toThrow('backend error');
    });

    it('returns empty array when getSessionMessages returns a non-array for OpenCode', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSessionMessages: async () => ({ messages: [] }) as unknown as Array<unknown>,
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await loadBackendSessionMessages(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toEqual([]);
    });

    it('returns empty array when getSessionMessages returns a non-array for Claude', async () => {
      const adapter = createMockSessionAdapter('claude-code', new Set([
        AgentCapability.Chat,
        AgentCapability.Sessions,
        AgentCapability.Fork,
      ]), {
        getSessionMessages: async () => ({ items: [] }) as unknown as Array<unknown>,
      });
      const registry = createMockRegistry(new Map([['claude-code', adapter]]));
      const result = await loadBackendSessionMessages(registry, { backend: 'claude-code' }, 'ses-1');
      expect(result).toEqual([]);
    });

    it('skips null items in the OpenCode messages array without crashing', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSessionMessages: async () => [
          { info: { id: 'msg-1', role: 'user', time: { created: 1000 } }, parts: [] },
          null,
          { info: { id: 'msg-2', role: 'assistant', time: {} }, parts: [] },
        ] as unknown as Array<unknown>,
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await loadBackendSessionMessages(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg-1');
      expect(result[1].id).toBe('msg-2');
    });

    it('skips null items in the Claude messages array without crashing', async () => {
      const adapter = createMockSessionAdapter('claude-code', new Set([
        AgentCapability.Chat,
        AgentCapability.Sessions,
        AgentCapability.Fork,
      ]), {
        getSessionMessages: async () => [
          { id: 'claude-msg-1', role: 'user', created_at: 3000 },
          null,
          { id: 'claude-msg-2', role: 'assistant' },
        ] as unknown as Array<unknown>,
      });
      const registry = createMockRegistry(new Map([['claude-code', adapter]]));
      const result = await loadBackendSessionMessages(registry, { backend: 'claude-code' }, 'ses-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('claude-msg-1');
      expect(result[1].id).toBe('claude-msg-2');
    });
  });

describe('readBackendSessionTitle', () => {
    it('returns null when sessionId is null', async () => {
      const result = await readBackendSessionTitle(null, null, null);
      expect(result).toBeNull();
    });

    it('returns null when registry is null', async () => {
      const result = await readBackendSessionTitle(null, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns null when adapter lacks getSession', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES);
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionTitle(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns OpenCode title from .title field', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => ({ id: 'ses-1', title: 'My OpenCode Session' }),
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionTitle(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBe('My OpenCode Session');
    });

    it('returns Claude title from .summary field', async () => {
      const adapter = createMockSessionAdapter('claude-code', new Set([
        AgentCapability.Chat,
        AgentCapability.Sessions,
        AgentCapability.Fork,
      ]), {
        getSession: async () => ({ sessionId: 'ses-1', summary: 'Claude Chat Topic' }),
      });
      const registry = createMockRegistry(new Map([['claude-code', adapter]]));
      const result = await readBackendSessionTitle(registry, { backend: 'claude-code' }, 'ses-1');
      expect(result).toBe('Claude Chat Topic');
    });

    it('returns null when session is not found', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => null,
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionTitle(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns null when title is empty string', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => ({ id: 'ses-1', title: '   ' }),
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionTitle(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns trimmed title', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => ({ id: 'ses-1', title: '  Hello World  ' }),
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionTitle(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBe('Hello World');
    });

    it('returns null for backends without an explicit title mapping', async () => {
      const adapter = createMockSessionAdapter('codex', new Set([
        AgentCapability.Chat,
        AgentCapability.Sessions,
      ]), {
        getSession: async () => ({ id: 'ses-1', title: 'Codex Session' }),
      });
      const registry = createMockRegistry(new Map([['codex', adapter]]));
      const result = await readBackendSessionTitle(registry, { backend: 'codex' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns null when getSession throws an error', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => { throw new Error('network failure'); },
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionTitle(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });
});

describe('readBackendSessionShareUrl', () => {
    it('returns null when sessionId is null', async () => {
      const result = await readBackendSessionShareUrl(null, null, null);
      expect(result).toBeNull();
    });

    it('returns null when registry is null', async () => {
      const result = await readBackendSessionShareUrl(null, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns null when adapter lacks getSession', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES);
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionShareUrl(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns OpenCode share URL from session.share.url', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => ({
          id: 'ses-1',
          title: 'My Session',
          share: { url: 'https://opencode.ai/s/ses-1' },
        }),
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionShareUrl(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBe('https://opencode.ai/s/ses-1');
    });

    it('returns null when OpenCode session has no share object', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => ({ id: 'ses-1', title: 'My Session' }),
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionShareUrl(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns null when share.url is empty string', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => ({
          id: 'ses-1',
          share: { url: '   ' },
        }),
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionShareUrl(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns null when session is not found', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => null,
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionShareUrl(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns null for Claude Code backend (no share URL concept)', async () => {
      const adapter = createMockSessionAdapter('claude-code', new Set([
        AgentCapability.Chat,
        AgentCapability.Sessions,
        AgentCapability.Fork,
      ]), {
        getSession: async () => ({ sessionId: 'ses-1', summary: 'Claude Chat' }),
      });
      const registry = createMockRegistry(new Map([['claude-code', adapter]]));
      const result = await readBackendSessionShareUrl(registry, { backend: 'claude-code' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns null for unmapped backend kind', async () => {
      const adapter = createMockSessionAdapter('codex', new Set([
        AgentCapability.Chat,
        AgentCapability.Sessions,
      ]), {
        getSession: async () => ({ id: 'ses-1', share: { url: 'https://example.com/s/ses-1' } }),
      });
      const registry = createMockRegistry(new Map([['codex', adapter]]));
      const result = await readBackendSessionShareUrl(registry, { backend: 'codex' }, 'ses-1');
      expect(result).toBeNull();
    });

    it('returns null when getSession throws an error', async () => {
      const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
        getSession: async () => { throw new Error('network failure'); },
      });
      const registry = createMockRegistry(new Map([['opencode', adapter]]));
      const result = await readBackendSessionShareUrl(registry, { backend: 'opencode' }, 'ses-1');
      expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// listBackendSessions
// ---------------------------------------------------------------------------

describe('listBackendSessions', () => {
  it('returns empty array when registry is null', async () => {
    const result = await listBackendSessions(null);
    expect(result).toEqual([]);
  });

  it('returns empty array when active adapter lacks listSessions', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      // No listSessions
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await listBackendSessions(registry);
    expect(result).toEqual([]);
  });

  it('returns empty array when no active backend exists', async () => {
    const registry = createMockRegistry(new Map());
    const result = await listBackendSessions(registry);
    expect(result).toEqual([]);
  });

  it('normalizes OpenCode sessions with id/title/share/time shape', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      listSessions: async () => [
        { id: 'ses-1', title: 'Research', share: { url: 'https://opencode.ai/s/ses-1' }, time: { created: 100, updated: 200 } },
        { id: 'ses-2', title: 'Draft', time: { created: 300 } },
      ],
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await listBackendSessions(registry);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'ses-1',
      title: 'Research',
      shareUrl: 'https://opencode.ai/s/ses-1',
      updatedAt: 200,
    });
    expect(result[1]).toEqual({
      id: 'ses-2',
      title: 'Draft',
      shareUrl: null,
      updatedAt: null,
    });
  });

  it('normalizes Claude sessions with id/summary generic shape', async () => {
    const adapter = createMockSessionAdapter('claude-code', new Set([
      AgentCapability.Chat,
      AgentCapability.Sessions,
      AgentCapability.Fork,
    ]), {
      listSessions: async () => [
        { sessionId: 'claude-1', summary: 'Claude Topic', share: { url: 'https://claude.example/s/claude-1' }, updatedAt: 500 },
        { id: 'claude-2', title: 'Claude Title', share: { url: 'https://claude.example/s/claude-2' } },
      ],
    });
    const registry = createMockRegistry(new Map([['claude-code', adapter]]));
    const result = await listBackendSessions(registry);
    expect(result).toHaveLength(2);
    // First: sessionId field as id, summary as title, no share URL
    expect(result[0]).toEqual({
      id: 'claude-1',
      title: 'Claude Topic',
      shareUrl: null,
      updatedAt: 500,
    });
    // Second: id field, title field, no share URL
    expect(result[1]).toEqual({
      id: 'claude-2',
      title: 'Claude Title',
      shareUrl: null,
      updatedAt: null,
    });
  });

  it('normalizes generic backend sessions without treating share.url as an OpenCode share link', async () => {
    const adapter = createMockSessionAdapter('codex', new Set([
      AgentCapability.Chat,
      AgentCapability.Sessions,
    ]), {
      listSessions: async () => [
        { id: 'codex-1', title: 'Codex Topic', share: { url: 'https://codex.example/s/codex-1' }, updatedAt: 700 },
      ],
    });
    const registry = createMockRegistry(new Map([['codex', adapter]]));
    const result = await listBackendSessions(registry);

    expect(result).toEqual([
      {
        id: 'codex-1',
        title: 'Codex Topic',
        shareUrl: null,
        updatedAt: 700,
      },
    ]);
  });

  it('falls back gracefully for records missing most fields', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      listSessions: async () => [
        { id: 'ses-minimal' },
        { title: 'No ID session' },
      ],
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await listBackendSessions(registry);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('ses-minimal');
    expect(result[0].title).toBe('');
    expect(result[1].id).toMatch(/^session-/); // generated fallback
  });

  it('returns empty array when listSessions returns a non-array', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      listSessions: async () => ({ sessions: [] }) as unknown as Array<unknown>,
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await listBackendSessions(registry);
    expect(result).toEqual([]);
  });

  it('skips null items in the sessions array without crashing', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      listSessions: async () => [
        { id: 'ses-1', title: 'Valid' },
        null,
        { id: 'ses-2', title: 'Also Valid' },
      ] as unknown as Array<unknown>,
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await listBackendSessions(registry);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('ses-1');
    expect(result[1].id).toBe('ses-2');
  });

  it('returns empty array when listSessions throws an error', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      listSessions: async () => { throw new Error('backend failure'); },
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await listBackendSessions(registry);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getBackendSessionPreview
// ---------------------------------------------------------------------------

describe('getBackendSessionPreview', () => {
  it('returns null when registry is null', async () => {
    const result = await getBackendSessionPreview(null, 'ses-1');
    expect(result).toBeNull();
  });

  it('returns null when active adapter lacks getSessionMessages', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      // No getSessionMessages
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toBeNull();
  });

  it('returns empty array when the active backend has no preview messages', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      getSessionMessages: async () => [],
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toEqual([]);
  });

  it('normalizes OpenCode messages with info/parts shape into preview entries', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      getSessionMessages: async () => [
        {
          info: { id: 'm1', role: 'user' },
          parts: [
            { type: 'text', text: 'hello' },
          ],
        },
        {
          info: { id: 'm2', role: 'assistant' },
          parts: [
            { type: 'tool', text: 'tool output' },
            { type: 'text', text: 'reply' },
          ],
        },
      ],
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: 'user',
      parts: [{ type: 'text', text: 'hello' }],
    });
    expect(result[1]).toEqual({
      role: 'assistant',
      parts: [
        { type: 'tool', text: 'tool output' },
        { type: 'text', text: 'reply' },
      ],
    });
  });

  it('normalizes Claude messages with generic role/content shape', async () => {
    const adapter = createMockSessionAdapter('claude-code', new Set([
      AgentCapability.Chat,
      AgentCapability.Sessions,
      AgentCapability.Fork,
    ]), {
      getSessionMessages: async () => [
        { id: 'cm1', role: 'user', content: 'hello claude' },
        { type: 'assistant', content: [{ type: 'text', text: 'hi there' }] },
      ],
    });
    const registry = createMockRegistry(new Map([['claude-code', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: 'user',
      parts: [{ type: 'text', text: 'hello claude' }],
    });
    expect(result[1]).toEqual({
      role: 'assistant',
      parts: [{ type: 'text', text: 'hi there' }],
    });
  });

  it('handles generic messages without content by serializing the whole record', async () => {
    const adapter = createMockSessionAdapter('claude-code', new Set([
      AgentCapability.Chat,
      AgentCapability.Sessions,
      AgentCapability.Fork,
    ]), {
      getSessionMessages: async () => [
        { role: 'system', metadata: { key: 'val' } },
      ],
    });
    const registry = createMockRegistry(new Map([['claude-code', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('system');
    // When no recognized content field exists, falls back to JSON serialization
    expect(result[0].parts).toHaveLength(1);
    expect(result[0].parts[0].type).toBe('json');
    expect(result[0].parts[0].text).toContain('"metadata"');
  });

  it('returns null when getSessionMessages returns a non-array', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      getSessionMessages: async () => ({ messages: [] }) as unknown as Array<unknown>,
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toBeNull();
  });

  it('handles Claude content blocks with non-object entries gracefully', async () => {
    const adapter = createMockSessionAdapter('claude-code', new Set([
      AgentCapability.Chat,
      AgentCapability.Sessions,
      AgentCapability.Fork,
    ]), {
      getSessionMessages: async () => [
        { role: 'assistant', content: [{ type: 'text', text: 'valid' }, null, 'string', 123] },
      ],
    });
    const registry = createMockRegistry(new Map([['claude-code', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    // Non-object entries (null, 'string', 123) are skipped; only valid blocks produce parts
    expect(result[0].parts).toHaveLength(1);
    expect(result[0].parts[0]).toEqual({ type: 'text', text: 'valid' });
  });

  it('skips null items in the messages array without crashing', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      getSessionMessages: async () => [
        { info: { id: 'm1', role: 'user' }, parts: [{ type: 'text', text: 'hello' }] },
        null,
        { info: { id: 'm2', role: 'assistant' }, parts: [{ type: 'text', text: 'reply' }] },
      ] as unknown as Array<unknown>,
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toHaveLength(2);
    expect(result![0].role).toBe('user');
    expect(result![1].role).toBe('assistant');
  });

  it('skips null items inside OpenCode parts array without crashing', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      getSessionMessages: async () => [
        {
          info: { id: 'm1', role: 'assistant' },
          parts: [
            { type: 'text', text: 'first' },
            null,
            'string',
            123,
            { type: 'tool', text: 'tool output' },
          ],
        },
      ],
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toHaveLength(1);
    expect(result![0].role).toBe('assistant');
    // Null, string, and number entries inside parts are skipped;
    // only valid object parts produce normalized entries.
    expect(result![0].parts).toHaveLength(2);
    expect(result![0].parts[0]).toEqual({ type: 'text', text: 'first' });
    expect(result![0].parts[1]).toEqual({ type: 'tool', text: 'tool output' });
  });

  it('returns null when getSessionMessages throws an error', async () => {
    const adapter = createMockSessionAdapter('opencode', OPENCODE_FULL_CAPABILITIES, {
      getSessionMessages: async () => { throw new Error('backend failure'); },
    });
    const registry = createMockRegistry(new Map([['opencode', adapter]]));
    const result = await getBackendSessionPreview(registry, 'ses-1');
    expect(result).toBeNull();
  });
});
