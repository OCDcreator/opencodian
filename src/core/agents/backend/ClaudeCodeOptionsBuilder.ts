import type {
  ClaudeCodeBackendSettings,
  ClaudeCodeEffort,
  ClaudeCodePermissionMode,
  ClaudeCodeSettingSource,
} from '../../types';

export interface ClaudeCodeSpawnRequest {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
}

export interface ClaudeCodeSpawnedProcess {
  stdin: unknown;
  stdout: unknown;
  readonly killed: boolean;
  readonly exitCode: number | null;
  kill(signal: NodeJS.Signals): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  once(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

export type ClaudeCodeSpawnClaudeCodeProcess = (
  request: ClaudeCodeSpawnRequest,
) => ClaudeCodeSpawnedProcess;

export type ClaudeCodeSdkThinking =
  | { type: 'adaptive' }
  | { type: 'disabled' }
  | { type: 'enabled'; budgetTokens: number };

export interface ClaudeCodeOptionsBuilderInput {
  vaultPath: string;
  settings: ClaudeCodeBackendSettings;
  pathToClaudeCodeExecutable?: string;
  canUseTool?: unknown;
  mcpServers?: Record<string, unknown>;
  abortController?: AbortController;
  spawnClaudeCodeProcess?: ClaudeCodeSpawnClaudeCodeProcess;
}

export interface ClaudeCodeSdkOptionsShape {
  cwd: string;
  includePartialMessages: true;
  settingSources: ClaudeCodeSettingSource[];
  permissionMode?: ClaudeCodePermissionMode;
  thinking?: ClaudeCodeSdkThinking;
  effort?: ClaudeCodeEffort;
  model?: string;
  fallbackModel?: string;
  additionalDirectories?: string[];
  pathToClaudeCodeExecutable?: string;
  canUseTool?: unknown;
  mcpServers?: Record<string, unknown>;
  abortController?: AbortController;
  spawnClaudeCodeProcess?: ClaudeCodeSpawnClaudeCodeProcess;
}

function cloneSettingSources(sources: readonly ClaudeCodeSettingSource[]): ClaudeCodeSettingSource[] {
  return [...sources];
}

function trimOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function mapThinkingForSdk(settings: ClaudeCodeBackendSettings): ClaudeCodeSdkThinking {
  if (settings.thinking.type === 'fixed') {
    return {
      type: 'enabled',
      budgetTokens: settings.thinking.budgetTokens,
    };
  }
  return settings.thinking;
}

export function buildClaudeCodeOptions(
  input: ClaudeCodeOptionsBuilderInput,
): ClaudeCodeSdkOptionsShape {
  const executablePath =
    trimOptionalString(input.pathToClaudeCodeExecutable)
    ?? trimOptionalString(input.settings.executablePath);
  const additionalDirectories = [...input.settings.additionalDirectories];
  const options: ClaudeCodeSdkOptionsShape = {
    cwd: input.vaultPath,
    includePartialMessages: true,
    settingSources: cloneSettingSources(input.settings.settingSources),
    permissionMode: input.settings.permissionMode,
    thinking: mapThinkingForSdk(input.settings),
    effort: input.settings.effort,
  };

  const model = trimOptionalString(input.settings.model);
  if (model) {
    options.model = model;
  }
  const fallbackModel = trimOptionalString(input.settings.fallbackModel);
  if (fallbackModel) {
    options.fallbackModel = fallbackModel;
  }
  if (additionalDirectories.length > 0) {
    options.additionalDirectories = additionalDirectories;
  }
  if (executablePath) {
    options.pathToClaudeCodeExecutable = executablePath;
  }
  if (input.canUseTool) {
    options.canUseTool = input.canUseTool;
  }
  if (input.mcpServers && Object.keys(input.mcpServers).length > 0) {
    options.mcpServers = input.mcpServers;
  }
  if (input.abortController) {
    options.abortController = input.abortController;
  }
  if (input.spawnClaudeCodeProcess) {
    options.spawnClaudeCodeProcess = input.spawnClaudeCodeProcess;
  }

  return options;
}
