/**
 * Settings type definitions for OpenCodian
 */

import {
  CLAUDE_CODE_DEBUG_CHANNEL_IDS,
  type ClaudeCodeDebugChannelId,
  type ClaudeCodeDebugChannelSettings,
  type DebugModuleSettings,
  getDefaultClaudeCodeDebugChannelSettings,
  getDefaultDebugModuleSettings,
  getEnabledClaudeCodeDebugChannels,
  normalizeClaudeCodeDebugChannelSettings,
  normalizeDebugModuleSettings,
  normalizeDebugRefreshIntervalMs,
} from '../../shared/debugModules';
import type { OpenCodeCapabilitySettings } from '../opencode/OpenCodeCapabilitySettingsMigration';
import type { PluginUpdatePersistedState } from '../update/PluginUpdateService';
import type { AgentBackendKind } from './chat';
import type { ModelPricingOverride } from './pricing';

/** Permission mode for tool execution */
export type PermissionMode = 'yolo' | 'plan' | 'normal';

/** Effort level for adaptive thinking models */
export type EffortLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export function normalizeCapabilityLabSelectedBackend(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/** Thinking budget for custom models */
export type ThinkingBudget = 0 | 1024 | 4096 | 8192 | 16384;

export type ClaudeCodeSettingSource = 'user' | 'project' | 'local';
export type ClaudeCodePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
export type ClaudeCodeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ClaudeCodeThinking =
  | { type: 'adaptive' }
  | { type: 'disabled' }
  | { type: 'fixed'; budgetTokens: number };
export {
  CLAUDE_CODE_DEBUG_CHANNEL_IDS,
  type ClaudeCodeDebugChannelId,
  type ClaudeCodeDebugChannelSettings,
  getDefaultClaudeCodeDebugChannelSettings,
  getEnabledClaudeCodeDebugChannels,
  normalizeClaudeCodeDebugChannelSettings,
};

/** A project-scoped Anthropic-compatible provider profile. */
export interface ClaudeProviderPreset {
  /** Stable local identifier. The built-in profile always uses `official`. */
  id: string;
  name: string;
  baseUrl: string;
  authToken: string;
  model: string;
  /** Optional single fallback model, written as the Claude settings array shape. Readback covers settings projection only; automatic fallback switching remains unverified. */
  fallbackModel: string;
  haikuModel: string;
  extraEnv: Record<string, string>;
}

/** Persisted state for the project-level provider preset surface. */
export interface ClaudeProviderSettings {
  presets: ClaudeProviderPreset[];
  activePresetId: string;
  /** Extra environment keys owned by the last successful preset apply. */
  lastAppliedManagedEnvKeys: string[];
  /** Guards the one-time migration from legacy plugin model fields. */
  modelMigrationDone: boolean;
}

/** Environment keys which are controlled by dedicated provider fields. */
export const CLAUDE_PROVIDER_MANAGED_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;

/** Immutable built-in restore target. Always materialize a fresh copy before persisting. */
export const CLAUDE_OFFICIAL_PROVIDER_PRESET: Readonly<ClaudeProviderPreset> = Object.freeze({
  id: 'official',
  name: 'Anthropic Official',
  baseUrl: '',
  authToken: '',
  model: '',
  fallbackModel: '',
  haikuModel: '',
  extraEnv: {},
});

export function getDefaultClaudeProviderSettings(): ClaudeProviderSettings {
  return {
    presets: [{ ...CLAUDE_OFFICIAL_PROVIDER_PRESET, extraEnv: {} }],
    activePresetId: 'official',
    lastAppliedManagedEnvKeys: [],
    modelMigrationDone: false,
  };
}

export interface SandboxFilesystemConfig {
  /** Additional paths where sandboxed commands can write. Merged across all settings scopes. */
  allowWrite: string[];
  /** Paths where sandboxed commands cannot write. Merged across all settings scopes. */
  denyWrite: string[];
  /** Paths where sandboxed commands cannot read. Merged across all settings scopes. */
  denyRead: string[];
}

export interface SandboxNetworkConfig {
  /** Domain names that sandboxed processes can access. Supports wildcards. */
  allowedDomains: string[];
  /** Domain names that sandboxed processes cannot access. Takes precedence over allowedDomains. */
  deniedDomains: string[];
}

export interface SandboxRipgrepConfig {
  /** Custom ripgrep binary command path for sandbox environments. */
  command: string;
  /** Optional extra arguments for the custom ripgrep binary. */
  args: string[];
}

export interface ClaudeCodeSandboxSettings {
  enabled: boolean;
  failIfUnavailable: boolean;
  autoAllowBashIfSandboxed: boolean;
  /** Commands that always bypass sandbox restrictions (e.g. ['docker']). These run unsandboxed automatically without model involvement. */
  excludedCommands: string[];
  /** Allow the model to request running commands outside the sandbox via dangerouslyDisableSandbox. When false, the escape hatch is completely disabled. Default: true (SDK default). */
  allowUnsandboxedCommands: boolean;
  /** Filesystem sub-policy for sandbox mode. Controls read/write path restrictions at the OS level. */
  filesystem: SandboxFilesystemConfig;
  /** Network sub-policy for sandbox mode. Controls outbound domain access. */
  network: SandboxNetworkConfig;
  /** Enable weaker sandbox for unprivileged Docker environments (Linux/WSL2 only). Reduces security. Default: false. */
  enableWeakerNestedSandbox: boolean;
  /** (macOS only) Allow access to the system TLS trust service in the sandbox. Required for Go-based tools with MITM proxy. Reduces security. Default: false. */
  enableWeakerNetworkIsolation: boolean;
  /** Custom ripgrep binary configuration for sandbox environments. */
  ripgrep: SandboxRipgrepConfig;
}

/**
 * Codex backend settings.
 *
 * Minimal shape: only fields that are genuinely wired through to the Codex
 * SDK adapter and runtime-proven. Fields not yet wired remain hidden/readback.
 */
/** Sandbox mode for Codex CLI. Matches SDK's SandboxMode type. */
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/** Reasoning effort for Codex CLI. Matches SDK's ModelReasoningEffort type. */
export type CodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** Web search mode for Codex CLI. Matches SDK's WebSearchMode type. */
export type CodexWebSearchMode = 'disabled' | 'cached' | 'live';

/**
 * Approval policy for Codex, surfaced at the plugin/settings layer.
 *
 *   - inherit:    plugin-only; omits approvalPolicy from app-server/SDK
 *                 overrides so the backend uses its own default policy.
 *   - untrusted:  requires an available app-server AND an approval bridge;
 *                 fails closed if either is unavailable.
 *   - on-request: same availability requirement as untrusted.
 *   - never:      may use the existing SDK fallback path.
 *
 * The on-failure/granular SDK variants are intentionally NOT in P0; they
 * remain a future advanced-TOML concern. The app-server wire union stays
 * 'untrusted' | 'on-request' | 'never'.
 */
export type CodexApprovalPolicy = 'inherit' | 'untrusted' | 'on-request' | 'never';

export interface CodexBackendSettings {
  /** OpenAI API key. Falls back to OPENAI_API_KEY env var / Codex CLI login. */
  apiKey: string;
  /** Model name passed as ThreadOptions.model → SDK --model CLI arg. Empty string = SDK default. */
  model: string;
  /**
   * Optional pricing-provider alias for a custom Codex model provider. This
   * only identifies rates; Codex connection configuration stays in config.toml.
   */
  pricingProviderId: string;
  /** Optional pricing endpoint identity for a Codex proxy or reseller. Does not change traffic. */
  pricingEndpoint: string;
  /** Sandbox mode passed as ThreadOptions.sandboxMode → SDK --sandbox CLI arg. */
  sandboxMode: CodexSandboxMode;
  /** Reasoning effort passed as ThreadOptions.modelReasoningEffort → SDK --config CLI arg. */
  modelReasoningEffort: CodexReasoningEffort;
  /** Additional directories passed as ThreadOptions.additionalDirectories → SDK --add-dir per path. Newline-separated in settings. */
  additionalDirectories: string;
  /** Network access passed as ThreadOptions.networkAccessEnabled → SDK --config CLI arg. Only meaningful with workspace-write sandbox. */
  networkAccessEnabled: boolean;
  /** Web search mode passed as ThreadOptions.webSearchMode → SDK --config CLI arg. */
  webSearchMode: CodexWebSearchMode;
  /**
   * Approval policy. Defaults to 'inherit' (omit the override). Missing or
   * unknown values normalize to 'inherit'; old users are NOT migrated to
   * on-request.
   */
  approvalPolicy: CodexApprovalPolicy;
}

export interface ClaudeCodeBackendSettings {
  executablePath: string;
  settingSources: ClaudeCodeSettingSource[];
  permissionMode: ClaudeCodePermissionMode;
  thinking: ClaudeCodeThinking;
  effort: ClaudeCodeEffort;
  additionalDirectories: string[];
  model: string;
  /** Optional pricing-provider alias for an ANTHROPIC_BASE_URL-compatible gateway. */
  pricingProviderId: string;
  /** Optional pricing endpoint identity. It is not forwarded to Claude Code. */
  pricingEndpoint: string;
  /** Fallback model used when the main model is unavailable. Readback only: option wiring and same-model validation proven; automatic fallback switching not locally provable (blocked on real API overload / HTTP 529; invalid-primary test undermined). */
  fallbackModel: string;
  /** Project-level Anthropic-compatible provider presets. */
  providers: ClaudeProviderSettings;
  /** Tool names that are auto-allowed without prompting. Not a sandbox, not a restrictor. Readback only: runtime options wiring proven, zero enforcement observed (init catalog always unfiltered, canUseTool non-functional in SDK query() mode). Validated as PascalCase alphanumeric. */
  allowedTools: string[];
  /** Tool names that are removed from context entirely. Runtime behavior verified: SDK init-catalog filtering deterministically excludes listed tools. Validated as PascalCase alphanumeric. */
  disallowedTools: string[];
  /**
   * Built-in tool whitelist passed as the SDK `tools` option. When non-empty,
   * only the listed built-in Claude Code tools are available to the model.
   * MCP tools are NOT restricted by this setting — they always pass through.
   * Empty array = use the SDK default preset (all built-in tools).
   * Validated as PascalCase alphanumeric.
   */
  restrictedBuiltinTools: string[];
  /** Maximum conversation turns before the query stops. Runtime behavior verified: SDK emits error_max_turns signal when limit reached. null = unlimited (SDK default). */
  maxTurns: number | null;
  /** Maximum budget in USD before the query stops. Runtime behavior verified: SDK emits error_max_budget_usd signal when limit reached. null = unlimited (SDK default). */
  maxBudgetUsd: number | null;
  /** Maximum task-level token budget. Readback only: SDK @alpha option wiring proven (--task-budget CLI flag, output_config.task_budget + beta header). Behavioral pacing only (no structured enforcement signal like error_max_turns). null = unlimited (SDK default). */
  taskBudget: number | null;
  /** Environment variables to pass to the Claude Code process. Runtime behavior verified: env propagation into Claude/Bash subprocesses proven (Layer 1-4). */
  env: Record<string, string>;
  /** Enable Claude Code SDK file checkpoint tracking for later rewind operations. @experimental — SDK option wired but checkpoints never created in query() mode (upstream bug #236). Readback only; no stable rewind UI. */
  enableFileCheckpointing: boolean;
  /** Ask the SDK to include hook lifecycle events in the stream. @diagnostic — Diagnostic event stream only; not connected to stable UI. */
  includeHookEvents: boolean;
  /** Forward subagent text/thinking blocks into the parent stream. @diagnostic — Diagnostic event stream only; not connected to stable UI. */
  forwardSubagentText: boolean;
  /** Ask the SDK to emit periodic subagent progress summaries. @diagnostic — Diagnostic event stream only; not connected to stable UI. */
  agentProgressSummaries: boolean;
  /** Ask the SDK to emit predicted next-user-prompt suggestions after each completed turn.
   * Readback only: SDK options wiring proven; end-to-end chat UI delivery is not independently
   * live-verified. The plugin routes suggestion chunks through the normalizer + StreamChunkRouter
   * pipeline, but whether suggestions actually appear depends on model behavior, API state, and
   * SDK version. Suggestions may be suppressed on first turn, after API errors, in plan mode, or
   * by env var. Never auto-sent — only inserted into composer on explicit user click. */
  promptSuggestions: boolean;
  /** Product workbench debug channels for future Claude Code logging routes. */
  debugChannels: ClaudeCodeDebugChannelSettings;
  /**
   * Sandbox behavior controls for Claude Code subprocess isolation.
   * Readback: SDK options wiring proven; OS-level process isolation not independently verified.
   *
   * Advanced sub-policies (exposed expert settings wired to SDK options, user-facing in
   * Permissions tab):
   * - excludedCommands, allowUnsandboxedCommands
   * - filesystem: allowWrite, denyWrite, denyRead
   * - network domain filters: allowedDomains, deniedDomains
   * - enableWeakerNestedSandbox, enableWeakerNetworkIsolation
   * - ripgrep: command, args
   *
   * Managed-only fields intentionally UNEXPOSED official SDK fields and reasons:
   * - filesystem.allowRead: re-allows reads inside denyRead regions; confusing semantics for
   *   general users, easy to misconfigure into false sense of security
   * - filesystem.allowManagedReadPathsOnly: managed-settings-only (enterprise); SDK docs state
   *   "Has no effect when set via SDK options"
   * - network.allowManagedDomainsOnly: managed-settings-only (enterprise); SDK docs state
   *   "Has no effect when set via SDK options"
   * - network.allowUnixSockets: macOS-only; misleading on Linux/WSL2 where seccomp cannot
   *   inspect socket paths
   * - network.allowAllUnixSockets: grants all Unix socket access (including Docker socket);
   *   too dangerous for general plugin exposure, opens full host access path
   * - network.allowLocalBinding: macOS-only; platform-specific in misleading way for a
   *   cross-platform plugin
   * - network.allowMachLookup: macOS-only XPC/Mach service lookup; extremely niche,
   *   iOS Simulator / Playwright specific
   * - network.httpProxyPort: advanced proxy config; users who need this should configure
   *   via .claude/settings.json directly
   * - network.socksProxyPort: same as httpProxyPort — advanced proxy config
   * - ignoreViolations: suppresses security violation reports; dangerous, hides real sandbox
   *   escape evidence from the user
   * - bwrapPath: managed-settings-only (enterprise); only honored from managed settings,
   *   not user/project/local
   * - socatPath: managed-settings-only (enterprise); same scope limitation as bwrapPath
   */
  sandbox: ClaudeCodeSandboxSettings;
  /**
   * Custom instructions injected into the plan-mode system reminder when `permissionMode` is `plan`.
   * Replaces the default code-implementation workflow body; the SDK still enforces the read-only
   * preamble and ExitPlanMode protocol footer. Effect applies to the next query or restarted session.
   * Readback only: SDK option wiring proven; actual plan-mode behavior is not independently verified.
   */
  planModeInstructions: string;
  /**
   * Tool name aliases passed as the SDK `toolAliases` option. Maps model-emitted tool names
   * to canonical tool names before resolution. Applies to the next query or restarted session only.
   * Readback only: SDK option wiring proven; actual alias resolution behavior is not independently verified.
   */
  toolAliases: Record<string, string>;
  /**
   * Request the SDK to include a preview for each AskUserQuestion option in the specified format
   * ('markdown' or 'html'). The plugin preserves and displays preview text safely as plain text;
   * rich HTML rendering is disabled for security. Empty string means do not request previews
   * (SDK default). Applies to the next query or restarted session only.
   * Readback only: SDK option wiring and UI rendering path are proven; actual preview arrival
   * depends on the SDK version and model behavior and is not independently verified.
   */
  askUserQuestionPreviewFormat: 'markdown' | 'html' | '';
  /**
   * Ask the SDK to emit CLI debug logs during query execution.
   * Readback only: SDK option wiring proven; actual CLI debug log emission is not independently
   * verified from the plugin layer. The plugin passes the option — whether the CLI binary
   * actually produces debug output depends on the SDK/CLI version and runtime conditions.
   */
  debug: boolean;
  /**
   * Enforce strict validation of MCP server configurations.
   * When true, invalid MCP configurations will cause errors instead of warnings.
   * Readback only: SDK propagates this as --strict-mcp-config CLI flag; actual
   * validation lives in the compiled CLI binary, not the SDK wrapper. No structured
   * signal confirms whether strict validation was applied. The plugin-side adapter
   * silently drops structurally malformed entries, so many malformed configs never
   * reach the CLI. Applies to next query or restarted session only.
   * Does not write .claude/mcp.json or provide MCP authoring UI.
   */
  strictMcpConfig: boolean;
  /**
   * Request the SDK 'context-1m-2025-08-07' beta header for 1M context window support.
   * Readback only: SDK option wiring proven; actual beta availability depends on the
   * selected model and Anthropic-side behavior. Plugin-side behavior is not independently
   * verified. No generic beta management is exposed — only this single documented beta.
   * Applies to next query or restarted session only.
   */
  enableContext1mBeta: boolean;
  /**
   * Ask the SDK to write CLI debug logs to a file path.
   * Readback only: SDK option wiring proven; actual file writing is not independently
   * verified from the plugin layer. Setting a debug file path implicitly enables debug
   * logging even if the debug toggle is off. Applies to next query or restarted session only.
   * No plugin-side path validation or filesystem writes are performed.
   */
  debugFile: string;
  /**
   * Request the SDK to use a specific JavaScript runtime ('node', 'bun', or 'deno').
   * Empty string means auto — leave runtime selection to the SDK.
   * Readback only: SDK option wiring proven; actual runtime selection behavior is not
   * independently verified from the plugin layer. No observable signal in init events,
   * stderr, or tool output confirms which runtime the CLI subprocess actually uses.
   * The model runs remotely and cannot inspect the local subprocess's process.execPath.
   * Host PATH checks only prove installation, not actual runtime selection.
   * executablePath/ProcessResolver is a separate capability about Claude binary resolution.
   * No runtime argument management is exposed (executableArgs / extraArgs remain absent).
   * Applies to next query or restarted session only.
   */
  jsRuntime: 'node' | 'bun' | 'deno' | '';
  /**
   * Maximum time in milliseconds for sessionStore.listSessions() during resume/continue
   * materialization. SDK only uses this when (resume || continue) && sessionStore is true.
   * null means use the SDK default (60000ms). @alpha.
   * Readback only: option wiring proven; timeout code path never executes without
   * resume/continue + sessionStore, which the diagnostic path does not use.
   * Applies to next query or restarted session only.
   */
  loadTimeoutMs: number | null;
  /**
   * Claude Code output style name. Modifies the system prompt via the SDK `settings`
   * option. Official built-in styles include `Default`, `Proactive`, `Explanatory`,
   * and `Learning`. Custom styles can be created as markdown files in
   * `.claude/output-styles` or `~/.claude/output-styles`.
   * Live proof boundary: a temporary custom style file can influence a fresh
   * diagnostic query through SDK settings.outputStyle when the model recalls a
   * nonce that is absent from the user prompt. This does not prove active-session
   * live mutation or validate the currently saved style name. Official docs say
   * output styles are read at session start and apply after `/clear` or a new
   * session; existing active or resumed sessions may keep their previous prompt.
   */
  outputStyle: string;
  /**
   * Custom instructions appended to the Claude Code preset system prompt.
   * When non-empty, the SDK receives the preset-with-append shape:
   * `{ type: 'preset', preset: 'claude_code', append: instructions }`.
   * When empty, the default `{ type: 'preset', preset: 'claude_code' }` is used.
   * This is an append-only seam — it does NOT replace the official preset.
   * Readback only: SDK option wiring proven; actual prompt append behavior is not
   * independently verified from the plugin layer. Applies to next query or restarted session only.
   */
  systemPrompt: string;
  /**
   * When true, new Claude Code sessions do not receive an explicit title on first query,
   * allowing the SDK to auto-generate a conversation summary/title.
   * When false, the plugin passes "New Claude Code chat" as the explicit title,
   * which skips Claude's auto title generation.
   * Applies to the next new session only; existing sessions are unaffected.
   */
  autoTitle: boolean;
}

export interface BackendSettings {
  claudeCode: ClaudeCodeBackendSettings;
  codex: CodexBackendSettings;
}

export function normalizeEffortLevel(value: unknown): EffortLevel {
  switch (value) {
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return value;
    case 'max':
      return 'xhigh';
    default:
      return 'high';
  }
}

export function getDefaultClaudeCodeBackendSettings(): ClaudeCodeBackendSettings {
  return {
    executablePath: '',
    settingSources: ['project'],
    permissionMode: 'default',
    thinking: { type: 'adaptive' },
    effort: 'medium',
    additionalDirectories: [],
    model: '',
    pricingProviderId: '',
    pricingEndpoint: '',
    fallbackModel: '',
    providers: getDefaultClaudeProviderSettings(),
    allowedTools: [],
    disallowedTools: [],
    restrictedBuiltinTools: [],
    maxTurns: null,
    maxBudgetUsd: null,
    taskBudget: null,
    env: {},
    enableFileCheckpointing: false,
    includeHookEvents: false,
    forwardSubagentText: false,
    agentProgressSummaries: false,
    promptSuggestions: false,
    debugChannels: getDefaultClaudeCodeDebugChannelSettings(),
    sandbox: {
      enabled: false,
      failIfUnavailable: false,
      autoAllowBashIfSandboxed: false,
      excludedCommands: [],
      allowUnsandboxedCommands: true,
      filesystem: { allowWrite: [], denyWrite: [], denyRead: [] },
      network: { allowedDomains: [], deniedDomains: [] },
      enableWeakerNestedSandbox: false,
      enableWeakerNetworkIsolation: false,
      ripgrep: { command: '', args: [] },
    },
    planModeInstructions: '',
    toolAliases: {},
    askUserQuestionPreviewFormat: '',
    debug: false,
    strictMcpConfig: false,
    enableContext1mBeta: false,
    debugFile: '',
    jsRuntime: '',
    loadTimeoutMs: null,
    systemPrompt: '',
    outputStyle: '',
    autoTitle: true,
  };
}

export function getDefaultBackendSettings(): BackendSettings {
  return {
    claudeCode: getDefaultClaudeCodeBackendSettings(),
    codex: getDefaultCodexBackendSettings(),
  };
}

export function getDefaultCodexBackendSettings(): CodexBackendSettings {
  return {
    apiKey: '',
    model: '',
    pricingProviderId: '',
    pricingEndpoint: '',
    sandboxMode: 'workspace-write',
    modelReasoningEffort: 'medium',
    additionalDirectories: '',
    networkAccessEnabled: false,
    webSearchMode: 'cached',
    approvalPolicy: 'inherit',
  };
}

export function normalizeClaudeCodeSettingSources(value: unknown): ClaudeCodeSettingSource[] {
  if (value === 'none') {
    return [];
  }
  if (!Array.isArray(value)) {
    return ['project'];
  }

  const normalized = value
    .map((entry) => typeof entry === 'string' ? entry.trim() : '')
    .filter((entry): entry is ClaudeCodeSettingSource =>
      entry === 'user' || entry === 'project' || entry === 'local');

  return [...new Set(normalized)];
}

export function normalizeClaudeCodePermissionMode(value: unknown): ClaudeCodePermissionMode {
  switch (value) {
    case 'acceptEdits':
    case 'bypassPermissions':
    case 'plan':
    case 'default':
      return value;
    case 'auto':
    case 'normal':
      return 'default';
    case 'dontAsk':
      return 'bypassPermissions';
    default:
      return 'default';
  }
}

export function normalizeClaudeCodeEffort(value: unknown): ClaudeCodeEffort {
  switch (value) {
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
    case 'max':
      return value;
    case 'minimal':
      return 'low';
    default:
      return 'medium';
  }
}

export function normalizeClaudeCodeThinking(value: unknown): ClaudeCodeThinking {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { type: 'adaptive' };
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'disabled') {
    return { type: 'disabled' };
  }
  if (candidate.type === 'fixed') {
    const budgetTokens = typeof candidate.budgetTokens === 'number'
      && Number.isFinite(candidate.budgetTokens)
      && candidate.budgetTokens > 0
      ? Math.floor(candidate.budgetTokens)
      : 4096;
    return { type: 'fixed', budgetTokens };
  }
  return { type: 'adaptive' };
}

