/**
 * Agent backend abstraction layer.
 *
 * This package provides the AgentService interface, the OpenCode adapter,
 * and the registry for managing multiple agent backends.
 */

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
  AgentToolCapability,
  AgentTodoCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';

export { OpenCodeAdapter } from './OpenCodeAdapter';
export { AgentServiceRegistry } from './AgentServiceRegistry';
