import type { AgentServiceRegistry } from '../../../core/agents/backend/AgentServiceRegistry';
import type { ModelConfigService } from '../../../core/config/ModelConfigService';
import type { OpenCodeService } from '../../../core/opencode/OpenCodeService';
import type { Conversation } from '../../../core/types/chat';
import type { OpenCodianSettings } from '../../../core/types/settings';

type TitleGenerationConversation = Pick<
  Conversation,
  'backend' | 'backendSessionId' | 'openCodeSessionId' | 'acpSessionId'
>;

/**
 * Consumer-owned dependencies used by {@link TitleGenerationService}.
 */
export interface TitleGenerationPort {
  readonly settings: Readonly<Pick<
    OpenCodianSettings,
    'aiTitleModel' | 'disabledModelRefs' | 'locale' | 'modelSourceMode'
  >>;
  readonly openCodeService: Pick<
    OpenCodeService,
    'createSession' | 'deleteSession' | 'requestAssistantResponse'
  >;
  readonly modelConfigService: Pick<ModelConfigService, 'getCatalogs'> | null;
  readonly agentServiceRegistry: AgentServiceRegistry;
  getConversationById(
    id: string,
    options?: { preferCache?: boolean },
  ): Promise<TitleGenerationConversation | undefined>;
  generateDefaultTitle(firstMessage: string): string;
}
