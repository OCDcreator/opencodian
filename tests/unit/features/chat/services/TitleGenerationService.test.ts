import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import type { AgentService, AgentSessionCapability } from '../../../../../src/core/agents/backend/AgentService';
import type { AgentBackendKind } from '../../../../../src/core/types/chat';
import { TitleGenerationService } from '../../../../../src/features/chat/services/TitleGenerationService';

describe('TitleGenerationService', () => {
  function createMockPlugin(overrides: Partial<{
    backend: AgentBackendKind;
    openCodeSessionId: string | null;
    registryHasSessions: boolean;
    listSessionsResult: Array<{ sessionId?: string; summary?: string }>;
  }> = {}) {
    const {
      backend = 'opencode',
      openCodeSessionId = 'oc-session-1',
      registryHasSessions = false,
      listSessionsResult = [],
    } = overrides;

    const mockAdapter: AgentService & Partial<AgentSessionCapability> = {
      kind: backend,
      displayName: 'Test Backend',
      description: 'Test',
      status: 'connected',
      capabilities: new Set([AgentCapability.Chat, AgentCapability.Sessions]),
      hasCapability(cap: AgentCapability) {
        return this.capabilities.has(cap);
      },
      start: jest.fn(),
      stop: jest.fn(),
      dispose: jest.fn(),
      onStatusChange: jest.fn(() => ({ dispose: jest.fn() })),
      listSessions: jest.fn().mockResolvedValue(listSessionsResult),
    };

    const mockRegistry = {
      get: jest.fn().mockImplementation((kind: AgentBackendKind) => {
        if (kind === backend && registryHasSessions) {
          return mockAdapter;
        }
        return undefined;
      }),
    };

    const mockOpenCodeService = {
      listSessions: jest.fn().mockResolvedValue([
        { id: 'oc-session-1', title: 'OpenCode Session Title' },
        { id: 'oc-session-2', title: 'Another Session' },
      ]),
      createSession: jest.fn().mockResolvedValue('temp-session'),
      deleteSession: jest.fn().mockResolvedValue(undefined),
      requestAssistantResponse: jest.fn(),
    };

    return {
      agentServiceRegistry: mockRegistry,
      openCodeService: mockOpenCodeService,
      getConversationById: jest.fn().mockResolvedValue({
        id: 'conv-1',
        backend,
        openCodeSessionId,
        backendSessionId: openCodeSessionId ?? undefined,
        messages: [],
      }),
      settings: {
        aiTitleModel: '',
        locale: 'en',
        systemPrompt: '',
        modelSourceMode: 'merge',
        disabledModelRefs: [],
      },
      modelConfigService: null,
    } as unknown as import('../../../../../src/main').default;
  }

  describe('readOfficialSessionTitle', () => {
    it('reads official title from OpenCode backend via openCodeService.listSessions', async () => {
      const plugin = createMockPlugin({ backend: 'opencode', openCodeSessionId: 'oc-session-1' });
      const service = new TitleGenerationService(plugin);

      // Use reflection to access private method, bind to service instance
      const readOfficialSessionTitle = ((service as unknown as Record<string, unknown>)
        .readOfficialSessionTitle as (sessionId: string, backend: AgentBackendKind) => Promise<string | null>)
        .bind(service);

      const title = await readOfficialSessionTitle('oc-session-1', 'opencode');
      expect(title).toBe('OpenCode Session Title');
      expect(plugin.openCodeService.listSessions).toHaveBeenCalled();
    });

    it('returns null for OpenCode session with default title pattern', async () => {
      const plugin = createMockPlugin({
        backend: 'opencode',
        openCodeSessionId: 'oc-session-1',
      });
      plugin.openCodeService.listSessions = jest.fn().mockResolvedValue([
        { id: 'oc-session-1', title: 'New session - 2026-01-01T00:00:00.000Z' },
      ]);
      const service = new TitleGenerationService(plugin);

      const readOfficialSessionTitle = ((service as unknown as Record<string, unknown>)
        .readOfficialSessionTitle as (sessionId: string, backend: AgentBackendKind) => Promise<string | null>)
        .bind(service);

      const title = await readOfficialSessionTitle('oc-session-1', 'opencode');
      expect(title).toBeNull();
    });

    it('reads official title from non-OpenCode backend via registry adapter listSessions', async () => {
      const plugin = createMockPlugin({
        backend: 'claude-code',
        openCodeSessionId: null,
        registryHasSessions: true,
        listSessionsResult: [{ sessionId: 'claude-session-1', summary: 'Claude Session Title' }],
      });
      const service = new TitleGenerationService(plugin);

      const readOfficialSessionTitle = ((service as unknown as Record<string, unknown>)
        .readOfficialSessionTitle as (sessionId: string, backend: AgentBackendKind) => Promise<string | null>)
        .bind(service);

      const title = await readOfficialSessionTitle('claude-session-1', 'claude-code');
      expect(title).toBe('Claude Session Title');
      expect(plugin.agentServiceRegistry.get).toHaveBeenCalledWith('claude-code');
    });

    it('returns null when non-OpenCode backend lacks Sessions capability', async () => {
      const plugin = createMockPlugin({
        backend: 'claude-code',
        openCodeSessionId: null,
        registryHasSessions: false,
      });
      const service = new TitleGenerationService(plugin);

      const readOfficialSessionTitle = ((service as unknown as Record<string, unknown>)
        .readOfficialSessionTitle as (sessionId: string, backend: AgentBackendKind) => Promise<string | null>)
        .bind(service);

      const title = await readOfficialSessionTitle('claude-session-1', 'claude-code');
      expect(title).toBeNull();
      expect(plugin.openCodeService.listSessions).not.toHaveBeenCalled();
    });

    it('returns null when session is not found in backend list', async () => {
      const plugin = createMockPlugin({
        backend: 'claude-code',
        registryHasSessions: true,
        listSessionsResult: [{ sessionId: 'other-session', summary: 'Other' }],
      });
      const service = new TitleGenerationService(plugin);

      const readOfficialSessionTitle = ((service as unknown as Record<string, unknown>)
        .readOfficialSessionTitle as (sessionId: string, backend: AgentBackendKind) => Promise<string | null>)
        .bind(service);

      const title = await readOfficialSessionTitle('claude-session-1', 'claude-code');
      expect(title).toBeNull();
    });
  });

  describe('resolveConversationBackend', () => {
    it('resolves backend from conversation metadata', async () => {
      const plugin = createMockPlugin({ backend: 'claude-code' });
      const service = new TitleGenerationService(plugin);

      const resolveConversationBackend = ((service as unknown as Record<string, unknown>)
        .resolveConversationBackend as (conversationId: string) => Promise<AgentBackendKind>)
        .bind(service);

      const backend = await resolveConversationBackend('conv-1');
      expect(backend).toBe('claude-code');
    });

    it('falls back to opencode when conversation lookup fails', async () => {
      const plugin = createMockPlugin();
      plugin.getConversationById = jest.fn().mockRejectedValue(new Error('Not found'));
      const service = new TitleGenerationService(plugin);

      const resolveConversationBackend = ((service as unknown as Record<string, unknown>)
        .resolveConversationBackend as (conversationId: string) => Promise<AgentBackendKind>)
        .bind(service);

      const backend = await resolveConversationBackend('conv-1');
      expect(backend).toBe('opencode');
    });
  });
});
