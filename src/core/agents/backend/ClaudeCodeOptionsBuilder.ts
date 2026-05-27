import type {
  ClaudeCodeBackendSettings,
  ClaudeCodeEffort,
  ClaudeCodePermissionMode,
  ClaudeCodeSettingSource,
} from '../../types';

/* eslint-disable complexity -- This module is the single audited mapping boundary for Claude Code SDK options. */

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
  onElicitation?: unknown;
  mcpServers?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  sessionStore?: unknown;
  sessionStoreFlush?: 'batched' | 'eager';
  outputFormat?: Record<string, unknown>;
  persistSession?: boolean;
  enableFileCheckpointing?: boolean;
  includeHookEvents?: boolean;
  forwardSubagentText?: boolean;
  agentProgressSummaries?: boolean;
  plugins?: unknown[];
  skills?: string[] | 'all';
  agent?: string;
  agents?: Record<string, unknown>;
  abortController?: AbortController;
  spawnClaudeCodeProcess?: ClaudeCodeSpawnClaudeCodeProcess;
  resumeSessionId?: string;
  fallbackModel?: string;
  /** Diagnostic-only model override. Takes precedence over settings.model. */
  model?: string;
}

export interface ClaudeCodeSdkOptionsShape {
  cwd: string;
  includePartialMessages: true;
  systemPrompt: { type: 'preset'; preset: 'claude_code' };
  tools: { type: 'preset'; preset: 'claude_code' };
  settingSources: ClaudeCodeSettingSource[];
  permissionMode?: ClaudeCodePermissionMode;
  allowDangerouslySkipPermissions?: boolean;
  thinking?: ClaudeCodeSdkThinking;
  effort?: ClaudeCodeEffort;
  model?: string;
  fallbackModel?: string;
  additionalDirectories?: string[];
  pathToClaudeCodeExecutable?: string;
  canUseTool?: unknown;
  onElicitation?: unknown;
  mcpServers?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  sessionStore?: unknown;
  sessionStoreFlush?: 'batched' | 'eager';
  outputFormat?: Record<string, unknown>;
  persistSession?: boolean;
  plugins?: unknown[];
  skills?: string[] | 'all';
  agent?: string;
  agents?: Record<string, unknown>;
  abortController?: AbortController;
  spawnClaudeCodeProcess?: ClaudeCodeSpawnClaudeCodeProcess;
  resume?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  env?: Record<string, string | undefined>;
  enableFileCheckpointing?: boolean;
  includeHookEvents?: boolean;
  forwardSubagentText?: boolean;
  agentProgressSummaries?: boolean;
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
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    tools: { type: 'preset', preset: 'claude_code' },
    settingSources: cloneSettingSources(input.settings.settingSources),
    permissionMode: input.settings.permissionMode,
    thinking: mapThinkingForSdk(input.settings),
    effort: input.settings.effort,
  };
  if (input.settings.permissionMode === 'bypassPermissions') {
    options.allowDangerouslySkipPermissions = true;
  }

  const model = trimOptionalString(input.model)
    ?? trimOptionalString(input.settings.model);
  if (model) {
    options.model = model;
  }
  const fallbackModel = trimOptionalString(input.fallbackModel)
    ?? trimOptionalString(input.settings.fallbackModel);
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
  if (input.onElicitation) {
    options.onElicitation = input.onElicitation;
  }
  if (input.mcpServers && Object.keys(input.mcpServers).length > 0) {
    options.mcpServers = input.mcpServers;
  }
  if (input.hooks && Object.keys(input.hooks).length > 0) {
    options.hooks = input.hooks;
  }
  if (input.sessionStore) {
    options.sessionStore = input.sessionStore;
    if (input.sessionStoreFlush) {
      options.sessionStoreFlush = input.sessionStoreFlush;
    }
  }
  if (input.outputFormat && Object.keys(input.outputFormat).length > 0) {
    options.outputFormat = input.outputFormat;
  }
  if (input.persistSession !== undefined) {
    options.persistSession = input.persistSession;
  }
  if (input.plugins && input.plugins.length > 0) {
    options.plugins = [...input.plugins];
  }
  if (input.skills === 'all') {
    options.skills = 'all';
  } else if (input.skills && input.skills.length > 0) {
    options.skills = [...input.skills];
  }
  const agent = trimOptionalString(input.agent);
  if (agent) {
    options.agent = agent;
  }
  if (input.agents && Object.keys(input.agents).length > 0) {
    options.agents = { ...input.agents };
  }
  if (input.abortController) {
    options.abortController = input.abortController;
  }
  if (input.spawnClaudeCodeProcess) {
    options.spawnClaudeCodeProcess = input.spawnClaudeCodeProcess;
  }
  const resumeSessionId = trimOptionalString(input.resumeSessionId);
  if (resumeSessionId) {
    options.resume = resumeSessionId;
  }
  if (input.settings.allowedTools.length > 0) {
    options.allowedTools = [...input.settings.allowedTools];
  }
  if (input.settings.disallowedTools.length > 0) {
    options.disallowedTools = [...input.settings.disallowedTools];
  }
  if (input.settings.maxTurns !== null) {
    options.maxTurns = input.settings.maxTurns;
  }
  if (input.settings.maxBudgetUsd !== null) {
    options.maxBudgetUsd = input.settings.maxBudgetUsd;
  }
  if (Object.keys(input.settings.env).length > 0) {
    options.env = input.settings.env;
  }
  const shouldEnableFileCheckpointing = input.enableFileCheckpointing === true
    || (input.enableFileCheckpointing !== false && input.settings.enableFileCheckpointing);
  if (shouldEnableFileCheckpointing) {
    options.enableFileCheckpointing = true;
  }
  if (input.includeHookEvents || input.settings.includeHookEvents) {
    options.includeHookEvents = true;
  }
  if (input.forwardSubagentText || input.settings.forwardSubagentText) {
    options.forwardSubagentText = true;
  }
  if (input.agentProgressSummaries || input.settings.agentProgressSummaries) {
    options.agentProgressSummaries = true;
  }

  return options;
}
