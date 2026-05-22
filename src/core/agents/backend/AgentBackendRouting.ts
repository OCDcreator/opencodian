import type { AgentBackendKind, Conversation } from '../../types/chat';
import { AgentCapability } from '../AgentCapability';
import type {
  AgentChatCapability,
  AgentService,
  AgentSessionCapability,
} from './AgentService';
import type { AgentServiceRegistry } from './AgentServiceRegistry';

export function resolveConversationBackendKind(
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): AgentBackendKind {
  return conversation?.backend ?? 'opencode';
}

export function hasChatCapability(service: AgentService | null | undefined): service is AgentChatCapability {
  return Boolean(service?.hasCapability(AgentCapability.Chat));
}

export function hasSessionCapability(service: AgentService | null | undefined): service is AgentSessionCapability {
  return Boolean(service?.hasCapability(AgentCapability.Sessions));
}

export function getConversationBackendService(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): AgentService | null {
  const backend = resolveConversationBackendKind(conversation);
  return registry?.get(backend) ?? null;
}

export function getActiveSessionBackendService(
  registry: AgentServiceRegistry | null | undefined,
): AgentSessionCapability | null {
  const active = registry?.getActive() ?? null;
  return hasSessionCapability(active) ? active : null;
}

export function getConversationSessionBackendService(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): AgentSessionCapability | null {
  const service = getConversationBackendService(registry, conversation);
  return hasSessionCapability(service) ? service : null;
}

export function getConversationChatBackendService(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): AgentChatCapability | null {
  const service = getConversationBackendService(registry, conversation);
  return hasChatCapability(service) ? service : null;
}

/**
 * Returns the session backend for the given conversation ONLY if it also
 * implements `getSessionMessages`.  Used for session history productization
 * where callers need to read raw messages from the backend.
 */
export function getConversationSessionHistoryService(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): (AgentSessionCapability & Pick<Required<AgentSessionCapability>, 'getSessionMessages'>) | null {
  const service = getConversationSessionBackendService(registry, conversation);
  if (!service || typeof (service as AgentSessionCapability).getSessionMessages !== 'function') {
    return null;
  }
  return service as AgentSessionCapability & Pick<Required<AgentSessionCapability>, 'getSessionMessages'>;
}

/**
 * Returns the **active** backend's session service ONLY if it also implements
 * `getSessionMessages`.  Convenience wrapper for consumers that need to read
 * session messages from the active backend without a specific conversation
 * context (e.g. settings inspection surfaces).
 */
export function getActiveSessionHistoryService(
  registry: AgentServiceRegistry | null | undefined,
): (AgentSessionCapability & Pick<Required<AgentSessionCapability>, 'getSessionMessages'>) | null {
  const service = getActiveSessionBackendService(registry);
  if (!service || typeof service.getSessionMessages !== 'function') {
    return null;
  }
  return service as AgentSessionCapability & Pick<Required<AgentSessionCapability>, 'getSessionMessages'>;
}

// ---------------------------------------------------------------------------
// Backend-aware session message normalization
// ---------------------------------------------------------------------------

export interface NormalizedSessionMessage {
  id: string;
  role: string;
  createdAt: number | null;
  payload: string;
}

/**
 * Load and normalize raw session messages from the backend.
 *
 * - OpenCode messages have `{info, parts}` shape.
 * - Claude / other backends: best-effort generic normalization from SDK shape.
 *
 * Returns `[]` when no session history service is available.
 */
export async function loadBackendSessionMessages(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null,
  sessionId: string | null,
): Promise<NormalizedSessionMessage[]> {
  if (!sessionId) {
    return [];
  }
  const historyService = getConversationSessionHistoryService(registry, conversation);
  if (!historyService) {
    return [];
  }

  const backend = resolveConversationBackendKind(conversation);
  const rawMessages = await historyService.getSessionMessages(sessionId);

  if (backend === 'opencode') {
    return (rawMessages as Array<{
      info: { id: string; role: string; time: { created?: number } };
      parts: unknown;
    }>).map(({ info, parts }) => ({
      id: info.id,
      role: info.role,
      createdAt: info.time.created ?? null,
      payload: JSON.stringify({ message: info, parts }, null, 2),
    }));
  }

  // Generic normalization for Claude / other backends.
  return rawMessages.map((msg: unknown, idx: number) => {
    const record = msg as Record<string, unknown>;
    return {
      id: (record.id ?? record.message_id ?? `msg-${idx}`) as string,
      role: (record.role ?? record.type ?? 'unknown') as string,
      createdAt: typeof record.created_at === 'number' ? record.created_at : null,
      payload: JSON.stringify(record, null, 2),
    };
  });
}