export function normalizeClaudeCodeAdditionalDirectories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((entry) => typeof entry === 'string' ? entry.trim() : '')
      .filter((entry) => entry.length > 0),
  )];
}

export function normalizeClaudeCodeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((entry) => typeof entry === 'string' ? entry.trim() : '')
      .filter((entry) => entry.length > 0),
  )];
}

export function normalizeClaudeCodeNullablePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return null;
}

export function normalizeClaudeCodeNullablePositiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return null;
}

export function normalizeClaudeCodeEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === 'string') {
      result[key] = val;
    }
  }
  return result;
}

export function normalizeClaudeCodeJsRuntime(value: unknown): 'node' | 'bun' | 'deno' | '' {
  if (value === 'node' || value === 'bun' || value === 'deno') {
    return value;
  }
  return '';
}

export function normalizeClaudeCodeAskUserQuestionPreviewFormat(value: unknown): 'markdown' | 'html' | '' {
  if (value === 'markdown' || value === 'html') {
    return value;
  }
  return '';
}

export function normalizeClaudeCodeSandboxSettings(value: unknown): ClaudeCodeSandboxSettings {
  const defaults: ClaudeCodeSandboxSettings = {
    enabled: false,
    failIfUnavailable: false,
    autoAllowBashIfSandboxed: false,
    excludedCommands: [] as string[],
    allowUnsandboxedCommands: true,
    filesystem: { allowWrite: [] as string[], denyWrite: [] as string[], denyRead: [] as string[] },
    network: { allowedDomains: [] as string[], deniedDomains: [] as string[] },
    enableWeakerNestedSandbox: false,
    enableWeakerNetworkIsolation: false,
    ripgrep: { command: '', args: [] as string[] },
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }
  const candidate = value as Record<string, unknown>;

  // Normalize filesystem sub-policy
  const fsRaw = candidate.filesystem;
  let filesystem = defaults.filesystem;
  if (fsRaw && typeof fsRaw === 'object' && !Array.isArray(fsRaw)) {
    const fs = fsRaw as Record<string, unknown>;
    filesystem = {
      allowWrite: normalizeClaudeCodeStringArray(fs.allowWrite),
      denyWrite: normalizeClaudeCodeStringArray(fs.denyWrite),
      denyRead: normalizeClaudeCodeStringArray(fs.denyRead),
    };
  }

  // Normalize network sub-policy
  const netRaw = candidate.network;
  let network = defaults.network;
  if (netRaw && typeof netRaw === 'object' && !Array.isArray(netRaw)) {
    const net = netRaw as Record<string, unknown>;
    network = {
      allowedDomains: normalizeClaudeCodeStringArray(net.allowedDomains),
      deniedDomains: normalizeClaudeCodeStringArray(net.deniedDomains),
    };
  }

  // Normalize ripgrep sub-config
  const rgRaw = candidate.ripgrep;
  let ripgrep = defaults.ripgrep;
  if (rgRaw && typeof rgRaw === 'object' && !Array.isArray(rgRaw)) {
    const rg = rgRaw as Record<string, unknown>;
    ripgrep = {
      command: typeof rg.command === 'string' ? rg.command.trim() : '',
      args: normalizeClaudeCodeStringArray(rg.args),
    };
  }

  return {
    enabled: candidate.enabled === true,
    failIfUnavailable: candidate.failIfUnavailable === true,
    autoAllowBashIfSandboxed: candidate.autoAllowBashIfSandboxed === true,
    excludedCommands: normalizeClaudeCodeStringArray(candidate.excludedCommands),
    allowUnsandboxedCommands: candidate.allowUnsandboxedCommands !== false,
    filesystem,
    network,
    enableWeakerNestedSandbox: candidate.enableWeakerNestedSandbox === true,
    enableWeakerNetworkIsolation: candidate.enableWeakerNetworkIsolation === true,
    ripgrep,
  };
}

