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
 * Reference source paths:
 * - `reference-projects/opencode/packages/sdk/js/src/v2/client.ts`
 * - `reference-projects/opencode/packages/sdk/js/src/v2/gen/sdk.gen.ts`
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
