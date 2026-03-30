/**
 * OpenCode SDK wrapper module
 */

export { OpenCodeService } from './OpenCodeService';
export type { SessionActivityStatus } from './OpenCodeService';
export {
  resolveSdkFeatureFlags,
  SDK_FEATURE_FLAG_DISABLED_DEFAULTS,
  SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
} from './sdkFeatureFlags';
export { ServerManager } from './ServerManager';
export type {
  OpenCodeClientConfig,
  OpenCodeServerConfig,
  QueryOptions,
  ResponseHandler,
  SdkFeatureFlags,
  ServerError,
  ServerStatus,
} from './types';