export function normalizeClaudeCodeToolAliases(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const trimmedKey = typeof key === 'string' ? key.trim() : '';
    if (trimmedKey.length > 0 && typeof val === 'string' && val.trim().length > 0) {
      result[trimmedKey] = val.trim();
    }
  }
  return result;
}

function normalizeClaudeProviderPreset(value: unknown): ClaudeProviderPreset | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (!id || !name || id === 'official') {
    return null;
  }

  const extraEnv = normalizeClaudeCodeEnv(candidate.extraEnv);
  for (const key of CLAUDE_PROVIDER_MANAGED_ENV_KEYS) {
    delete extraEnv[key];
  }

  return {
    id,
    name,
    baseUrl: typeof candidate.baseUrl === 'string' ? candidate.baseUrl.trim().replace(/\/+$/, '') : '',
    authToken: typeof candidate.authToken === 'string' ? candidate.authToken.trim() : '',
    model: typeof candidate.model === 'string' ? candidate.model.trim() : '',
    fallbackModel: typeof candidate.fallbackModel === 'string' ? candidate.fallbackModel.trim() : '',
    haikuModel: typeof candidate.haikuModel === 'string' ? candidate.haikuModel.trim() : '',
    extraEnv,
  };
}

export function normalizeClaudeProviderSettings(value: unknown): ClaudeProviderSettings {
  const defaults = getDefaultClaudeProviderSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  const candidate = value as Record<string, unknown>;
  const seenIds = new Set<string>(['official']);
  const presets: ClaudeProviderPreset[] = [{ ...CLAUDE_OFFICIAL_PROVIDER_PRESET, extraEnv: {} }];
  if (Array.isArray(candidate.presets)) {
    for (const rawPreset of candidate.presets) {
      const preset = normalizeClaudeProviderPreset(rawPreset);
      if (preset && !seenIds.has(preset.id)) {
        seenIds.add(preset.id);
        presets.push(preset);
      }
    }
  }

  const activePresetId = typeof candidate.activePresetId === 'string'
    && seenIds.has(candidate.activePresetId.trim())
    ? candidate.activePresetId.trim()
    : defaults.activePresetId;
  const lastAppliedManagedEnvKeys = normalizeClaudeCodeStringArray(candidate.lastAppliedManagedEnvKeys)
    .filter((key) => !CLAUDE_PROVIDER_MANAGED_ENV_KEYS.includes(key as typeof CLAUDE_PROVIDER_MANAGED_ENV_KEYS[number]));

  return {
    presets,
    activePresetId,
    lastAppliedManagedEnvKeys,
    modelMigrationDone: candidate.modelMigrationDone === true,
  };
}

export function normalizeClaudeCodeBackendSettings(value: unknown): ClaudeCodeBackendSettings {
  const defaults = getDefaultClaudeCodeBackendSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  const candidate = value as Partial<Record<keyof ClaudeCodeBackendSettings, unknown>>;
  return {
    executablePath: typeof candidate.executablePath === 'string'
      ? candidate.executablePath.trim()
      : defaults.executablePath,
    settingSources: normalizeClaudeCodeSettingSources(candidate.settingSources),
    permissionMode: normalizeClaudeCodePermissionMode(candidate.permissionMode),
    thinking: normalizeClaudeCodeThinking(candidate.thinking),
    effort: normalizeClaudeCodeEffort(candidate.effort),
    additionalDirectories: normalizeClaudeCodeAdditionalDirectories(candidate.additionalDirectories),
    model: typeof candidate.model === 'string' ? candidate.model.trim() : defaults.model,
    pricingProviderId: typeof candidate.pricingProviderId === 'string'
      ? candidate.pricingProviderId.trim().toLowerCase()
      : defaults.pricingProviderId,
    pricingEndpoint: typeof candidate.pricingEndpoint === 'string'
      ? candidate.pricingEndpoint.trim().replace(/\/+$/, '')
      : defaults.pricingEndpoint,
    fallbackModel: typeof candidate.fallbackModel === 'string' ? candidate.fallbackModel.trim() : defaults.fallbackModel,
    providers: normalizeClaudeProviderSettings(candidate.providers),
    allowedTools: normalizeClaudeCodeStringArray(candidate.allowedTools),
    disallowedTools: normalizeClaudeCodeStringArray(candidate.disallowedTools),
    restrictedBuiltinTools: normalizeClaudeCodeStringArray(candidate.restrictedBuiltinTools),
    maxTurns: normalizeClaudeCodeNullablePositiveInt(candidate.maxTurns),
    maxBudgetUsd: normalizeClaudeCodeNullablePositiveNumber(candidate.maxBudgetUsd),
    taskBudget: normalizeClaudeCodeNullablePositiveInt(candidate.taskBudget),
    env: normalizeClaudeCodeEnv(candidate.env),
    enableFileCheckpointing: candidate.enableFileCheckpointing === true,
    includeHookEvents: candidate.includeHookEvents === true,
    forwardSubagentText: candidate.forwardSubagentText === true,
    agentProgressSummaries: candidate.agentProgressSummaries === true,
    promptSuggestions: candidate.promptSuggestions === true,
    debugChannels: normalizeClaudeCodeDebugChannelSettings(candidate.debugChannels),
    sandbox: normalizeClaudeCodeSandboxSettings(candidate.sandbox),
    planModeInstructions: typeof candidate.planModeInstructions === 'string'
      ? candidate.planModeInstructions.trim()
      : defaults.planModeInstructions,
    toolAliases: normalizeClaudeCodeToolAliases(candidate.toolAliases),
    askUserQuestionPreviewFormat: normalizeClaudeCodeAskUserQuestionPreviewFormat(candidate.askUserQuestionPreviewFormat),
    debug: candidate.debug === true,
    strictMcpConfig: candidate.strictMcpConfig === true,
    enableContext1mBeta: candidate.enableContext1mBeta === true,
    debugFile: typeof candidate.debugFile === 'string'
      ? candidate.debugFile.trim()
      : defaults.debugFile,
    jsRuntime: normalizeClaudeCodeJsRuntime(candidate.jsRuntime),
    loadTimeoutMs: normalizeClaudeCodeNullablePositiveInt(candidate.loadTimeoutMs),
    systemPrompt: typeof candidate.systemPrompt === 'string'
      ? candidate.systemPrompt.trim()
      : defaults.systemPrompt,
    outputStyle: typeof candidate.outputStyle === 'string'
      ? candidate.outputStyle.trim()
      : defaults.outputStyle,
    autoTitle: normalizeBoolean(candidate.autoTitle, defaults.autoTitle),
  };
}

export function normalizeBackendSettings(value: unknown): BackendSettings {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as { claudeCode?: unknown; codex?: unknown }
    : {};
  return {
    claudeCode: normalizeClaudeCodeBackendSettings(candidate.claudeCode),
    codex: normalizeCodexBackendSettings(candidate.codex),
  };
}

