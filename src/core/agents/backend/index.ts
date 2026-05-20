/**
 * Agent backend abstraction layer.
 *
 * This package provides the AgentService interface, the OpenCode adapter,
 * and the registry for managing multiple agent backends.
 */

import type { AgentBackendKind } from '../../types/chat';

export const IMPLEMENTED_AGENT_BACKENDS: readonly AgentBackendKind[] = ['opencode', 'claude-code'];

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
  type ClaudeCodeSdkFacade,
  type ClaudeCodeSdkLoader,
  type ClaudeCodeSdkQueryInput,
} from './ClaudeCodeAdapter';
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
} from './ClaudeCodeSdkLoader';
export {
  ClaudeCodeStreamNormalizer,
  type ClaudeCodeStreamNormalizerOptions,
  createClaudeCodeStreamNormalizer,
} from './ClaudeCodeStreamNormalizer';
export { OpenCodeAdapter } from './OpenCodeAdapter';
