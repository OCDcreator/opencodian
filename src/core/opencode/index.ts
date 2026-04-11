/**
 * OpenCode SDK wrapper module
 */

export type { SessionActivityStatus, SessionSyncEventUpdate } from './OpenCodeService';
export { OpenCodeService } from './OpenCodeService';
export {
  OpenCodeSdkFacade,
  SDK_FACADE_NAMESPACE_NAMES,
} from './OpenCodeSdkFacade';
export type {
  OpenCodeSdkFacadeClient,
  OpenCodeSdkFacadeNamespace,
  OpenCodeSdkNamespaceName,
} from './OpenCodeSdkFacade';
export {
  resolveSdkFeatureFlags,
  SDK_FEATURE_FLAG_DISABLED_DEFAULTS,
  SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
} from './sdkFeatureFlags';
export { ServerManager } from './ServerManager';
export type {
  LocalJsonSchemaOutputFormat,
  LocalOutputFormat,
  LocalTextOutputFormat,
  OpenCodeClientConfig,
  OpenCodeCapabilitySnapshot,
  OpenCodeServerConfig,
  McpServerSnapshot,
  McpServerStatus,
  QueryOptions,
  ResponseHandler,
  SdkEventEnvelope,
  SdkFeatureFlags,
  ServerDiagnostics,
  ServerDiagnosticReason,
  ServerError,
  ServerStatus,
  ToolCatalogEntry,
  ToolCatalogSnapshot,
} from './types';