function normalizeCodexBackendSettings(value: unknown): CodexBackendSettings {
  const VALID_SANDBOX_MODES: readonly CodexSandboxMode[] = ['read-only', 'workspace-write', 'danger-full-access'];
  const VALID_EFFORTS: readonly CodexReasoningEffort[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
  const VALID_WEB_SEARCH: readonly CodexWebSearchMode[] = ['disabled', 'cached', 'live'];
  const VALID_APPROVAL_POLICY: readonly CodexApprovalPolicy[] = ['inherit', 'untrusted', 'on-request', 'never'];
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as { apiKey?: unknown; model?: unknown; pricingProviderId?: unknown; pricingEndpoint?: unknown; sandboxMode?: unknown; modelReasoningEffort?: unknown; additionalDirectories?: unknown; networkAccessEnabled?: unknown; webSearchMode?: unknown; approvalPolicy?: unknown }
    : {};
  const rawSandbox = typeof candidate.sandboxMode === 'string' ? candidate.sandboxMode : '';
  const rawEffort = typeof candidate.modelReasoningEffort === 'string' ? candidate.modelReasoningEffort : '';
  const rawWebSearch = typeof candidate.webSearchMode === 'string' ? candidate.webSearchMode : '';
  const rawApprovalPolicy = typeof candidate.approvalPolicy === 'string' ? candidate.approvalPolicy : '';
  return {
    apiKey: typeof candidate.apiKey === 'string' ? candidate.apiKey : '',
    model: typeof candidate.model === 'string' ? candidate.model : '',
    pricingProviderId: typeof candidate.pricingProviderId === 'string'
      ? candidate.pricingProviderId.trim().toLowerCase()
      : '',
    pricingEndpoint: typeof candidate.pricingEndpoint === 'string'
      ? candidate.pricingEndpoint.trim().replace(/\/+$/, '')
      : '',
    sandboxMode: VALID_SANDBOX_MODES.includes(rawSandbox as CodexSandboxMode)
      ? (rawSandbox as CodexSandboxMode)
      : 'workspace-write',
    modelReasoningEffort: VALID_EFFORTS.includes(rawEffort as CodexReasoningEffort)
      ? (rawEffort as CodexReasoningEffort)
      : 'medium',
    additionalDirectories: typeof candidate.additionalDirectories === 'string' ? candidate.additionalDirectories : '',
    networkAccessEnabled: candidate.networkAccessEnabled === true,
    webSearchMode: VALID_WEB_SEARCH.includes(rawWebSearch as CodexWebSearchMode)
      ? (rawWebSearch as CodexWebSearchMode)
      : 'cached',
    // Missing/unknown normalizes directly to 'inherit' (no migration to on-request).
    approvalPolicy: VALID_APPROVAL_POLICY.includes(rawApprovalPolicy as CodexApprovalPolicy)
      ? (rawApprovalPolicy as CodexApprovalPolicy)
      : 'inherit',
  };
}

export function normalizeThinkingBudget(value: unknown): ThinkingBudget {
  if (value === 'off') return 0;
  if (value === 'low') return 1024;
  if (value === 'medium') return 4096;
  if (value === 'high') return 8192;
  if (value === 'xhigh') return 16384;

  switch (value) {
    case 0:
    case 1024:
    case 4096:
    case 8192:
    case 16384:
      return value;
    default:
      return 4096;
  }
}

export function normalizeTabBarPosition(value: unknown): TabBarPosition {
  switch (value) {
    case 'input':
    case 'header':
    case 'below-header':
      return value;
    default:
      return 'below-header';
  }
}

export function normalizeTabsEnabled(value: unknown): boolean {
  return value === false ? false : true;
}

export function normalizeBelowHeaderTabBarLayout(value: unknown): BelowHeaderTabBarLayout {
  switch (value) {
    case 'grid':
    case 'vertical':
      return value;
    default:
      return 'grid';
  }
}

/** User decision from the approval modal */
export type ApprovalDecision = 'allow' | 'allow-always' | 'deny' | 'cancel';

/** Tab bar position setting */
export type TabBarPosition = 'input' | 'header' | 'below-header';

/** Tab layout when mounted below the header */
export type BelowHeaderTabBarLayout = 'grid' | 'vertical';

/** Chat scroll effect */
export type ChatScrollMode = 'natural' | 'sticky-basic' | 'sticky-mask';

/** Input panel visual theme */
export type InputPanelThemeId =
  | 'preset'
  | 'glass-refraction-glass'
  | 'glass-refraction-card'
  | 'glass-refraction-pill'
  | 'liquid-glass-shuding'
  | 'liquid-glass-nikdelvin';

/** Composer action button style */
export type InputPanelActionButtonStyleId = 'default' | 'etched';

/** Context usage ring visual style */
export type ContextRingStyleId = 'classic' | 'segmented';

export type LiquidGlassAdapterId = 'shuding' | 'nikdelvin' | 'shudingDiamond';
export type InputPanelThemeFamily = 'preset' | 'glass-refraction' | 'liquid-glass';
export type GlassRefractionInputPanelThemeId = Exclude<
  InputPanelThemeId,
  'preset' | 'liquid-glass-shuding' | 'liquid-glass-nikdelvin'
>;
export type LiquidGlassInputPanelThemeId = Extract<
  InputPanelThemeId,
  'liquid-glass-shuding' | 'liquid-glass-nikdelvin'
>;

export type ChatAppearanceBackgroundFitMode = 'cover' | 'contain' | 'fit-width' | 'fit-height';

/** Server connection mode */
export type ServerMode = 'local' | 'remote';

export const OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST = '127.0.0.1';
export const OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT = 4196;
export const OPENCODE_LEGACY_LOCAL_DEFAULT_PORT = 4096;

/** Server auth type */
export type ServerAuthType = 'none' | 'basic' | 'bearer';

/** Model source mode */
export type ModelSourceMode = 'merge' | 'local' | 'server';

/** Conversation title generation mode */
export type TitleMode = 'default' | 'ai';

/** OpenCode question card display mode */
export type QuestionDisplayMode = 'all' | 'single';

/** Where pending OpenCode question cards should be shown */
export type QuestionCardPosition = 'inline' | 'above_input';

/** How OpenCode skills are exposed through slash commands */
export type SlashCommandSkillMode = 'direct' | 'skills-command';

/** Plugin isolation mode for local OpenCode */
export type PluginIsolationMode = 'default' | 'pure';

export const DEFAULT_AUTO_COMPACTION_ENABLED = true;
export const DEFAULT_COMPACTION_RESERVED_TOKENS = 10000;
export const DEFAULT_CHAT_FONT_SIZE_PX = 13;

const MIN_CHAT_FONT_SIZE_PX = 10;
const MAX_CHAT_FONT_SIZE_PX = 24;

export function normalizeTitleMode(value: unknown): TitleMode {
  switch (value) {
    case 'ai':
    case 'default':
      return value;
    default:
      return 'default';
  }
}

export function normalizeQuestionDisplayMode(value: unknown): QuestionDisplayMode {
  switch (value) {
    case 'all':
    case 'single':
      return value;
    default:
      return 'all';
  }
}

export function normalizeQuestionCardPosition(value: unknown): QuestionCardPosition {
  switch (value) {
    case 'inline':
    case 'above_input':
      return value;
    default:
      return 'inline';
  }
}

export function normalizeSlashCommandSkillMode(value: unknown): SlashCommandSkillMode {
  switch (value) {
    case 'skills-command':
    case 'direct':
      return value;
    default:
      return 'direct';
  }
}

export function normalizeInputPanelThemeId(value: unknown): InputPanelThemeId {
  switch (value) {
    case 'preset':
    case 'glass-refraction-glass':
    case 'glass-refraction-card':
    case 'glass-refraction-pill':
    case 'liquid-glass-shuding':
    case 'liquid-glass-nikdelvin':
      return value;
    case 'liquid-glass-rdev':
      return 'liquid-glass-shuding';
    case 'liquid-diamond-shuding':
      return 'preset';
    default:
      return 'preset';
  }
}

export function getInputPanelThemeFamily(themeId: InputPanelThemeId): InputPanelThemeFamily {
  if (themeId === 'preset') {
    return 'preset';
  }

  if (
    themeId === 'liquid-glass-shuding'
    || themeId === 'liquid-glass-nikdelvin'
  ) {
    return 'liquid-glass';
  }

  return 'glass-refraction';
}

export function normalizeGlassRefractionInputPanelThemeId(
  themeId: InputPanelThemeId,
): GlassRefractionInputPanelThemeId {
  switch (themeId) {
    case 'glass-refraction-card':
    case 'glass-refraction-pill':
    case 'glass-refraction-glass':
      return themeId;
    default:
      return 'glass-refraction-glass';
  }
}

export function normalizeLiquidGlassInputPanelThemeId(
  themeId: InputPanelThemeId,
): LiquidGlassInputPanelThemeId {
  switch (themeId) {
    case 'liquid-glass-shuding':
    case 'liquid-glass-nikdelvin':
      return themeId;
    default:
      return 'liquid-glass-shuding';
  }
}

export function getLiquidGlassAdapterIdForInputPanelTheme(themeId: InputPanelThemeId): LiquidGlassAdapterId | null {
  switch (themeId) {
    case 'liquid-glass-shuding':
      return 'shuding';
    case 'liquid-glass-nikdelvin':
      return 'nikdelvin';
    default:
      return null;
  }
}

export function getInputPanelThemeIdForLiquidGlassAdapter(adapterId: LiquidGlassAdapterId): InputPanelThemeId {
  switch (adapterId) {
    case 'shuding':
      return 'liquid-glass-shuding';
    case 'nikdelvin':
      return 'liquid-glass-nikdelvin';
    default:
      return 'preset';
  }
}

export function getInputPanelGlassRefractionVariantId(
  themeId: InputPanelThemeId,
): InputPanelGlassRefractionVariantId {
  switch (normalizeGlassRefractionInputPanelThemeId(themeId)) {
    case 'glass-refraction-card':
      return 'card';
    case 'glass-refraction-pill':
      return 'pill';
    default:
      return 'glass';
  }
}

export function normalizeInputPanelActionButtonStyleId(value: unknown): InputPanelActionButtonStyleId {
  switch (value) {
    case 'default':
    case 'etched':
      return value;
    default:
      return 'default';
  }
}

export function normalizeContextRingStyleId(value: unknown): ContextRingStyleId {
  switch (value) {
    case 'segmented':
    case 'classic':
      return value;
    default:
      return 'classic';
  }
}

export function normalizeChatAppearanceBackgroundFitMode(value: unknown): ChatAppearanceBackgroundFitMode {
  switch (value) {
    case 'cover':
    case 'contain':
    case 'fit-width':
    case 'fit-height':
      return value;
    default:
      return 'cover';
  }
}

export function normalizePluginIsolationMode(value: unknown): PluginIsolationMode {
  switch (value) {
    case 'pure':
    case 'default':
      return value;
    default:
      return 'default';
  }
}

/** Local server configuration */
export interface LocalServerConfig {
  host: string;
  port: number;
  autoStart: boolean;
  executablePath: string;
}

/** Remote server configuration */
export interface RemoteServerConfig {
  baseUrl: string;
}

/** Server authentication configuration */
export interface ServerAuthConfig {
  type: ServerAuthType;
  username: string;
  password: string;
  token: string;
}

/** Server configuration */
export interface ServerConfig {
  mode: ServerMode;
  local: LocalServerConfig;
  remote: RemoteServerConfig;
  auth: ServerAuthConfig;
}

/** Platform-specific blocked commands */
export interface PlatformBlockedCommands {
  unix: string[];
  windows: string[];
}

/** Platform-specific debug log export paths */
export interface PlatformDebugLogPaths {
  unix: string;
  windows: string;
}

export type ProviderIconEntryType = 'mapped' | 'builtin' | 'url' | 'file';
export type ProviderIconColorMode = 'system' | 'monochrome' | 'color';
export type LobehubIconVariant =
  | 'auto'
  | 'mono'
  | 'color'
  | 'brand'
  | 'brand-color'
  | 'text'
  | 'text-cn'
  | 'text-color'
  | 'combine'
  | 'avatar';
export type StaticLobehubIconVariant = Exclude<LobehubIconVariant, 'auto' | 'combine'>;
export type ProviderIconResolvedFormat = 'svg' | 'png' | 'webp' | 'avatar';

export interface ProviderIconEntry {
  id: string;
  type: ProviderIconEntryType;
  source: string;
  variant?: LobehubIconVariant;
  resolvedVariant?: Exclude<LobehubIconVariant, 'auto'>;
  resolvedFormat?: ProviderIconResolvedFormat;
  mimeType?: string;
  cacheFileName?: string;
  addedAt: number;
  updatedAt?: number;
}

export type ProviderIconLibrary = Record<string, ProviderIconEntry[]>;

export function normalizeProviderIconColorMode(value: unknown): ProviderIconColorMode {
  switch (value) {
    case 'monochrome':
    case 'color':
    case 'system':
      return value;
    default:
      return 'system';
  }
}

export function normalizeLobehubIconVariant(value: unknown): LobehubIconVariant {
  switch (value) {
    case 'auto':
    case 'mono':
    case 'color':
    case 'brand':
    case 'brand-color':
    case 'text':
    case 'text-cn':
    case 'text-color':
    case 'combine':
    case 'avatar':
      return value;
    default:
      return 'auto';
  }
}

export function normalizeProviderIconResolvedFormat(value: unknown): ProviderIconResolvedFormat | undefined {
  switch (value) {
    case 'svg':
    case 'png':
    case 'webp':
    case 'avatar':
      return value;
    default:
      return undefined;
  }
}

const UNIX_BLOCKED_COMMANDS = [
  'rm -rf',
  'chmod 777',
  'chmod -R 777',
];

const WINDOWS_BLOCKED_COMMANDS = [
  'del /s /q',
  'rd /s /q',
  'rmdir /s /q',
  'format',
  'diskpart',
  'Remove-Item -Recurse -Force',
  'Remove-Item -Force -Recurse',
  'Remove-Item -r -fo',
  'Remove-Item -fo -r',
  'Remove-Item -Recurse',
  'Remove-Item -r',
  'ri -Recurse',
  'ri -r',
  'ri -Force',
  'ri -fo',
  'rm -r -fo',
  'rm -Recurse',
  'rm -Force',
  'del -Recurse',
  'del -Force',
  'erase -Recurse',
  'erase -Force',
  'rd -Recurse',
  'rmdir -Recurse',
  'Format-Volume',
  'Clear-Disk',
  'Initialize-Disk',
  'Remove-Partition',
];

export function getDefaultBlockedCommands(): PlatformBlockedCommands {
  return {
    unix: [...UNIX_BLOCKED_COMMANDS],
    windows: [...WINDOWS_BLOCKED_COMMANDS],
  };
}

export function getCurrentPlatformKey(): 'unix' | 'windows' {
  return process.platform === 'win32' ? 'windows' : 'unix';
}

export function getCurrentPlatformBlockedCommands(commands: PlatformBlockedCommands): string[] {
  return commands[getCurrentPlatformKey()];
}

export function getDefaultDebugLogPaths(): PlatformDebugLogPaths {
  return {
    unix: '',
    windows: '',
  };
}

export function getCurrentPlatformDebugLogPath(paths: PlatformDebugLogPaths): string {
  return paths[getCurrentPlatformKey()];
}

function normalizeTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeProviderIconEntryType(value: unknown): ProviderIconEntryType | null {
  switch (value) {
    case 'mapped':
    case 'builtin':
    case 'url':
    case 'file':
      return value;
    default:
      return null;
  }
}

function normalizeProviderIconResolvedVariantValue(
  value: unknown,
): Exclude<LobehubIconVariant, 'auto'> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedVariant = normalizeLobehubIconVariant(value);
  return normalizedVariant === 'auto' ? undefined : normalizedVariant;
}

