import type { NativePromptMention } from '../../types/chat';
import type { AgentService } from './AgentService';

/** Optional native mention seams. Absence means use the owning history reader. */
export interface AgentMentionCapability extends AgentService {
  getRuntimeMentionCandidates?(sessionId?: string): Promise<NativePromptMention[]>;
  prepareNativeSessionReference?(sourceSessionId: string, targetSessionId?: string): Promise<string | null>;
}
