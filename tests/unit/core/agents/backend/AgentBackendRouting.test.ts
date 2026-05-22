import { describe, expect, it } from '@jest/globals';

import { AgentCapability, OPENCODE_FULL_CAPABILITIES } from '../../../../../src/core/agents/AgentCapability';
import {
  getActiveSessionHistoryService,
  getConversationSessionBackendService,
  getConversationSessionHistoryService,
  loadBackendSessionMessages,
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
});