function normalizeProviderIconEntry(value: unknown): ProviderIconEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ProviderIconEntry>;
  const id = normalizeTrimmedString(candidate.id);
  const type = normalizeProviderIconEntryType(candidate.type);
  const source = normalizeTrimmedString(candidate.source);

  if (!id || !type || !source) {
    return null;
  }

  if (type === 'builtin' && !/^(lobehub|opencode):[^:\s]+$/i.test(source)) {
    return null;
  }

  return {
    id,
    type,
    source,
    variant: normalizeLobehubIconVariant(candidate.variant),
    resolvedVariant: normalizeProviderIconResolvedVariantValue(candidate.resolvedVariant),
    resolvedFormat: normalizeProviderIconResolvedFormat(candidate.resolvedFormat),
    mimeType: normalizeTrimmedString(candidate.mimeType),
    cacheFileName: normalizeTrimmedString(candidate.cacheFileName),
    addedAt: typeof candidate.addedAt === 'number' && Number.isFinite(candidate.addedAt)
      ? candidate.addedAt
      : Date.now(),
    updatedAt: typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : undefined,
  };
}

export function normalizeProviderIconLibrary(value: unknown): ProviderIconLibrary {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const normalizedLibrary: ProviderIconLibrary = {};

  for (const [providerId, entries] of Object.entries(value as Record<string, unknown>)) {
    const normalizedProviderId = normalizeTrimmedString(providerId);
    if (!normalizedProviderId || !Array.isArray(entries)) {
      continue;
    }

    const normalizedEntries = entries.flatMap((entry) => {
      const normalizedEntry = normalizeProviderIconEntry(entry);
      return normalizedEntry ? [normalizedEntry] : [];
    });

    if (normalizedEntries.length > 0) {
      normalizedLibrary[normalizedProviderId] = normalizedEntries;
    }
  }

  return normalizedLibrary;
}

export function normalizeDisabledModelRefs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .flatMap((item) => {
          const slashIndex = item.indexOf('/');
          if (slashIndex <= 0 || slashIndex >= item.length - 1) {
            return [];
          }

          const provider = item.slice(0, slashIndex).trim();
          const model = item.slice(slashIndex + 1).trim();
          if (!provider || !model) {
            return [];
          }

          return [`${provider}/${model}`];
        }),
    ),
  );
}

function normalizeModelPricingIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeModelPricingEndpoint(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\/+$/, '');
  return normalized.length > 0 ? normalized : null;
}

function normalizeModelPricingRate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** Keeps only structurally valid, latest-per-model local pricing overrides. */
export function normalizeModelPricingOverrides(value: unknown): ModelPricingOverride[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const overrides = new Map<string, ModelPricingOverride>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const providerId = normalizeModelPricingIdentifier(record.providerId);
    const endpoint = normalizeModelPricingEndpoint(record.endpoint);
    const modelId = normalizeModelPricingIdentifier(record.modelId);
    if (!providerId || !modelId) {
      continue;
    }

    const override: ModelPricingOverride = {
      providerId,
      endpoint,
      modelId,
      inputPerMillion: normalizeModelPricingRate(record.inputPerMillion),
      outputPerMillion: normalizeModelPricingRate(record.outputPerMillion),
      cacheReadPerMillion: normalizeModelPricingRate(record.cacheReadPerMillion),
      cacheWritePerMillion: normalizeModelPricingRate(record.cacheWritePerMillion),
      updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? Math.max(0, Math.round(record.updatedAt))
        : 0,
    };
    overrides.set(`${providerId}/${endpoint ?? ''}/${modelId}`, override);
  }

  return [...overrides.values()]
    .sort((left, right) => `${left.providerId}/${left.endpoint ?? ''}/${left.modelId}`
      .localeCompare(`${right.providerId}/${right.endpoint ?? ''}/${right.modelId}`));
}

/**
 * Normalizes `disabledPluginSpecs` – an array of serialized plugin specifier
 * strings that the user has explicitly disabled. Each entry is the serialized
 * form produced by `PluginManagementService.formatPluginSpec()`: either a bare
 * npm name (`"opencode-wakatime"`) or a JSON tuple (`'["@org/plugin",{"v":true}]'`).
 */
export function normalizeDisabledPluginSpecs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

/**
 * Get blocked commands for the Bash tool.
 *
 * On Windows, the Bash tool runs in a Git Bash/MSYS2 environment but can still
 * invoke Windows commands (e.g., via `cmd /c` or `powershell`), so both Unix
 * and Windows blocklist patterns are merged.
 */
export function getBashToolBlockedCommands(commands: PlatformBlockedCommands): string[] {
  if (process.platform === 'win32') {
    return Array.from(new Set([...commands.unix, ...commands.windows]));
  }
  return getCurrentPlatformBlockedCommands(commands);
}

/** Model provider configuration */
export interface ModelProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface ChatAppearanceLayoutSettings {
  messagesPaddingTop: number;
  messagesPaddingX: number;
  /** Horizontal padding on the message element itself (user & assistant). Replaces the hardcoded 28px. */
  messagePaddingX: number;
  /** Horizontal padding on the inner content bubble (user & assistant). Replaces the hardcoded 14px. */
  contentPaddingX: number;
  /** Vertical padding on the inner content bubble (user & assistant). Replaces the hardcoded 6-10px. */
  contentPaddingY: number;
}

export interface ChatAppearanceStickySettings {
  headerGap: number;
  maskHeight: number;
  maskBlur: number;
}

export interface ChatAppearanceBackgroundSettings {
  imagePath: string;
  imageMimeType: string;
  imageDisplayName: string;
  fitMode: ChatAppearanceBackgroundFitMode;
  opacity: number;
  blur: number;
  depth: number;
  dim: number;
  edgeFade: number;
  saturation: number;
  brightness: number;
  focusX: number;
  focusY: number;
}

export interface ChatAppearanceUserSettings {
  radius: number;
  tailRadius: number;
  blur: number;
  shadowBlur: number;
  timeFontSize: number;
  timeFontWeight: number;
  timeColor: string;
}

export interface ChatAppearanceAssistantSettings {
  radius: number;
  backgroundOpacity: number;
  blur: number;
  shadowBlur: number;
  metaFontSize: number;
  timeFontSize: number;
  timeFontWeight: number;
  metaColor: string;
  timeColor: string;
  modelIdFontSize: number;
  modelIdFontWeight: number;
  modelIdColor: string;
}

export interface ChatAppearanceInputSettings {
  radius: number;
  backgroundOpacity: number;
  blur: number;
  shadowBlur: number;
  actionButtonStyle: InputPanelActionButtonStyleId;
  contextRingStyle: ContextRingStyleId;
  enFontFamily: string;
  cnFontFamily: string;
}

export type InputPanelGlassRefractionVariantId = 'glass' | 'card' | 'pill';

export interface InputPanelGlassRefractionVariantSettings {
  backgroundOpacity: number;
  blur: number;
  saturation: number;
  brightness: number;
}

export interface InputPanelGlassRefractionSettings {
  glass: InputPanelGlassRefractionVariantSettings;
  card: InputPanelGlassRefractionVariantSettings;
  pill: InputPanelGlassRefractionVariantSettings;
}

type PartialInputPanelGlassRefractionSettings = Partial<
  Record<InputPanelGlassRefractionVariantId, Partial<InputPanelGlassRefractionVariantSettings>>
>;

export type InputPanelGlassRefractionSvgFilterPresetId = 'none' | 'subtle' | 'strong';

export interface InputPanelGlassRefractionSvgFilterSettings {
  preset: InputPanelGlassRefractionSvgFilterPresetId;
  subtleScale: number;
  strongScale: number;
}

export interface InputPanelLiquidGlassSettings {
  shuding: Record<string, number | string | boolean>;
  nikdelvin: Record<string, number | string | boolean>;
  shudingDiamond: Record<string, number | string | boolean>;
}

export interface ChatAppearanceScrollbarSettings {
  width: number;
  radius: number;
  trackOpacity: number;
  thumbOpacity: number;
  thumbHoverOpacity: number;
  edgePadding: number;
  shadowOpacity: number;
}

export interface ChatAppearanceAdvancedSettings {
  customCssDeclarations: string;
}

export interface ChatAppearanceSettings {
  layout: ChatAppearanceLayoutSettings;
  sticky: ChatAppearanceStickySettings;
  background: ChatAppearanceBackgroundSettings;
  user: ChatAppearanceUserSettings;
  assistant: ChatAppearanceAssistantSettings;
  input: ChatAppearanceInputSettings;
  scrollbar: ChatAppearanceScrollbarSettings;
  advanced: ChatAppearanceAdvancedSettings;
}

export interface PartialChatAppearanceSettings {
  layout?: Partial<ChatAppearanceLayoutSettings>;
  sticky?: Partial<ChatAppearanceStickySettings>;
  background?: Partial<ChatAppearanceBackgroundSettings>;
  user?: Partial<ChatAppearanceUserSettings>;
  assistant?: Partial<ChatAppearanceAssistantSettings>;
  input?: Partial<ChatAppearanceInputSettings>;
  scrollbar?: Partial<ChatAppearanceScrollbarSettings>;
  advanced?: Partial<ChatAppearanceAdvancedSettings>;
}

export type ThemeStyleId = 'glass' | 'flat' | 'soft' | 'sharp';

export type ThemePresetId =
  | 'glass-classic'
  | 'glass-warm'
  | 'glass-mint'
  | 'flat-slate'
  | 'flat-ocean'
  | 'flat-rose'
  | 'soft-neutral'
  | 'soft-lavender'
  | 'soft-latte'
  | 'sharp-graphite'
  | 'sharp-neon'
  | 'sharp-amber';

export interface ThemePresetDefinition {
  id: ThemePresetId;
  name: string;
  styleId: ThemeStyleId;
  schemeName: string;
  containerClass: string;
  cssVariables: Record<string, string>;
  appearance: ChatAppearanceSettings;
}

export interface ThemeSettings {
  activePresetId: ThemePresetId | null;
  customAppearanceOverrides: PartialChatAppearanceSettings;
}

export function getDefaultChatAppearanceSettings(): ChatAppearanceSettings {
  return {
    layout: {
      messagesPaddingTop: 12,
      messagesPaddingX: 0,
      messagePaddingX: 21,
      contentPaddingX: 10,
      contentPaddingY: 5,
    },
    sticky: {
      headerGap: 6,
      maskHeight: 18,
      maskBlur: 0,
    },
    background: {
      imagePath: '',
      imageMimeType: '',
      imageDisplayName: '',
      fitMode: 'cover',
      opacity: 92,
      blur: 2,
      depth: 8,
      dim: 28,
      edgeFade: 28,
      saturation: 108,
      brightness: 94,
      focusX: 50,
      focusY: 50,
    },
    user: {
      radius: 16,
      tailRadius: 4,
      blur: 12,
      shadowBlur: 28,
      timeFontSize: 11,
      timeFontWeight: 400,
      timeColor: 'var(--text-muted)',
    },
    assistant: {
      radius: 14,
      backgroundOpacity: 72,
      blur: 10,
      shadowBlur: 24,
      metaFontSize: 10,
      timeFontSize: 10,
      timeFontWeight: 400,
      metaColor: 'var(--text-muted)',
      timeColor: 'var(--text-muted)',
      modelIdFontSize: 10,
      modelIdFontWeight: 400,
      modelIdColor: 'var(--text-faint, var(--text-muted))',
    },
    input: {
      radius: 12,
      backgroundOpacity: 72,
      blur: 18,
      shadowBlur: 28,
      actionButtonStyle: 'default',
      contextRingStyle: 'classic',
      enFontFamily: 'newsreader',
      cnFontFamily: '',
    },
    scrollbar: {
      width: 8,
      radius: 999,
      trackOpacity: 22,
      thumbOpacity: 68,
      thumbHoverOpacity: 82,
      edgePadding: 2,
      shadowOpacity: 46,
    },
    advanced: {
      customCssDeclarations: '',
    },
  };
}

function normalizeFiniteNumberInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isValidCssColorValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^var\(.+\)$/u.test(trimmed)) {
    return true;
  }

  try {
    if (typeof globalThis.CSS?.supports === 'function' && globalThis.CSS.supports('color', trimmed)) {
      return true;
    }
  } catch {
    // Ignore platform-specific CSS parser gaps and fall back to conservative checks below.
  }

  return /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu.test(trimmed)
    || /^(?:rgb|hsl)a?\(/iu.test(trimmed)
    || /^(?:transparent|currentcolor|inherit|initial|unset)$/iu.test(trimmed);
}

function normalizeCssColorValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return isValidCssColorValue(trimmed) ? trimmed : fallback;
}

function normalizeFontWeightValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  return Math.min(900, Math.max(100, rounded));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeCompactionReservedTokens(
  value: unknown,
  fallback: number = DEFAULT_COMPACTION_RESERVED_TOKENS,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  return rounded > 0 ? rounded : fallback;
}

export function normalizeChatFontSizePx(
  value: unknown,
  fallback: number = DEFAULT_CHAT_FONT_SIZE_PX,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  if (rounded < MIN_CHAT_FONT_SIZE_PX || rounded > MAX_CHAT_FONT_SIZE_PX) {
    return fallback;
  }

  return rounded;
}

