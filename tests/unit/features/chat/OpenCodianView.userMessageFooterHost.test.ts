import {
  AgentCapability,
  type BackendCapabilities,
  setAgentServiceRegistry,
} from '../../../../src/core/agents/AgentCapability';
import type { AgentService } from '../../../../src/core/agents/backend/AgentService';
import type { AgentBackendKind, Conversation } from '../../../../src/core/types/chat';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import type { UserMessageFooterRendererHost } from '../../../../src/features/chat/runtime/UserMessageFooterRenderer';

type FooterHostHarness = OpenCodianView & {
  plugin: { agentServiceRegistry: { get(kind: AgentBackendKind): AgentService | undefined } };
  currentConversation: Conversation | null;
  createUserMessageFooterRendererHost(): UserMessageFooterRendererHost;
  isActiveTabStreaming(): boolean;
};

function capabilities(...caps: AgentCapability[]): BackendCapabilities {
  return new Set(caps);
}

function createService(kind: AgentBackendKind, caps: BackendCapabilities): AgentService {
  return {
    kind,
    displayName: kind,
    description: kind,
    status: 'connected',
    capabilities: caps,
    hasCapability: (cap) => caps.has(cap),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn(),
    onStatusChange: jest.fn(() => ({ dispose: jest.fn() })),
  };
}

function createConversation(backend: AgentBackendKind): Conversation {
  return {
    id: `${backend}-conversation`,
    title: `${backend} conversation`,
    createdAt: 1,
    updatedAt: 2,
    backend,
    backendSessionId: `${backend}-session`,
    openCodeSessionId: backend === 'opencode' ? 'opencode-session' : undefined,
    messages: [],
  };
}

function createViewHarness(
  currentConversation: Conversation,
  services: Map<AgentBackendKind, AgentService>,
): FooterHostHarness {
  const view = Object.assign(Object.create(OpenCodianView.prototype), {
    plugin: {
      agentServiceRegistry: {
        get: (kind: AgentBackendKind) => services.get(kind),
      },
    },
    currentConversation,
  }) as FooterHostHarness;

  jest.spyOn(view, 'isActiveTabStreaming').mockReturnValue(false);
  return view;
}

describe('OpenCodianView user message footer host capability routing', () => {
  afterEach(() => {
    setAgentServiceRegistry(null);
    jest.restoreAllMocks();
  });

  it('hides Rewind for a Claude conversation even when the active backend is OpenCode with Branching', () => {
    const openCodeService = createService('opencode', capabilities(
      AgentCapability.Sessions,
      AgentCapability.Fork,
      AgentCapability.Branching,
    ));
    const claudeService = createService('claude-code', capabilities(
      AgentCapability.Sessions,
      AgentCapability.Fork,
    ));
    const activeRegistry = {
      getActive: () => openCodeService,
    };
    setAgentServiceRegistry(activeRegistry as never);
    const view = createViewHarness(
      createConversation('claude-code'),
      new Map<AgentBackendKind, AgentService>([
        ['opencode', openCodeService],
        ['claude-code', claudeService],
      ]),
    );

    const host = view.createUserMessageFooterRendererHost();

    expect(host.hasForkCapability()).toBe(true);
    expect(host.hasRewindCapability()).toBe(false);
  });

  it('keeps Rewind visible for an OpenCode conversation when OpenCode supports Branching', () => {
    const openCodeService = createService('opencode', capabilities(
      AgentCapability.Sessions,
      AgentCapability.Fork,
      AgentCapability.Branching,
    ));
    const claudeService = createService('claude-code', capabilities(
      AgentCapability.Sessions,
      AgentCapability.Fork,
    ));
    const activeRegistry = {
      getActive: () => claudeService,
    };
    setAgentServiceRegistry(activeRegistry as never);
    const view = createViewHarness(
      createConversation('opencode'),
      new Map<AgentBackendKind, AgentService>([
        ['opencode', openCodeService],
        ['claude-code', claudeService],
      ]),
    );

    const host = view.createUserMessageFooterRendererHost();

    expect(host.hasForkCapability()).toBe(true);
    expect(host.hasRewindCapability()).toBe(true);
  });
});
