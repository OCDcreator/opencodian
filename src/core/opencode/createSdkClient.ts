import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';

import type { OpenCodeTraceContext, OpenCodeTracePort } from './diagnostics';
import { createSdkFetch } from './sdkFetch';
import type { SdkOpencodeClient, SdkOpencodeClientConfig } from './sdkTypes';

export interface CreateSdkClientOptions {
  baseUrl: string;
  authHeaders?: Record<string, string>;
  directory?: string;
  experimentalWorkspaceId?: string;
  fetchImpl?: typeof fetch;
  tracePort?: OpenCodeTracePort;
  traceContext?: OpenCodeTraceContext;
}

/**
 * Create an OpenCode JS SDK v2 client for the plugin runtime.
 *
 * Reference source (official upstream, pinned to the plugin's `@opencode-ai/sdk`
 * 1.19.5 tag on the legacy `v1` branch; this v2-generation client still targets
 * the v1 server's `/api/*` routes):
 * - https://github.com/anomalyco/opencode/blob/v1.19.5/packages/sdk/js/src/v2/client.ts
 * - https://github.com/anomalyco/opencode/blob/v1.19.5/packages/sdk/js/src/v2/gen/sdk.gen.ts
 */
export function createSdkClient(options: CreateSdkClientOptions): SdkOpencodeClient {
  const config: SdkOpencodeClientConfig & {
    directory?: string;
    experimental_workspaceID?: string;
  } = {
    baseUrl: options.baseUrl as `${string}://${string}`,
    directory: options.directory,
    experimental_workspaceID: options.experimentalWorkspaceId,
    fetch: options.fetchImpl ?? createSdkFetch({
      tracePort: options.tracePort,
      traceContext: options.traceContext,
    }),
    headers: options.authHeaders,
    responseStyle: 'data',
    throwOnError: true,
  };

  return createOpencodeClient(config);
}