export function getDefaultInputPanelGlassRefractionSettings(): InputPanelGlassRefractionSettings {
  return {
    glass: {
      backgroundOpacity: 48,
      blur: 26,
      saturation: 170,
      brightness: 108,
    },
    card: {
      backgroundOpacity: 52,
      blur: 20,
      saturation: 150,
      brightness: 100,
    },
    pill: {
      backgroundOpacity: 5,
      blur: 8,
      saturation: 130,
      brightness: 100,
    },
  };
}

export function getDefaultInputPanelGlassRefractionSvgFilterSettings(): InputPanelGlassRefractionSvgFilterSettings {
  return {
    preset: 'none',
    subtleScale: 8,
    strongScale: 16,
  };
}

export function getDefaultInputPanelLiquidGlassSettings(): InputPanelLiquidGlassSettings {
  return {
    shuding: {
      displacementScale: 10,
      blurAmount: 0.25,
      adaptiveSdf: false,
      adaptiveSdfMix: 0,
      rectEdgeRefraction: false,
      rectEdgeRefractionStrength: 0,
      cornerEnhancement: false,
      cornerEnhancementStrength: 0,
      edgeBandWidth: 0,
      barrelDistortion: false,
      barrelStrength: 0,
      topHighlight: false,
      topHighlightOpacity: 0.6,
      innerBorder: false,
      innerBorderOpacity: 0.2,
      bottomShadow: false,
      bottomShadowOpacity: 0.08,
      insetDepthShadow: false,
      insetDepthShadowOpacity: 0.12,
      insetShadowBlur: 10,
      contrastBoost: 1.2,
      brightnessBoost: 1.05,
      saturateBoost: 1.1,
    },
    nikdelvin: {
      depth: 10,
      strength: 100,
      chromaticAberration: 0,
      blur: 0,
      backgroundPreset: 'background',
      color: 'transparent',
      background: '',
      freeze: false,
      noMorph: false,
      button: false,
      inline: false,
      customEffects: false,
    },
    shudingDiamond: {
      displacementScale: 10,
      bloomOpacity: 1,
      rimOpacity: 0.45,
      faceOverlayOpacity: 1,
      supportOpacity: 0.88,
      pointerTracking: true,
      pointerTilt: 1,
    },
  };
}

function normalizeInputPanelGlassRefractionVariantSettings(
  value: unknown,
  defaults: InputPanelGlassRefractionVariantSettings,
): InputPanelGlassRefractionVariantSettings {
  const candidate =
    value && typeof value === 'object'
      ? (value as Partial<InputPanelGlassRefractionVariantSettings>)
      : undefined;

  return {
    backgroundOpacity: normalizeFiniteNumberInRange(
      candidate?.backgroundOpacity,
      defaults.backgroundOpacity,
      0,
      100,
    ),
    blur: normalizeFiniteNumberInRange(candidate?.blur, defaults.blur, 0, 40),
    saturation: normalizeFiniteNumberInRange(candidate?.saturation, defaults.saturation, 50, 250),
    brightness: normalizeFiniteNumberInRange(candidate?.brightness, defaults.brightness, 50, 150),
  };
}

export function normalizeInputPanelGlassRefractionSettings(
  value?: PartialInputPanelGlassRefractionSettings | null,
): InputPanelGlassRefractionSettings {
  const defaults = getDefaultInputPanelGlassRefractionSettings();

  return {
    glass: normalizeInputPanelGlassRefractionVariantSettings(value?.glass, defaults.glass),
    card: normalizeInputPanelGlassRefractionVariantSettings(value?.card, defaults.card),
    pill: normalizeInputPanelGlassRefractionVariantSettings(value?.pill, defaults.pill),
  };
}

export function normalizeInputPanelGlassRefractionSvgFilterPresetId(
  value: unknown,
): InputPanelGlassRefractionSvgFilterPresetId {
  switch (value) {
    case 'none':
    case 'subtle':
    case 'strong':
      return value;
    default:
      return 'none';
  }
}

export function normalizeInputPanelGlassRefractionSvgFilterSettings(
  value?: Partial<InputPanelGlassRefractionSvgFilterSettings> | null,
): InputPanelGlassRefractionSvgFilterSettings {
  const defaults = getDefaultInputPanelGlassRefractionSvgFilterSettings();

  return {
    preset: normalizeInputPanelGlassRefractionSvgFilterPresetId(value?.preset),
    subtleScale: normalizeFiniteNumberInRange(value?.subtleScale, defaults.subtleScale, 0, 32),
    strongScale: normalizeFiniteNumberInRange(value?.strongScale, defaults.strongScale, 0, 32),
  };
}

type LiquidGlassAdapterSettings = InputPanelLiquidGlassSettings['shuding'];

function normalizeShudingLiquidGlassSettings(
  value: LiquidGlassAdapterSettings | undefined,
  defaults: LiquidGlassAdapterSettings,
): LiquidGlassAdapterSettings {
  const shuding = value ?? {};
  return {
    displacementScale: normalizeFiniteNumber(
      shuding.displacementScale,
      defaults.displacementScale as number,
    ),
    blurAmount: normalizeFiniteNumber(
      shuding.blurAmount,
      defaults.blurAmount as number,
    ),
    adaptiveSdf: normalizeBoolean(
      shuding.adaptiveSdf,
      defaults.adaptiveSdf as boolean,
    ),
    adaptiveSdfMix: normalizeFiniteNumberInRange(
      shuding.adaptiveSdfMix,
      defaults.adaptiveSdfMix as number,
      0,
      1,
    ),
    rectEdgeRefraction: normalizeBoolean(
      shuding.rectEdgeRefraction,
      defaults.rectEdgeRefraction as boolean,
    ),
    rectEdgeRefractionStrength: normalizeFiniteNumberInRange(
      shuding.rectEdgeRefractionStrength,
      defaults.rectEdgeRefractionStrength as number,
      0,
      2,
    ),
    cornerEnhancement: normalizeBoolean(
      shuding.cornerEnhancement,
      defaults.cornerEnhancement as boolean,
    ),
    cornerEnhancementStrength: normalizeFiniteNumberInRange(
      shuding.cornerEnhancementStrength,
      defaults.cornerEnhancementStrength as number,
      0,
      2,
    ),
    edgeBandWidth: normalizeFiniteNumberInRange(
      shuding.edgeBandWidth,
      defaults.edgeBandWidth as number,
      0,
      0.2,
    ),
    barrelDistortion: normalizeBoolean(
      shuding.barrelDistortion,
      defaults.barrelDistortion as boolean,
    ),
    barrelStrength: normalizeFiniteNumberInRange(
      shuding.barrelStrength,
      defaults.barrelStrength as number,
      0,
      0.1,
    ),
    topHighlight: normalizeBoolean(
      shuding.topHighlight,
      defaults.topHighlight as boolean,
    ),
    topHighlightOpacity: normalizeFiniteNumberInRange(
      shuding.topHighlightOpacity,
      defaults.topHighlightOpacity as number,
      0,
      1,
    ),
    innerBorder: normalizeBoolean(
      shuding.innerBorder,
      defaults.innerBorder as boolean,
    ),
    innerBorderOpacity: normalizeFiniteNumberInRange(
      shuding.innerBorderOpacity,
      defaults.innerBorderOpacity as number,
      0,
      1,
    ),
    bottomShadow: normalizeBoolean(
      shuding.bottomShadow,
      defaults.bottomShadow as boolean,
    ),
    bottomShadowOpacity: normalizeFiniteNumberInRange(
      shuding.bottomShadowOpacity,
      defaults.bottomShadowOpacity as number,
      0,
      1,
    ),
    insetDepthShadow: normalizeBoolean(
      shuding.insetDepthShadow,
      defaults.insetDepthShadow as boolean,
    ),
    insetDepthShadowOpacity: normalizeFiniteNumberInRange(
      shuding.insetDepthShadowOpacity,
      defaults.insetDepthShadowOpacity as number,
      0,
      1,
    ),
    insetShadowBlur: normalizeFiniteNumberInRange(
      shuding.insetShadowBlur,
      defaults.insetShadowBlur as number,
      5,
      30,
    ),
    contrastBoost: normalizeFiniteNumberInRange(
      shuding.contrastBoost,
      defaults.contrastBoost as number,
      1,
      1.5,
    ),
    brightnessBoost: normalizeFiniteNumberInRange(
      shuding.brightnessBoost,
      defaults.brightnessBoost as number,
      1,
      1.2,
    ),
    saturateBoost: normalizeFiniteNumberInRange(
      shuding.saturateBoost,
      defaults.saturateBoost as number,
      1,
      1.3,
    ),
  };
}

function normalizeNikdelvinLiquidGlassSettings(
  value: LiquidGlassAdapterSettings | undefined,
  defaults: LiquidGlassAdapterSettings,
): LiquidGlassAdapterSettings {
  const nikdelvin = value ?? {};
  return {
    depth: normalizeFiniteNumberInRange(
      nikdelvin.depth,
      defaults.depth as number,
      0,
      40,
    ),
    strength: normalizeFiniteNumberInRange(
      nikdelvin.strength,
      defaults.strength as number,
      0,
      200,
    ),
    chromaticAberration: normalizeFiniteNumberInRange(
      nikdelvin.chromaticAberration,
      defaults.chromaticAberration as number,
      0,
      10,
    ),
    blur: normalizeFiniteNumberInRange(
      nikdelvin.blur,
      defaults.blur as number,
      0,
      10,
    ),
    backgroundPreset:
      nikdelvin.backgroundPreset === 'background'
      || nikdelvin.backgroundPreset === 'lines'
      || nikdelvin.backgroundPreset === 'rocks'
      || nikdelvin.backgroundPreset === 'chrome'
      || nikdelvin.backgroundPreset === 'silk'
      || nikdelvin.backgroundPreset === 'none'
        ? nikdelvin.backgroundPreset
        : defaults.backgroundPreset,
    color:
      nikdelvin.color === 'black'
      || nikdelvin.color === 'white'
      || nikdelvin.color === 'transparent'
        ? nikdelvin.color
        : defaults.color,
    background:
      typeof nikdelvin.background === 'string'
        ? nikdelvin.background.trim()
        : defaults.background,
    freeze: normalizeBoolean(
      nikdelvin.freeze,
      defaults.freeze as boolean,
    ),
    noMorph: normalizeBoolean(
      nikdelvin.noMorph,
      defaults.noMorph as boolean,
    ),
    button: normalizeBoolean(
      nikdelvin.button,
      defaults.button as boolean,
    ),
    inline: normalizeBoolean(
      nikdelvin.inline,
      defaults.inline as boolean,
    ),
    customEffects: normalizeBoolean(
      nikdelvin.customEffects,
      defaults.customEffects as boolean,
    ),
  };
}

function normalizeShudingDiamondLiquidGlassSettings(
  value: LiquidGlassAdapterSettings | undefined,
  defaults: LiquidGlassAdapterSettings,
): LiquidGlassAdapterSettings {
  const shudingDiamond = value ?? {};
  return {
    displacementScale: normalizeFiniteNumber(
      shudingDiamond.displacementScale,
      defaults.displacementScale as number,
    ),
    bloomOpacity: normalizeFiniteNumberInRange(
      shudingDiamond.bloomOpacity,
      defaults.bloomOpacity as number,
      0,
      1,
    ),
    rimOpacity: normalizeFiniteNumberInRange(
      shudingDiamond.rimOpacity,
      defaults.rimOpacity as number,
      0,
      1,
    ),
    faceOverlayOpacity: normalizeFiniteNumberInRange(
      shudingDiamond.faceOverlayOpacity,
      defaults.faceOverlayOpacity as number,
      0,
      1,
    ),
    supportOpacity: normalizeFiniteNumberInRange(
      shudingDiamond.supportOpacity,
      defaults.supportOpacity as number,
      0,
      1,
    ),
    pointerTracking: normalizeBoolean(
      shudingDiamond.pointerTracking,
      defaults.pointerTracking as boolean,
    ),
    pointerTilt: normalizeFiniteNumberInRange(
      shudingDiamond.pointerTilt,
      defaults.pointerTilt as number,
      0,
      2,
    ),
  };
}

export function normalizeInputPanelLiquidGlassSettings(
  value?: Partial<InputPanelLiquidGlassSettings> | null,
): InputPanelLiquidGlassSettings {
  const defaults = getDefaultInputPanelLiquidGlassSettings();

  return {
    shuding: normalizeShudingLiquidGlassSettings(value?.shuding, defaults.shuding),
    nikdelvin: normalizeNikdelvinLiquidGlassSettings(value?.nikdelvin, defaults.nikdelvin),
    shudingDiamond: normalizeShudingDiamondLiquidGlassSettings(value?.shudingDiamond, defaults.shudingDiamond),
  };
}

function normalizePartialNestedObject<T extends object>(value: unknown): Partial<T> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return { ...(value as Partial<T>) };
}

