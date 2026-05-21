/**
 * Loads the official Claude Agent SDK behind OpenCodian's small facade.
 */

import type { ClaudeCodeSdkFacade } from './ClaudeCodeAdapter';

export interface ClaudeAgentSdkModule {
  query: ClaudeCodeSdkFacade['query'];
  listSessions?: NonNullable<ClaudeCodeSdkFacade['listSessions']>;
  getSessionInfo?: NonNullable<ClaudeCodeSdkFacade['getSessionInfo']>;
  forkSession?: NonNullable<ClaudeCodeSdkFacade['forkSession']>;
  renameSession?: NonNullable<ClaudeCodeSdkFacade['renameSession']>;
}

export type ClaudeAgentSdkImporter = () => Promise<ClaudeAgentSdkModule>;

export interface ClaudeCodeSdkLoaderOptions {
  importer?: ClaudeAgentSdkImporter;
}

const officialClaudeAgentSdkImporter: ClaudeAgentSdkImporter = async () => {
  return import('@anthropic-ai/claude-agent-sdk') as Promise<ClaudeAgentSdkModule>;
};

export async function loadClaudeCodeSdk(
  optionsOrImporter: ClaudeCodeSdkLoaderOptions | ClaudeAgentSdkImporter = {},
): Promise<ClaudeCodeSdkFacade> {
  const options: ClaudeCodeSdkLoaderOptions = typeof optionsOrImporter === 'function'
    ? { importer: optionsOrImporter }
    : optionsOrImporter;
  const importer = options.importer ?? officialClaudeAgentSdkImporter;
  const sdk = await importer();
  return {
    query: (input) => sdk.query({
      prompt: input.prompt,
      options: input.options,
    }),
    ...(sdk.listSessions ? { listSessions: sdk.listSessions } : {}),
    ...(sdk.getSessionInfo ? { getSessionInfo: sdk.getSessionInfo } : {}),
    ...(sdk.forkSession ? { forkSession: sdk.forkSession } : {}),
    ...(sdk.renameSession ? { renameSession: sdk.renameSession } : {}),
  };
}
