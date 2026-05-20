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