export function normalizePartialChatAppearanceSettings(
  appearance?: PartialChatAppearanceSettings | null,
): PartialChatAppearanceSettings {
  if (!appearance || typeof appearance !== 'object') {
    return {};
  }

  const normalized: PartialChatAppearanceSettings = {};

  const layout = normalizePartialNestedObject<ChatAppearanceLayoutSettings>(appearance.layout);
  if (layout) {
    normalized.layout = layout;
  }

  const sticky = normalizePartialNestedObject<ChatAppearanceStickySettings>(appearance.sticky);
  if (sticky) {
    normalized.sticky = sticky;
  }

  const background = normalizePartialNestedObject<ChatAppearanceBackgroundSettings>(appearance.background);
  if (background) {
    normalized.background = background;
  }

  const user = normalizePartialNestedObject<ChatAppearanceUserSettings>(appearance.user);
  if (user) {
    normalized.user = user;
  }

  const assistant = normalizePartialNestedObject<ChatAppearanceAssistantSettings>(appearance.assistant);
  if (assistant) {
    normalized.assistant = assistant;
  }

  const input = normalizePartialNestedObject<ChatAppearanceInputSettings>(appearance.input);
  if (input) {
    normalized.input = input;
  }

  const scrollbar = normalizePartialNestedObject<ChatAppearanceScrollbarSettings>(appearance.scrollbar);
  if (scrollbar) {
    normalized.scrollbar = scrollbar;
  }

  const advanced = normalizePartialNestedObject<ChatAppearanceAdvancedSettings>(appearance.advanced);
  if (advanced) {
    normalized.advanced = advanced;
  }

  return normalized;
}

function normalizeChatAppearanceBackgroundSettings(
  background: Partial<ChatAppearanceBackgroundSettings> | null | undefined,
  defaults: ChatAppearanceBackgroundSettings,
): ChatAppearanceBackgroundSettings {
  return {
    ...defaults,
    ...(background ?? {}),
    imagePath: typeof background?.imagePath === 'string' ? background.imagePath.trim() : defaults.imagePath,
    imageMimeType: typeof background?.imageMimeType === 'string'
      ? background.imageMimeType.trim()
      : defaults.imageMimeType,
    imageDisplayName: typeof background?.imageDisplayName === 'string'
      ? background.imageDisplayName.trim()
      : defaults.imageDisplayName,
    fitMode: normalizeChatAppearanceBackgroundFitMode(background?.fitMode),
    opacity: normalizeFiniteNumberInRange(background?.opacity, defaults.opacity, 0, 100),
    blur: normalizeFiniteNumberInRange(background?.blur, defaults.blur, 0, 48),
    depth: normalizeFiniteNumberInRange(background?.depth, defaults.depth, 0, 36),
    dim: normalizeFiniteNumberInRange(background?.dim, defaults.dim, 0, 88),
    edgeFade: normalizeFiniteNumberInRange(background?.edgeFade, defaults.edgeFade, 0, 80),
    saturation: normalizeFiniteNumberInRange(background?.saturation, defaults.saturation, 50, 200),
    brightness: normalizeFiniteNumberInRange(background?.brightness, defaults.brightness, 40, 140),
    focusX: normalizeFiniteNumberInRange(background?.focusX, defaults.focusX, 0, 100),
    focusY: normalizeFiniteNumberInRange(background?.focusY, defaults.focusY, 0, 100),
  };
}

function normalizeChatAppearanceUserSettings(
  user: Partial<ChatAppearanceUserSettings> | null | undefined,
  defaults: ChatAppearanceUserSettings,
): ChatAppearanceUserSettings {
  return {
    ...defaults,
    ...(user ?? {}),
    timeFontSize: normalizeFiniteNumberInRange(user?.timeFontSize, defaults.timeFontSize, 6, 36),
    timeFontWeight: normalizeFontWeightValue(user?.timeFontWeight, defaults.timeFontWeight),
    timeColor: normalizeCssColorValue(user?.timeColor, defaults.timeColor),
  };
}

function normalizeChatAppearanceAssistantSettings(
  assistant: Partial<ChatAppearanceAssistantSettings> | null | undefined,
  defaults: ChatAppearanceAssistantSettings,
): ChatAppearanceAssistantSettings {
  const normalizedMetaFontSize = normalizeFiniteNumberInRange(
    assistant?.metaFontSize,
    defaults.metaFontSize,
    6,
    36,
  );

  return {
    ...defaults,
    ...(assistant ?? {}),
    metaFontSize: normalizedMetaFontSize,
    timeFontSize: normalizeFiniteNumberInRange(assistant?.timeFontSize, normalizedMetaFontSize, 6, 36),
    timeFontWeight: normalizeFontWeightValue(assistant?.timeFontWeight, defaults.timeFontWeight),
    metaColor: normalizeCssColorValue(assistant?.metaColor, defaults.metaColor),
    timeColor: normalizeCssColorValue(assistant?.timeColor, defaults.timeColor),
    modelIdFontSize: normalizeFiniteNumberInRange(assistant?.modelIdFontSize, normalizedMetaFontSize, 6, 36),
    modelIdFontWeight: normalizeFontWeightValue(assistant?.modelIdFontWeight, defaults.modelIdFontWeight),
    modelIdColor: normalizeCssColorValue(assistant?.modelIdColor, defaults.modelIdColor),
  };
}

function normalizeFontFamilyValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.length > 200) return trimmed.slice(0, 200);
  return trimmed;
}

function normalizeChatAppearanceInputSettings(
  input: Partial<ChatAppearanceInputSettings> | null | undefined,
  defaults: ChatAppearanceInputSettings,
): ChatAppearanceInputSettings {
  return {
    ...defaults,
    ...(input ?? {}),
    actionButtonStyle: normalizeInputPanelActionButtonStyleId(input?.actionButtonStyle),
    contextRingStyle: normalizeContextRingStyleId(input?.contextRingStyle),
    enFontFamily: normalizeFontFamilyValue(input?.enFontFamily) || defaults.enFontFamily,
    cnFontFamily: normalizeFontFamilyValue(input?.cnFontFamily),
  };
}

function normalizeChatAppearanceLayoutSettings(
  layout: Partial<ChatAppearanceLayoutSettings> | null | undefined,
  defaults: ChatAppearanceLayoutSettings,
): ChatAppearanceLayoutSettings {
  return {
    messagesPaddingTop: normalizeFiniteNumberInRange(layout?.messagesPaddingTop, defaults.messagesPaddingTop, 0, 32),
    messagesPaddingX: normalizeFiniteNumberInRange(layout?.messagesPaddingX, defaults.messagesPaddingX, 0, 32),
    messagePaddingX: normalizeFiniteNumberInRange(layout?.messagePaddingX, defaults.messagePaddingX, 0, 48),
    contentPaddingX: normalizeFiniteNumberInRange(layout?.contentPaddingX, defaults.contentPaddingX, 0, 32),
    contentPaddingY: normalizeFiniteNumberInRange(layout?.contentPaddingY, defaults.contentPaddingY, 0, 32),
  };
}

export function normalizeChatAppearanceSettings(
  appearance?: PartialChatAppearanceSettings | null,
): ChatAppearanceSettings {
  const defaults = getDefaultChatAppearanceSettings();

  return {
    layout: normalizeChatAppearanceLayoutSettings(appearance?.layout, defaults.layout),
    sticky: {
      ...defaults.sticky,
      ...(appearance?.sticky ?? {}),
    },
    background: normalizeChatAppearanceBackgroundSettings(appearance?.background, defaults.background),
    user: normalizeChatAppearanceUserSettings(appearance?.user, defaults.user),
    assistant: normalizeChatAppearanceAssistantSettings(appearance?.assistant, defaults.assistant),
    input: normalizeChatAppearanceInputSettings(appearance?.input, defaults.input),
    scrollbar: {
      ...defaults.scrollbar,
      ...(appearance?.scrollbar ?? {}),
    },
    advanced: {
      ...defaults.advanced,
      ...(appearance?.advanced ?? {}),
    },
  };
}

export function isThemePresetId(value: unknown): value is ThemePresetId {
  switch (value) {
    case 'glass-classic':
    case 'glass-warm':
    case 'glass-mint':
    case 'flat-slate':
    case 'flat-ocean':
    case 'flat-rose':
    case 'soft-neutral':
    case 'soft-lavender':
    case 'soft-latte':
    case 'sharp-graphite':
    case 'sharp-neon':
    case 'sharp-amber':
      return true;
    default:
      return false;
  }
}

export function getDefaultThemeSettings(): ThemeSettings {
  return {
    activePresetId: 'glass-classic',
    customAppearanceOverrides: {},
  };
}

export function normalizeThemeSettings(value?: Partial<ThemeSettings> | null): ThemeSettings {
  const defaults = getDefaultThemeSettings();

  return {
    activePresetId:
      value?.activePresetId === null
        ? null
        : isThemePresetId(value?.activePresetId)
          ? value.activePresetId
          : defaults.activePresetId,
    customAppearanceOverrides: normalizePartialChatAppearanceSettings(value?.customAppearanceOverrides),
  };
}

export function isValidChatAppearanceCustomCssDeclarations(value: string): boolean {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return true;
  }

  const loweredValue = trimmedValue.toLowerCase();
  return !trimmedValue.includes('{')
    && !trimmedValue.includes('}')
    && !loweredValue.includes('<style')
    && !loweredValue.includes('</style');
}

export interface PersistedTabModelOverride {
  provider: string;
  model: string;
}

export interface PersistedTabEntry {
  id?: string;
  parentTabId?: string;
  conversationId: string | null;
  title: string;
  modelOverride: PersistedTabModelOverride | null;
}

export interface PersistedTabState {
  tabs: PersistedTabEntry[];
  activeTabIndex: number;
}

export function getDefaultPersistedTabState(): PersistedTabState {
  return {
    tabs: [],
    activeTabIndex: 0,
  };
}

export function normalizePersistedTabState(state?: Partial<PersistedTabState> | null): PersistedTabState {
  const tabs = Array.isArray(state?.tabs)
    ? state.tabs.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }

        const conversationId = typeof entry.conversationId === 'string'
          ? entry.conversationId
          : null;
        const id = typeof entry.id === 'string' && entry.id.trim()
          ? entry.id
          : undefined;
        const parentTabId = typeof entry.parentTabId === 'string' && entry.parentTabId.trim()
          ? entry.parentTabId
          : undefined;
        const title = typeof entry.title === 'string' && entry.title.trim()
          ? entry.title
          : '';
        const modelOverride =
          entry.modelOverride
          && typeof entry.modelOverride === 'object'
          && typeof entry.modelOverride.provider === 'string'
          && typeof entry.modelOverride.model === 'string'
            ? {
                provider: entry.modelOverride.provider,
                model: entry.modelOverride.model,
              }
            : null;

        return [{
          id,
          parentTabId,
          conversationId,
          title,
          modelOverride,
        }];
      })
    : [];

  return {
    tabs,
    activeTabIndex: Number.isInteger(state?.activeTabIndex) && (state?.activeTabIndex ?? 0) >= 0
      ? (state?.activeTabIndex as number)
      : 0,
  };
}

export interface AcpAgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  cwd?: string;
}

/** Main settings interface */
export interface OpenCodianSettings {
  // User preferences
  userName: string;

  /** Currently active backend for new conversations, if one is enabled. */
  activeBackend: AgentBackendKind | undefined;

  /** List of enabled backends. It can be empty when all agents are disabled. */
  enabledBackends: AgentBackendKind[];

  capabilityLabSelectedBackend: string | undefined;

  /** Backend-specific settings that should not be flattened into OpenCode fields. */
  backendSettings: BackendSettings;

  // Server configuration
  server: ServerConfig;

  // Security
  enableBlocklist: boolean;
  allowExternalAccess: boolean;
  blockedCommands: PlatformBlockedCommands;
  permissionMode: PermissionMode;
  autoRestartOnPermissionChange: boolean;

  // Model settings
  modelSourceMode: ModelSourceMode;
  defaultProvider: string;
  defaultModel: string;
  titleMode: TitleMode;
  questionDisplayMode: QuestionDisplayMode;
  questionCardPosition: QuestionCardPosition;
  showAnsweredQuestionCards: boolean;
  aiTitleModel: string;
  disabledModelRefs: string[];
  disabledPluginSpecs: string[];
  renderUserMarkupAsCodeBlocks: boolean;
  pluginIsolationMode: PluginIsolationMode;
  providers: ModelProviderConfig[];
  providerIconLibrary: ProviderIconLibrary;
  providerIconColorMode: ProviderIconColorMode;
  providerIconDefaultVariant: LobehubIconVariant;
  /** Local per-provider/model USD-per-million overrides for cost estimates. */
  modelPricingOverrides: ModelPricingOverride[];
  effortLevel: EffortLevel;
  thinkingBudget: ThinkingBudget;

