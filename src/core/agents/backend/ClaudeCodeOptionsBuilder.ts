import {
  type ClaudeCodeBackendSettings,
  type ClaudeCodeEffort,
  type ClaudeCodePermissionMode,
  type ClaudeCodeSettingSource,
  normalizeClaudeCodeToolAliases,
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
  promptSuggestions?: boolean;
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
  /** Custom session title. Passed to SDK options.title; only effective on first query (not resume). */
  title?: string;
  /** Diagnostic-only stderr callback. Receives raw stderr text from the Claude Code subprocess. */
  stderr?: (data: string) => void;
  /** Diagnostic-only explicit session id. Passed to SDK options.sessionId. */
  sessionId?: string;
  /** Diagnostic-only continue flag. When true, asks the SDK to continue the most recent conversation. */
  continue?: boolean;
  /** Diagnostic-only resume-at message UUID. When provided with resume, asks the SDK to resume only up to this message. */
  resumeSessionAt?: string;
  /** Diagnostic-only fork-on-resume flag. When true AND resume is provided, asks the SDK to fork into a new session. */
  forkSession?: boolean;
}

export interface ClaudeCodeSdkOptionsShape {
  cwd: string;
  includePartialMessages: true;
  systemPrompt: { type: 'preset'; preset: 'claude_code'; append?: string };
  tools: string[] | { type: 'preset'; preset: 'claude_code' };
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
  taskBudget?: { total: number };
  env?: Record<string, string | undefined>;
  enableFileCheckpointing?: boolean;
  includeHookEvents?: boolean;
  forwardSubagentText?: boolean;
  agentProgressSummaries?: boolean;
  /** Ask the SDK to emit predicted next-user-prompt suggestions after each turn. */
  promptSuggestions?: boolean;
  sandbox?: {
    enabled: boolean;
    failIfUnavailable?: boolean;
    autoAllowBashIfSandboxed?: boolean;
    excludedCommands?: string[];
    allowUnsandboxedCommands?: boolean;
    filesystem?: {
      allowWrite?: string[];
      denyWrite?: string[];
      denyRead?: string[];
    };
    network?: {
      allowedDomains?: string[];
      deniedDomains?: string[];
    };
    enableWeakerNestedSandbox?: boolean;
    enableWeakerNetworkIsolation?: boolean;
    ripgrep?: {
      command: string;
      args?: string[];
    };
  };
  /** Custom session title. SDK skips automatic title generation when provided. */
  title?: string;
  /** Custom instructions injected into the plan-mode system reminder when permissionMode is `plan`. */
  planModeInstructions?: string;
  /** Tool name aliases passed as the SDK `toolAliases` option. Maps model-emitted tool names to canonical tool names before resolution. */
  toolAliases?: Record<string, string>;
  /** Ask the SDK to include a preview for each AskUserQuestion option in the specified format. */
  toolConfig?: {
    askUserQuestion?: {
      previewFormat?: 'markdown' | 'html';
    };
  };
  /** Ask the SDK to emit CLI debug logs during query execution. */
  debug?: boolean;
  /** Ask the SDK to write CLI debug logs to a file path. */
  debugFile?: string;
  /** Enforce strict validation of MCP server configurations. */
  strictMcpConfig?: boolean;
  /** Diagnostic-only stderr callback. Receives raw stderr text from the Claude Code subprocess. */
  stderr?: (data: string) => void;
  /** Diagnostic-only explicit session id. Passed to SDK options.sessionId. */
  sessionId?: string;
  /** Diagnostic-only continue flag. When true, asks the SDK to continue the most recent conversation. */
  continue?: boolean;
  /** Diagnostic-only resume-at message UUID. When provided with resume, asks the SDK to resume only up to this message. */
  resumeSessionAt?: string;
  /** Diagnostic-only fork-on-resume flag. When true AND resume is provided, asks the SDK to fork into a new session. */
  forkSession?: boolean;
  /** Requested beta features passed as the SDK `betas` option. */
  betas?: string[];
  /** Requested JavaScript runtime for the Claude Code subprocess. */
  executable?: 'node' | 'bun' | 'deno';
  /** Load timeout in milliseconds for the Claude Code subprocess initialization. */
  loadTimeoutMs?: number;
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
  const systemPrompt = trimOptionalString(input.settings.systemPrompt);
  const options: ClaudeCodeSdkOptionsShape = {
    cwd: input.vaultPath,
    includePartialMessages: true,
    systemPrompt: systemPrompt
      ? { type: 'preset', preset: 'claude_code', append: systemPrompt }
      : { type: 'preset', preset: 'claude_code' },
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
  if (input.settings.restrictedBuiltinTools.length > 0) {
    options.tools = [...input.settings.restrictedBuiltinTools];
  }
  if (input.settings.maxTurns !== null) {
    options.maxTurns = input.settings.maxTurns;
  }
  if (input.settings.maxBudgetUsd !== null) {
    options.maxBudgetUsd = input.settings.maxBudgetUsd;
  }
  if (input.settings.taskBudget !== null) {
    options.taskBudget = { total: input.settings.taskBudget };
  }
  if (Object.keys(input.settings.env).length > 0) {
    options.env = { ...input.settings.env };
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
  if (input.promptSuggestions || input.settings.promptSuggestions) {
    options.promptSuggestions = true;
  }
  if (input.settings.sandbox.enabled) {
    const sandbox: NonNullable<ClaudeCodeSdkOptionsShape['sandbox']> = { enabled: true };
    if (input.settings.sandbox.failIfUnavailable) {
      sandbox.failIfUnavailable = true;
    }
    if (input.settings.sandbox.autoAllowBashIfSandboxed) {
      sandbox.autoAllowBashIfSandboxed = true;
    }
    // Advanced sandbox sub-policies
    if (input.settings.sandbox.excludedCommands.length > 0) {
      sandbox.excludedCommands = [...input.settings.sandbox.excludedCommands];
    }
    // allowUnsandboxedCommands defaults to true in SDK; only send when explicitly false
    if (!input.settings.sandbox.allowUnsandboxedCommands) {
      sandbox.allowUnsandboxedCommands = false;
    }
    // Filesystem sub-policy
    const fs = input.settings.sandbox.filesystem;
    if (fs.allowWrite.length > 0 || fs.denyWrite.length > 0 || fs.denyRead.length > 0) {
      sandbox.filesystem = {};
      if (fs.allowWrite.length > 0) {
        sandbox.filesystem.allowWrite = [...fs.allowWrite];
      }
      if (fs.denyWrite.length > 0) {
        sandbox.filesystem.denyWrite = [...fs.denyWrite];
      }
      if (fs.denyRead.length > 0) {
        sandbox.filesystem.denyRead = [...fs.denyRead];
      }
    }
    // Network sub-policy
    const net = input.settings.sandbox.network;
    if (net.allowedDomains.length > 0 || net.deniedDomains.length > 0) {
      sandbox.network = {};
      if (net.allowedDomains.length > 0) {
        sandbox.network.allowedDomains = [...net.allowedDomains];
      }
      if (net.deniedDomains.length > 0) {
        sandbox.network.deniedDomains = [...net.deniedDomains];
      }
    }
    // Weaker sandbox options
    if (input.settings.sandbox.enableWeakerNestedSandbox) {
      sandbox.enableWeakerNestedSandbox = true;
    }
    if (input.settings.sandbox.enableWeakerNetworkIsolation) {
      sandbox.enableWeakerNetworkIsolation = true;
    }
    // Custom ripgrep
    const rg = input.settings.sandbox.ripgrep;
    if (rg.command.trim().length > 0) {
      sandbox.ripgrep = { command: rg.command.trim() };
      if (rg.args.length > 0) {
        sandbox.ripgrep.args = [...rg.args];
      }
    }
    options.sandbox = sandbox;
  }
  if (input.title && input.title.trim()) {
    options.title = input.title.trim();
  }
  const planModeInstructions = trimOptionalString(input.settings.planModeInstructions);
  if (planModeInstructions) {
    options.planModeInstructions = planModeInstructions;
  }
  const toolAliases = normalizeClaudeCodeToolAliases(input.settings.toolAliases);
  if (Object.keys(toolAliases).length > 0) {
    options.toolAliases = { ...toolAliases };
  }
  const previewFormat = input.settings.askUserQuestionPreviewFormat;
  if (previewFormat === 'markdown' || previewFormat === 'html') {
    options.toolConfig = {
      askUserQuestion: { previewFormat },
    };
  }
  if (input.settings.debug === true) {
    options.debug = true;
  }
  const debugFile = trimOptionalString(input.settings.debugFile);
  if (debugFile) {
    options.debugFile = debugFile;
  }
  if (input.settings.strictMcpConfig === true) {
    options.strictMcpConfig = true;
  }
  if (input.stderr) {
    options.stderr = input.stderr;
  }
  if (input.sessionId) {
    options.sessionId = input.sessionId;
  }
  if (input.continue === true) {
    options.continue = true;
  }
  if (input.resumeSessionAt) {
    options.resumeSessionAt = input.resumeSessionAt;
  }
  if (input.forkSession === true) {
    options.forkSession = true;
  }
  if (input.settings.enableContext1mBeta === true) {
    options.betas = ['context-1m-2025-08-07'];
  }
  const jsRuntime = trimOptionalString(input.settings.jsRuntime);
  if (jsRuntime) {
    options.executable = jsRuntime as 'node' | 'bun' | 'deno';
  }
  if (input.settings.loadTimeoutMs !== null) {
    options.loadTimeoutMs = input.settings.loadTimeoutMs;
  }

  return options;
}
