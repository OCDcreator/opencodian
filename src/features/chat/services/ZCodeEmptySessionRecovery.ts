import {
  type Conversation,
  getConversationBackendSessionId,
} from '../../../core/types';

/** Narrow ZCode recovery boundary: no generic session creation is permitted. */
export interface ZCodeEmptySessionRecoveryAdapter {
  recreateDeferredSessionIfMissing(sessionId: string): Promise<string | null>;
}

export interface ZCodeEmptySessionRecoveryOptions {
  readonly conversation: Conversation | null;
  readonly getCurrentConversation: () => Conversation | null;
  readonly getAdapter: () => ZCodeEmptySessionRecoveryAdapter | null;
  readonly saveConversation: (conversation: Conversation) => Promise<void>;
  readonly now?: () => number;
}

export type ZCodeEmptySessionRecoveryOutcome =
  | 'not-applicable'
  | 'adapter-unavailable'
  | 'active'
  | 'rebound'
  | 'stale';

/**
 * Rebind a persisted OpenCodian conversation only when its ZCode session was
 * never materialized.  The native adapter owns structured-error recognition;
 * this feature boundary additionally requires zero local messages before it
 * is allowed to persist the replacement id.  Composer state is deliberately
 * outside this function and remains untouched.
 */
export async function recoverEmptyZCodeConversationSession(
  options: ZCodeEmptySessionRecoveryOptions,
): Promise<ZCodeEmptySessionRecoveryOutcome> {
  const conversation = options.conversation;
  const staleSessionId = conversation
    ? getConversationBackendSessionId(conversation)
    : undefined;
  if (
    !conversation
    || conversation.backend !== 'zcode'
    || conversation.messages.length !== 0
    || !staleSessionId
  ) {
    return 'not-applicable';
  }

  const adapter = options.getAdapter();
  if (!adapter) {
    return 'adapter-unavailable';
  }

  const replacementSessionId = await adapter.recreateDeferredSessionIfMissing(staleSessionId);
  if (!replacementSessionId) {
    return 'active';
  }

  const current = options.getCurrentConversation();
  if (
    current?.id !== conversation.id
    || current.backend !== 'zcode'
    || getConversationBackendSessionId(current) !== staleSessionId
    || current.messages.length !== 0
  ) {
    return 'stale';
  }

  const previousSessionId = conversation.backendSessionId;
  const previousUsage = conversation.lastContextUsage;
  const previousUpdatedAt = conversation.updatedAt;
  conversation.backendSessionId = replacementSessionId;
  // A token snapshot belongs to the vanished native session. Keeping it
  // would make the newly created session display incorrect context usage.
  conversation.lastContextUsage = undefined;
  conversation.updatedAt = options.now?.() ?? Date.now();
  try {
    await options.saveConversation(conversation);
  } catch (error) {
    conversation.backendSessionId = previousSessionId;
    conversation.lastContextUsage = previousUsage;
    conversation.updatedAt = previousUpdatedAt;
    throw error;
  }
  return 'rebound';
}
