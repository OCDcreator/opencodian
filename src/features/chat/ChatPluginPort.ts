import type { App, PluginManifest } from 'obsidian';

import type { AgentServiceRegistry } from '../../core/agents/backend/AgentServiceRegistry';
import type { ClaudeCodePermissionBridgeHostContext } from '../../core/agents/backend/ClaudeCodeDefaultPermissionHost';
import type { CodexApprovalHostContext } from '../../core/agents/backend/CodexDefaultApprovalHost';
import type {
  ModelConfigService,
  ModelPricingService,
  OpencodeConfigManager,
} from '../../core/config';
import type { OpenCodeService } from '../../core/opencode';
import type { OpenCodianSettingsRuntimeCoordinator } from '../../core/runtime/OpenCodianSettingsRuntimeCoordinator';
import type { Conversation, OpenCodianSettings } from '../../core/types';
import type { AgentBackendKind } from '../../core/types/chat';
import type { OpenCodianSettingTab } from '../settings/OpenCodianSettings';
import type { TabRuntimePluginSource } from './services/ConversationTabRuntimeCoordinator';

type ConversationCachePinProvider = () => Iterable<string>;

type ChatPluginSettings = Pick<
  OpenCodianSettings,
  | 'activeBackend'
  | 'aiTitleModel'
  | 'backendSettings'
  | 'chatAppearance'
  | 'chatFontSizePx'
  | 'chatScrollMode'
  | 'defaultModel'
  | 'defaultProvider'
  | 'disabledModelRefs'
  | 'enableAutoScroll'
  | 'enabledBackends'
  | 'enableDebugLogging'
  | 'enableTabs'
  | 'hiddenSlashCommands'
  | 'inputPanelGlassRefraction'
  | 'inputPanelGlassRefractionSvgFilter'
  | 'inputPanelLiquidGlass'
  | 'inputPanelTheme'
  | 'maxTabs'
  | 'modelSourceMode'
  | 'permissionMode'
  | 'providerIconLibrary'
  | 'questionCardPosition'
  | 'questionDisplayMode'
  | 'renderUserMarkupAsCodeBlocks'
  | 'server'
  | 'settingsPanelScrollTop'
  | 'showAnsweredQuestionCards'
  | 'showModifiedFilesSidebar'
  | 'slashCommandSkillMode'
  | 'systemPrompt'
  | 'tabBarPosition'
  | 'tabState'
  | 'belowHeaderTabBarLayout'
  | 'theme'
  | 'titleMode'
  | 'locale'
>;

type ChatOpenCodeService = Pick<
  OpenCodeService,
  | 'buildStructuredPromptSendPayload'
  | 'checkHealth'
  | 'createSession'
  | 'deleteSession'
  | 'detachStream'
  | 'forkSession'
  | 'getAvailableModels'
  | 'getCachedSessionDiffEntries'
  | 'getCanonicalSessionMessages'
  | 'getCanonicalSessionState'
  | 'getCurrentProjectId'
  | 'getLspStatus'
  | 'getPendingQuestions'
  | 'getServerStatus'
  | 'getSessionChildren'
  | 'getSessionContextUsageSnapshot'
  | 'getSessionDiff'
  | 'getSessionMessages'
  | 'getSessionRevertState'
  | 'getSessionStatuses'
  | 'getSessionTodos'
  | 'hydrateOpenCodeMessage'
  | 'isServerProcessRunning'
  | 'requireSdkCapability'
  | 'respondToPermission'
  | 'requestAssistantResponse'
  | 'revertSession'
  | 'replyToQuestion'
  | 'rejectQuestion'
  | 'runExperimentalAction'
  | 'runSessionCommand'
  | 'seedCanonicalUserMessage'
  | 'shareSession'
  | 'sdk'
  | 'setSessionId'
  | 'start'
  | 'stop'
  | 'summarizeSession'
  | 'subscribeToSessionStatusUpdates'
  | 'subscribeToSessionSyncEvents'
  | 'subscribeToSessionTodoUpdates'
  | 'unrevertSession'
  | 'unshareSession'
>;

/** Consumer-owned plugin seam required by the chat shell. */
export interface ChatPluginPort extends TabRuntimePluginSource {
  app: Pick<App, 'vault'>;
  manifest: Pick<PluginManifest, 'dir' | 'id'>;
  settings: ChatPluginSettings;
  openCodeService: ChatOpenCodeService;
  agentServiceRegistry: AgentServiceRegistry;
  claudeCodePermissionHostContext: Pick<
    ClaudeCodePermissionBridgeHostContext,
    | 'elicitationCardRenderer'
    | 'getActiveTabId'
    | 'permissionCardRenderer'
    | 'questionCardRenderer'
  >;
  codexApprovalHostContext: Pick<
    CodexApprovalHostContext,
    'approvalCardRenderer' | 'getActiveTabId'
  >;
  opencodeConfigManager: Pick<
    OpencodeConfigManager,
    'getAgentConfig' | 'getCommandConfig' | 'getConfigDir'
  > | null;
  modelConfigService: Pick<
    ModelConfigService,
    'getCatalogs' | 'isModelAvailableOnServer'
  > | null;
  modelPricingService: Pick<
    ModelPricingService,
    'enrichContextUsageSnapshot' | 'getBackendPricingIdentityHint'
  > | null;
  settingsTab?: Pick<
    OpenCodianSettingTab,
    | 'prepareRestoreScrollOnNextOpen'
    | 'prepareScrollToClaudeCodeOnNextOpen'
    | 'prepareScrollToConversationOnNextOpen'
    | 'prepareScrollToLspOnNextOpen'
    | 'prepareScrollToServerOnNextOpen'
    | 'refreshServerStatusDisplay'
    | 'scrollToModelSection'
  >;
  saveSettings: Pick<OpenCodianSettingsRuntimeCoordinator, 'saveSettings'>['saveSettings'];
  loadConversations(options?: { force?: boolean }): Promise<void>;
  createConversation(): Promise<Conversation>;
  createConversationFromSession(
    sessionId: string,
    initial?: Partial<Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'openCodeSessionId' | 'backendSessionId'>>,
  ): Promise<Conversation>;
  createConversationFromBackendSession(
    sessionId: string,
    title: string,
    initialMessages?: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
    }>,
    backend?: AgentBackendKind,
  ): Promise<string | null>;
  saveConversation(conversation: Conversation): Promise<void>;
  getConversations(): Conversation[];
  getConversationById(
    id: string,
    options?: { preferCache?: boolean },
  ): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<void>;
  generateDefaultTitle(firstMessage: string): string;
  registerConversationCachePinProvider(provider: ConversationCachePinProvider): void;
  unregisterConversationCachePinProvider(provider: ConversationCachePinProvider): void;
  resolveChatThemeBackgroundDataUrl(): Promise<string | null>;
}