  // Content settings
  excludedTags: string[];
  mediaFolder: string;
  systemPrompt: string;
  allowedExportPaths: string[];

  // UI settings
  enableTabs: boolean;
  maxTabs: number;
  tabBarPosition: TabBarPosition;
  belowHeaderTabBarLayout: BelowHeaderTabBarLayout;
  enableAutoScroll: boolean;
  showModifiedFilesSidebar: boolean;
  chatFontSizePx: number;
  chatScrollMode: ChatScrollMode;
  inputPanelTheme: InputPanelThemeId;
  inputPanelGlassRefraction: InputPanelGlassRefractionSettings;
  inputPanelGlassRefractionSvgFilter: InputPanelGlassRefractionSvgFilterSettings;
  inputPanelGlassRefractionGlassDefaultsVersion: number;
  inputPanelLiquidGlass: InputPanelLiquidGlassSettings;
  chatAppearance: ChatAppearanceSettings;
  settingsPanelScrollTop: number;
  modelAvailabilitySectionOpen: boolean;
  modelToolsSectionOpen: boolean;
  enableDebugLogging: boolean;
  inlineSerializedDebugLogArgs: boolean;
  debugModuleSettings: DebugModuleSettings;
  debugRefreshIntervalMs: number;
  debugLogPaths: PlatformDebugLogPaths;
  openInMainTab: boolean;
  settingsInEditorArea: boolean;
  tabState: PersistedTabState;
  theme: ThemeSettings;

  // Settings UI layout
  settingsLayoutMode: 'classic' | 'tabbed';
  settingsTabbedPrimaryTab: string;
  settingsTabbedSecondaryTabByPrimary: Record<string, string>;

  /** Persisted plugin-update notification and catalogue metadata. */
  pluginUpdateState: PluginUpdatePersistedState;

  // Language
  locale: string;

  // Hidden slash commands
  hiddenSlashCommands: string[];

  // OpenCode skill slash command invocation mode
  slashCommandSkillMode: SlashCommandSkillMode;

  // Skill management (UI preferences only)
  skillCatalogCacheTtl: number;

  // Tool catalog (UI preferences only)
  toolCatalogCacheTtl: number;

  // ACP client (agent configs)
  acpAgents: AcpAgentConfig[];

  /**
   * Versioned envelope for OpenCode SDK capability preferences and experimental
   * gates. Optional because the normalizer handles defaults; persisted only
   * when the user has overrides or a migration report to keep.
   */
  opencodeCapabilities?: OpenCodeCapabilitySettings;
}

export type SettingsLayoutMode = 'classic' | 'tabbed';

export function normalizeSettingsLayoutMode(value: unknown): SettingsLayoutMode {
  switch (value) {
    case 'classic':
    case 'tabbed':
      return value;
    default:
      return 'tabbed';
  }
}

export function normalizeSettingsTabbedPrimaryTab(value: unknown, fallback: string): string {
  const normalizePrimaryTabId = (candidate: string): string => {
    const trimmed = candidate.trim();
    if (trimmed === 'language') {
      return 'general';
    }
    return trimmed;
  };

  const normalizedFallback = normalizePrimaryTabId(fallback);
  return typeof value === 'string' && value.trim().length > 0
    ? normalizePrimaryTabId(value)
    : normalizedFallback;
}

export function normalizeSettingsTabbedSecondaryTabByPrimary(
  value: unknown,
): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === 'string' && val.trim().length > 0 && key.trim().length > 0) {
      const trimmedKey = key.trim();
      const trimmedValue = val.trim();
      if (trimmedKey === 'language') {
        normalized.general = trimmedValue === 'general' ? 'language' : trimmedValue;
        continue;
      }

      if (trimmedKey === 'general' && trimmedValue === 'general') {
        normalized.general = 'basic';
        continue;
      }

      normalized[trimmedKey] = trimmedValue;
    }
  }
  return normalized;
}

/** Default settings */
export const DEFAULT_SETTINGS: OpenCodianSettings = {
  userName: '',
  activeBackend: 'opencode',
  enabledBackends: ['opencode'],
  capabilityLabSelectedBackend: undefined,
  backendSettings: getDefaultBackendSettings(),

  server: {
    mode: 'local',
    local: {
      host: OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST,
      port: OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT,
      autoStart: true,
      executablePath: '',
    },
    remote: {
      baseUrl: `http://${OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST}:${OPENCODE_LEGACY_LOCAL_DEFAULT_PORT}`,
    },
    auth: {
      type: 'none',
      username: 'opencode',
      password: '',
      token: '',
    },
  },

  enableBlocklist: true,
  allowExternalAccess: false,
  blockedCommands: getDefaultBlockedCommands(),
  permissionMode: 'yolo',
  autoRestartOnPermissionChange: false,

  modelSourceMode: 'merge',
  defaultProvider: 'anthropic',
  defaultModel: 'claude-3-5-sonnet-20241022',
  titleMode: 'default',
  questionDisplayMode: 'all',
  questionCardPosition: 'inline',
  showAnsweredQuestionCards: true,
  aiTitleModel: '',
  disabledModelRefs: [],
  disabledPluginSpecs: [],
  renderUserMarkupAsCodeBlocks: true,
  pluginIsolationMode: 'default',
  providers: [
    {
      id: 'anthropic',
      name: 'Anthropic',
      enabled: true,
    },
  ],
  providerIconLibrary: {},
  providerIconColorMode: 'system',
  providerIconDefaultVariant: 'auto',
  modelPricingOverrides: [],
  effortLevel: 'high',
  thinkingBudget: 4096,

  excludedTags: [],
  mediaFolder: '',
  systemPrompt: '',
  allowedExportPaths: ['~/Desktop', '~/Downloads'],

  enableTabs: true,
  maxTabs: 3,
  tabBarPosition: 'below-header',
  belowHeaderTabBarLayout: 'grid',
  enableAutoScroll: true,
  showModifiedFilesSidebar: true,
  chatFontSizePx: DEFAULT_CHAT_FONT_SIZE_PX,
  chatScrollMode: 'sticky-mask',
  inputPanelTheme: 'preset',
  inputPanelGlassRefraction: getDefaultInputPanelGlassRefractionSettings(),
  inputPanelGlassRefractionSvgFilter: getDefaultInputPanelGlassRefractionSvgFilterSettings(),
  inputPanelGlassRefractionGlassDefaultsVersion: 2,
  inputPanelLiquidGlass: getDefaultInputPanelLiquidGlassSettings(),
  chatAppearance: getDefaultChatAppearanceSettings(),
  settingsPanelScrollTop: 0,
  modelAvailabilitySectionOpen: true,
  modelToolsSectionOpen: true,
  enableDebugLogging: false,
  inlineSerializedDebugLogArgs: false,
  debugModuleSettings: getDefaultDebugModuleSettings(),
  debugRefreshIntervalMs: normalizeDebugRefreshIntervalMs(undefined),
  debugLogPaths: getDefaultDebugLogPaths(),
  openInMainTab: false,
  settingsInEditorArea: true,
  tabState: getDefaultPersistedTabState(),
  theme: getDefaultThemeSettings(),

  settingsLayoutMode: 'tabbed',
  settingsTabbedPrimaryTab: 'server',
  settingsTabbedSecondaryTabByPrimary: {},
  pluginUpdateState: {
    lastCheckAt: null,
    lastNotifiedVersion: null,
    latestStableVersion: null,
    lastSource: null,
  },

  locale: 'en',

  hiddenSlashCommands: [],
  slashCommandSkillMode: 'direct',
  skillCatalogCacheTtl: 30000,
  toolCatalogCacheTtl: 30000,
  acpAgents: [],

  // Capability settings envelope is intentionally undefined; the normalizer in
  // OpenCodeCapabilitySettingsMigration supplies defaults on first load.
  opencodeCapabilities: undefined,
};

export function normalizeQuestionCardSettings(
  value?: Partial<Pick<
    OpenCodianSettings,
    'questionDisplayMode' | 'questionCardPosition' | 'showAnsweredQuestionCards'
  >> | null,
): Pick<
  OpenCodianSettings,
  'questionDisplayMode' | 'questionCardPosition' | 'showAnsweredQuestionCards'
> {
  return {
    questionDisplayMode: normalizeQuestionDisplayMode(value?.questionDisplayMode),
    questionCardPosition: normalizeQuestionCardPosition(value?.questionCardPosition),
    showAnsweredQuestionCards:
      typeof value?.showAnsweredQuestionCards === 'boolean'
        ? value.showAnsweredQuestionCards
        : DEFAULT_SETTINGS.showAnsweredQuestionCards,
  };
}

export function normalizeModelProviderPluginDebugSettings(
  value?: (Partial<Pick<
    OpenCodianSettings,
    | 'aiTitleModel'
    | 'disabledModelRefs'
    | 'disabledPluginSpecs'
    | 'renderUserMarkupAsCodeBlocks'
    | 'pluginIsolationMode'
    | 'providerIconLibrary'
    | 'providerIconColorMode'
    | 'providerIconDefaultVariant'
    | 'modelPricingOverrides'
    | 'modelAvailabilitySectionOpen'
    | 'modelToolsSectionOpen'
    | 'inlineSerializedDebugLogArgs'
    | 'debugModuleSettings'
    | 'debugRefreshIntervalMs'
    | 'debugLogPaths'
  >> & {
    debugLogPath?: unknown;
  }) | null,
): Pick<
  OpenCodianSettings,
  | 'aiTitleModel'
  | 'disabledModelRefs'
  | 'disabledPluginSpecs'
  | 'renderUserMarkupAsCodeBlocks'
  | 'pluginIsolationMode'
  | 'providerIconLibrary'
  | 'providerIconColorMode'
  | 'providerIconDefaultVariant'
  | 'modelPricingOverrides'
  | 'modelAvailabilitySectionOpen'
  | 'modelToolsSectionOpen'
  | 'inlineSerializedDebugLogArgs'
  | 'debugModuleSettings'
  | 'debugRefreshIntervalMs'
  | 'debugLogPaths'
> {
  const normalizedDebugLogPaths: PlatformDebugLogPaths = {
    ...DEFAULT_SETTINGS.debugLogPaths,
    ...(
      value?.debugLogPaths && typeof value.debugLogPaths === 'object'
        ? value.debugLogPaths
        : {}
    ),
  };
  const legacyDebugLogPath = typeof value?.debugLogPath === 'string'
    ? value.debugLogPath.trim()
    : '';

  if (legacyDebugLogPath.length > 0 && !normalizedDebugLogPaths[getCurrentPlatformKey()]) {
    normalizedDebugLogPaths[getCurrentPlatformKey()] = legacyDebugLogPath;
  }

  return {
    aiTitleModel: typeof value?.aiTitleModel === 'string' ? value.aiTitleModel.trim() : '',
    disabledModelRefs: normalizeDisabledModelRefs(value?.disabledModelRefs),
    disabledPluginSpecs: normalizeDisabledPluginSpecs(value?.disabledPluginSpecs),
    renderUserMarkupAsCodeBlocks: normalizeBoolean(
      value?.renderUserMarkupAsCodeBlocks,
      DEFAULT_SETTINGS.renderUserMarkupAsCodeBlocks,
    ),
    pluginIsolationMode: normalizePluginIsolationMode(value?.pluginIsolationMode),
    providerIconLibrary: normalizeProviderIconLibrary(value?.providerIconLibrary),
    providerIconColorMode: normalizeProviderIconColorMode(value?.providerIconColorMode),
    providerIconDefaultVariant: normalizeLobehubIconVariant(value?.providerIconDefaultVariant),
    modelPricingOverrides: normalizeModelPricingOverrides(value?.modelPricingOverrides),
    modelAvailabilitySectionOpen: normalizeBoolean(
      value?.modelAvailabilitySectionOpen,
      DEFAULT_SETTINGS.modelAvailabilitySectionOpen,
    ),
    modelToolsSectionOpen: normalizeBoolean(
      value?.modelToolsSectionOpen,
      DEFAULT_SETTINGS.modelToolsSectionOpen,
    ),
    inlineSerializedDebugLogArgs: normalizeBoolean(
      value?.inlineSerializedDebugLogArgs,
      DEFAULT_SETTINGS.inlineSerializedDebugLogArgs,
    ),
    debugModuleSettings: normalizeDebugModuleSettings(value?.debugModuleSettings),
    debugRefreshIntervalMs: normalizeDebugRefreshIntervalMs(value?.debugRefreshIntervalMs),
    debugLogPaths: normalizedDebugLogPaths,
  };
}

export function isLocalServerMode(server: ServerConfig): boolean {
  return server.mode === 'local';
}

export function getServerBaseUrl(server: ServerConfig): string {
  if (server.mode === 'remote') {
    return normalizeBaseUrl(server.remote.baseUrl);
  }

  return `http://${server.local.host}:${server.local.port}`;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
