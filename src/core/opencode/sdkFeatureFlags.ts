/**
 * Internal rollout controls for the OpenCode JS SDK v2 migration.
 *
 * Reference source paths:
 * - `reference-projects/opencode/packages/sdk/js`
 * - `reference-projects/opencode/packages/sdk/js/src/v2`
 */

export interface SdkFeatureFlags {
  sdkCrud: boolean;
  sdkPrompt: boolean;
  sdkStream: boolean;
  sdkAbort: boolean;
  sdkQuestions: boolean;
  sdkSync: boolean;
}

export const SDK_FEATURE_FLAG_DISABLED_DEFAULTS: Readonly<SdkFeatureFlags> = Object.freeze({
  sdkCrud: false,
  sdkPrompt: false,
  sdkStream: false,
  sdkAbort: false,
  sdkQuestions: false,
  sdkSync: false,
});

export const SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS: Readonly<SdkFeatureFlags> = Object.freeze({
  ...SDK_FEATURE_FLAG_DISABLED_DEFAULTS,
  sdkCrud: true,
  sdkPrompt: true,
  sdkStream: true,
  sdkAbort: true,
});

export function resolveSdkFeatureFlags(
  overrides?: Partial<SdkFeatureFlags>,
  defaults: Readonly<SdkFeatureFlags> = SDK_FEATURE_FLAG_DISABLED_DEFAULTS,
): SdkFeatureFlags {
  return {
    ...defaults,
    ...(overrides ?? {}),
  };
}
