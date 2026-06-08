import { getAgentServiceRegistry } from '../../../core/agents/AgentCapability';
import { getConversationSessionBackendService } from '../../../core/agents/backend/AgentBackendRouting';
import type { AgentSessionCapability } from '../../../core/agents/backend/AgentService';
import type { Conversation } from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import { createLogger } from '../../../shared';
import type { ConversationWriteTicket } from './ConversationWriteSerializationService';

const logger = createLogger('ClaudeUserMessageIdentityBackfill');

export interface ClaudeUserMessageIdentityBackfillHost {
  createConversationWriteTicket(conversationId: string): ConversationWriteTicket;
  commitConversationWrite(
    conversation: Conversation,
    ticket: ConversationWriteTicket,
    reason: string,
    write: () => void | Promise<void>,
  ): Promise<boolean>;
}

let _persistenceHost: ClaudeUserMessageIdentityBackfillHost | null = null;

export function setBackfillPersistenceHost(host: ClaudeUserMessageIdentityBackfillHost | null): void {
  _persistenceHost = host;
}

interface ClaudeUserMessageIdentityResolver extends AgentSessionCapability {
  resolveClaudeUserMessageIdentities(sessionId: string): Promise<string[]>;
}

export class ClaudeUserMessageIdentityBackfillService {
  constructor(
    private readonly host?: ClaudeUserMessageIdentityBackfillHost,
  ) {}

  async backfill(conversation: Conversation): Promise<boolean> {
    if (conversation.backend !== 'claude-code') return false;

    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) return false;

    const registry = getAgentServiceRegistry();
    if (!registry) return false;

    const backend = getConversationSessionBackendService(registry, conversation);
    if (
      !backend
      || typeof (backend as Partial<ClaudeUserMessageIdentityResolver>).resolveClaudeUserMessageIdentities !== 'function'
    ) {
      return false;
    }

    const allUserMessages = conversation.messages.filter(
      (m) => m.role === 'user' && !m.compactionDivider,
    );
    if (allUserMessages.every((m) => m.sourceMessageId)) return false;

    const identities = await (backend as ClaudeUserMessageIdentityResolver)
      .resolveClaudeUserMessageIdentities(sessionId);
    if (!Array.isArray(identities) || identities.length === 0) return false;

    if (allUserMessages.length !== identities.length) {
      logger.warn('user message count mismatch — skipping backfill', {
        conversationId: conversation.id,
        sessionId,
        localCount: allUserMessages.length,
        remoteCount: identities.length,
      });
      return false;
    }

    let applied = 0;
    for (let i = 0; i < allUserMessages.length; i++) {
      if (!allUserMessages[i].sourceMessageId && identities[i]) {
        allUserMessages[i].sourceMessageId = identities[i];
        applied++;
      }
    }

    if (applied === 0) return false;

    logger.debug('backfilled Claude user message identities', {
      conversationId: conversation.id,
      sessionId,
      total: allUserMessages.length,
      applied,
    });

    const persistenceHost = this.host ?? _persistenceHost;
    if (persistenceHost) {
      const ticket = persistenceHost.createConversationWriteTicket(conversation.id);
      await persistenceHost.commitConversationWrite(conversation, ticket, 'claude-user-message-identity-backfill', () => {
        conversation.updatedAt = Date.now();
      });
    }

    return true;
  }
}
