/**
 * Agent backend abstraction layer.
 *
 * This package provides the AgentService interface, the OpenCode adapter,
 * and the registry for managing multiple agent backends.
 */

import type { AgentBackendKind } from '../../types/chat';

export const IMPLEMENTED_AGENT_BACKENDS: readonly AgentBackendKind[] = ['opencode'];

export type {
  AgentAuthCapability,
  AgentBranchCapability,
  AgentConfigCapability,
  AgentConnectionStatus,
  AgentMcpCapability,
  AgentModelCapability,
  AgentPermissionCapability,
  AgentQuestionCapability,
  AgentService,
  AgentServiceInfo,
  AgentTodoCapability,
  AgentToolCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
export { AgentServiceRegistry } from './AgentServiceRegistry';
export { OpenCodeAdapter } from './OpenCodeAdapter';
