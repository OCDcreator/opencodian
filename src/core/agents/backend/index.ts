/**
 * Agent backend abstraction layer.
 *
 * This package provides the AgentService interface, the OpenCode adapter,
 * and the registry for managing multiple agent backends.
 */

import type { AgentBackendKind } from '../../types/chat';

// 'opencode' (OpenCode 1) is retired from the selectable runtime surface; the
// kind, adapter and settings stay in the codebase for stored conversations and
// rollback, so nothing may re-add it to this whitelist without a product call.
export const IMPLEMENTED_AGENT_BACKENDS: readonly AgentBackendKind[] = ['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'];

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
  type BackendModelSelectorProvider,
  buildClaudeCodeModelSelectorProviders,
  CLAUDE_CODE_EFFORT_VARIANTS,
  CLAUDE_CODE_PROVIDER_ID,
  CLAUDE_CODE_PROVIDER_NAME,
  type ClaudeCodeModelCatalogEntry,
  CODEX_EFFORT_VARIANTS,
} from './BackendModelCatalog';
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
} from './claude/ClaudeCodeAdapter';
export {
  buildClaudeCodeElicitationContent,
  buildClaudeCodeElicitationQuestionRequest,
  buildClaudeCodeUserDialogQuestionRequest,
  buildClaudeCodeUserDialogResult,
  normalizeClaudeCodeElicitationContent,
} from './claude/ClaudeCodeElicitationBridge';
export {
  adaptMcpConfigForClaude,
  type ClaudeCodeMcpHttpConfig,
  type ClaudeCodeMcpServerConfig,
  type ClaudeCodeMcpServersMap,
  type ClaudeCodeMcpSseConfig,
  type ClaudeCodeMcpStdioConfig,
} from './claude/ClaudeCodeMcpConfigAdapter';
export {
  buildClaudeCodeOptions,
  type ClaudeCodeOptionsBuilderInput,
  type ClaudeCodeSdkOptionsShape,
  type ClaudeCodeSdkThinking,
} from './claude/ClaudeCodeOptionsBuilder';
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
} from './claude/ClaudeCodePermissionBridge';
export {
  type ClaudeCodeProcessMissingReason,
  type ClaudeCodeProcessResolution,
  type ClaudeCodeProcessResolverEnv,
  type ClaudeCodeProcessResolverOptions,
  resolveClaudeCodeProcess,
} from './claude/ClaudeCodeProcessResolver';
export {
  type ClaudeAgentSdkImporter,
  type ClaudeAgentSdkModule,
  type ClaudeCodeSdkLoaderOptions,
  loadClaudeCodeSdk,
  type WarmQueryHandle,
} from './claude/ClaudeCodeSdkLoader';
export {
  ClaudeCodeStreamNormalizer,
  type ClaudeCodeStreamNormalizerOptions,
  createClaudeCodeStreamNormalizer,
} from './claude/ClaudeCodeStreamNormalizer';
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
} from './claude/ClaudeProjectAgentDiscovery';
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
} from './claude/ClaudeProjectCommandDiscovery';
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
} from './claude/ClaudeProjectProviderConfig';
export {
  type ClaudeHookEntry,
  type ClaudeHookGroup,
  type ClaudeHooksConfig,
  type ClaudeProjectSettingsInfo,
  discoverClaudeProjectSettings,
  openClaudeProjectSettingsFile,
} from './claude/ClaudeProjectSettingsDiscovery';
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
} from './claude/ClaudeProjectSkillDiscovery';
export {
  CodexAdapter,
  type CodexAdapterOptions,
  type CodexApprovalBridgeHost,
  type CodexApprovalDecision,
  type CodexApprovalKind,
  type CodexApprovalRequest,
  type CodexFactory,
} from './codex/CodexAdapter';
export {
  buildCodexApprovalQuestionRequest,
  type CodexApprovalCardRenderer,
  type CodexApprovalHostContext,
  type CodexApprovalResolutionResult,
  createCodexApprovalBridgeHost,
  mapCodexApprovalResolution,
} from './codex/CodexDefaultApprovalHost';
export {
  buildCodexElicitationContent,
  buildCodexElicitationQuestionRequest,
  buildCodexElicitationUrlQuestionRequest,
  type CodexElicitationBridgeHost,
  type CodexElicitationCardRenderer,
  type CodexElicitationCardRequest,
  type CodexElicitationContent,
  type CodexElicitationFormParams,
  type CodexElicitationFormSchema,
  type CodexElicitationHostContext,
  type CodexElicitationHostResponse,
  type CodexElicitationUrlParams,
  type CodexMcpElicitationWireParams,
  createCodexElicitationBridgeHost,
  isCodexElicitationDecline,
  isCodexElicitationWireParams,
} from './codex/CodexElicitationBridge';
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
} from './codex/CodexProjectResourceDiscovery';
export {
  CodexStreamNormalizer,
  type CodexStreamNormalizerOptions,
  createCodexStreamNormalizer,
} from './codex/CodexStreamNormalizer';
export {
  assertWithinRoot,
  atomicWriteFile,
  isSafeResourceName,
  type ProjectResourceWriteError,
  toWriteErrorCode,
} from './configuration/ProjectResourceSecureWrite';
export { DshAdapter, type DshAdapterOptions } from './dsh/DshAdapter';
export { OpenCode2Adapter } from './opencode/OpenCode2Adapter';
export { OpenCodeAdapter } from './opencode/OpenCodeAdapter';
export {
  ZCodeAdapter,
  type ZCodeAdapterOptions,
  type ZCodeAdapterRuntimeDiagnostics,
  type ZCodeHandshakeState,
  type ZCodeProviderConfigSnapshot,
  type ZCodeRuntimeResolution,
} from './zcode';
