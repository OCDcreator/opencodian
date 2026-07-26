/**
 * Agent backend abstraction layer.
 *
 * This package provides the AgentService interface, the OpenCode adapter,
 * and the registry for managing multiple agent backends.
 */

import type { AgentBackendKind } from '../../types/chat';

export const IMPLEMENTED_AGENT_BACKENDS: readonly AgentBackendKind[] = ['opencode', 'claude-code', 'codex'];

export {
  wireHiddenAdapters,
  type WireHiddenAdaptersOptions,
} from './AgentAdapterWiring';
export {
  getActiveSessionBackendService,
  getConversationBackendService,
  getConversationChatBackendService,
  getConversationSessionBackendService,
  hasChatCapability,
  hasSessionCapability,
  resolveConversationBackendKind,
} from './AgentBackendRouting';
export type {
  AgentAuthCapability,
  AgentBranchCapability,
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConfigCapability,
  AgentConnectionStatus,
  AgentMcpCapability,
  AgentModelCapability,
  AgentPermissionCapability,
  AgentQuestionCapability,
  AgentService,
  AgentServiceInfo,
  AgentSessionCapability,
  AgentTodoCapability,
  AgentToolCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
export { AgentServiceRegistry } from './AgentServiceRegistry';
export {
  ClaudeCodeAdapter,
  type ClaudeCodeAdapterOptions,
  type ClaudeCodeRuntimeCatalog,
  type ClaudeCodeRuntimeCatalogAgent,
  type ClaudeCodeRuntimeCatalogCommand,
  type ClaudeCodeSdkFacade,
  type ClaudeCodeSdkLoader,
  type ClaudeCodeSdkQueryInput,
  type Context1mBetaReadbackProbeResult,
  type DebugFileLiveProbeResult,
  type DebugFileReadbackProbeResult,
  type DebugReadbackProbeResult,
  type JsRuntimeReadbackProbeResult,
  type LoadTimeoutReadbackProbeResult,
  type OutputStyleLiveProbeResult,
  type PlanModeInstructionsLiveProbeResult,
  type PlanModeInstructionsReadbackProbeResult,
  type PromptSuggestionsReadbackProbeResult,
  type SandboxReadbackProbeResult,
  type StrictMcpConfigReadbackProbeResult,
  type SystemPromptLiveProbeResult,
  type SystemPromptReadbackProbeResult,
  type TaskBudgetReadbackProbeResult,
  type ToolAliasesReadbackProbeResult,
  type WarmStartupProbeResult,
} from './ClaudeCodeAdapter';
export {
  buildClaudeCodeElicitationContent,
  buildClaudeCodeElicitationQuestionRequest,
  normalizeClaudeCodeElicitationContent,
} from './ClaudeCodeElicitationBridge';
export {
  adaptMcpConfigForClaude,
  type ClaudeCodeMcpHttpConfig,
  type ClaudeCodeMcpServerConfig,
  type ClaudeCodeMcpServersMap,
  type ClaudeCodeMcpSseConfig,
  type ClaudeCodeMcpStdioConfig,
} from './ClaudeCodeMcpConfigAdapter';
export {
  buildClaudeCodeModelSelectorProviders,
  CLAUDE_CODE_EFFORT_VARIANTS,
  CLAUDE_CODE_PROVIDER_ID,
  CLAUDE_CODE_PROVIDER_NAME,
  type ClaudeCodeModelCatalogEntry,
  type ClaudeCodeModelSelectorProvider,
  CODEX_EFFORT_VARIANTS,
} from './ClaudeCodeModelCatalog';
export {
  buildClaudeCodeOptions,
  type ClaudeCodeOptionsBuilderInput,
  type ClaudeCodeSdkOptionsShape,
  type ClaudeCodeSdkThinking,
} from './ClaudeCodeOptionsBuilder';
export {
  type ClaudeCodeApprovalDecision,
  type ClaudeCodeCanUseToolContext,
  ClaudeCodePermissionBridge,
  type ClaudeCodePermissionBridgeHost,
  type ClaudeCodePermissionBridgeOptions,
  type ClaudeCodePermissionResult,
  type ClaudeCodePermissionUpdate,
  type ClaudeCodeQuestionDecision,
  createClaudeCodePermissionBridge,
} from './ClaudeCodePermissionBridge';
export {
  type ClaudeCodeProcessMissingReason,
  type ClaudeCodeProcessResolution,
  type ClaudeCodeProcessResolverEnv,
  type ClaudeCodeProcessResolverOptions,
  resolveClaudeCodeProcess,
} from './ClaudeCodeProcessResolver';
export {
  type ClaudeAgentSdkImporter,
  type ClaudeAgentSdkModule,
  type ClaudeCodeSdkLoaderOptions,
  loadClaudeCodeSdk,
  type WarmQueryHandle,
} from './ClaudeCodeSdkLoader';
export {
  ClaudeCodeStreamNormalizer,
  type ClaudeCodeStreamNormalizerOptions,
  createClaudeCodeStreamNormalizer,
} from './ClaudeCodeStreamNormalizer';
export {
  type ClaudeAgentWriteResult,
  type ClaudeProjectAgentInfo,
  createClaudeProjectAgent,
  defaultClaudeAgentContent,
  deleteClaudeProjectAgent,
  discoverClaudeGlobalAgents,
  discoverClaudeProjectAgents,
  readClaudeAgentContent,
  updateClaudeProjectAgent,
  validateClaudeAgentContent,
} from './ClaudeProjectAgentDiscovery';
export {
  type ClaudeCommandWriteResult,
  type ClaudeProjectCommandInfo,
  createClaudeProjectCommand,
  defaultClaudeCommandContent,
  deleteClaudeProjectCommand,
  discoverClaudeGlobalCommands,
  discoverClaudeProjectCommands,
  readClaudeCommandContent,
  updateClaudeProjectCommand,
  validateClaudeCommandContent,
} from './ClaudeProjectCommandDiscovery';
export {
  applyClaudeProviderPreset,
  type ApplyClaudeProviderPresetResult,
  type ClaudeProviderConfigLayer,
  type ClaudeProviderConfigSnapshot,
  type ClaudeProviderPresetValidation,
  maskClaudeProviderConfigSnapshot,
  maskClaudeProviderValue,
  migrateClaudeProviderModels,
  type MigrateClaudeProviderModelsResult,
  readClaudeProviderConfigSnapshot,
  resolveClaudeProviderGlobalEffectiveValue,
  validateClaudeProviderPreset,
} from './ClaudeProjectProviderConfig';
export {
  type ClaudeHookEntry,
  type ClaudeHookGroup,
  type ClaudeHooksConfig,
  type ClaudeProjectSettingsInfo,
  discoverClaudeProjectSettings,
  openClaudeProjectSettingsFile,
} from './ClaudeProjectSettingsDiscovery';
export {
  type ClaudeProjectSkillInfo,
  type ClaudeSkillWriteResult,
  createClaudeProjectSkill,
  defaultClaudeSkillContent,
  deleteClaudeProjectSkill,
  discoverClaudeGlobalSkills,
  discoverClaudeProjectSkills,
  readClaudeSkillContent,
  updateClaudeProjectSkill,
  validateClaudeSkillContent,
} from './ClaudeProjectSkillDiscovery';
export {
  CodexAdapter,
  type CodexAdapterOptions,
  type CodexApprovalBridgeHost,
  type CodexApprovalDecision,
  type CodexApprovalKind,
  type CodexApprovalRequest,
  type CodexFactory,
} from './CodexAdapter';
export {
  buildCodexApprovalQuestionRequest,
  type CodexApprovalCardRenderer,
  type CodexApprovalHostContext,
  type CodexApprovalResolutionResult,
  createCodexApprovalBridgeHost,
  mapCodexApprovalResolution,
} from './CodexDefaultApprovalHost';
export {
  type CodexAgentInfo,
  type CodexResourceWriteError,
  type CodexResourceWriteResult,
  type CodexSkillInfo,
  createCodexProjectAgent,
  createCodexProjectSkill,
  defaultCodexAgentContent,
  defaultCodexSkillContent,
  deleteCodexProjectAgent,
  deleteCodexProjectSkill,
  discoverCodexGlobalAgents,
  discoverCodexGlobalSkills,
  discoverCodexProjectAgents,
  discoverCodexProjectSkills,
  readCodexAgentContent,
  readCodexSkillContent,
  updateCodexProjectAgent,
  updateCodexProjectSkill,
  validateCodexAgentContent,
  validateCodexSkillContent,
} from './CodexProjectResourceDiscovery';
export {
  CodexStreamNormalizer,
  type CodexStreamNormalizerOptions,
  createCodexStreamNormalizer,
} from './CodexStreamNormalizer';
export { OpenCodeAdapter } from './OpenCodeAdapter';
export {
  assertWithinRoot,
  atomicWriteFile,
  isSafeResourceName,
  type ProjectResourceWriteError,
  toWriteErrorCode,
} from './ProjectResourceSecureWrite';
