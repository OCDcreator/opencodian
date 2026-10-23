/**
 * Single source of truth for the Claude Code settings-file hooks schema.
 * Pure metadata and types only — no parsing, no writing, no UI.
 *
 * Contract pinned to:
 *   - CLI binary 2.1.204 (/Users/dht/.local/share/claude/versions/2.1.204)
 *   - Agent SDK 0.3.145 (sdk.d.ts; HOOK_EVENTS is callback-layer evidence,
 *     while the Settings hook declarations are settings-contract evidence)
 *   - SDK bundled claudeCodeVersion 2.1.145
 *   - Official hooks.md / settings.md (accessed 2026-07-25)
 */

// ---------------------------------------------------------------------------
// Hook events (30) and matcher metadata
// ---------------------------------------------------------------------------

export const CLAUDE_HOOK_EVENTS = [
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied',
  'UserPromptSubmit', 'PostToolBatch', 'Stop', 'StopFailure',
  'SessionStart', 'SessionEnd', 'Setup',
  'Notification', 'SubagentStart', 'SubagentStop',
  'PreCompact', 'PostCompact', 'ConfigChange',
  'FileChanged', 'InstructionsLoaded', 'UserPromptExpansion',
  'Elicitation', 'ElicitationResult',
  'TeammateIdle', 'TaskCreated', 'TaskCompleted',
  'WorktreeCreate', 'WorktreeRemove',
  'MessageDisplay', 'CwdChanged',
] as const;

export type ClaudeHookEvent = typeof CLAUDE_HOOK_EVENTS[number];

/** How a matcher is evaluated for an event. `none` = matcher unsupported (always fires). */
export type ClaudeHookMatcherKind = 'tool' | 'free' | 'enum' | 'file-list' | 'error-type' | 'none';

export interface ClaudeHookEventMatcherMeta {
  readonly supportsMatcher: boolean;
  readonly kind: ClaudeHookMatcherKind;
  /** JSON input field the matcher is tested against, when documented. */
  readonly field?: string;
  /** Confirmed enum suggestions only; never guessed for incomplete sets (e.g. StopFailure). */
  readonly suggestions?: readonly string[];
}

const toolMatcher = (field: string): ClaudeHookEventMatcherMeta => ({ supportsMatcher: true, kind: 'tool', field });
const enumMatcher = (suggestions: readonly string[]): ClaudeHookEventMatcherMeta => ({ supportsMatcher: true, kind: 'enum', suggestions });
const FREE_MATCHER: ClaudeHookEventMatcherMeta = { supportsMatcher: true, kind: 'free' };
const NO_MATCHER: ClaudeHookEventMatcherMeta = { supportsMatcher: false, kind: 'none' };

export const CLAUDE_HOOK_EVENT_CATALOG: Readonly<Record<ClaudeHookEvent, ClaudeHookEventMatcherMeta>> = {
  PreToolUse: toolMatcher('tool_name'),
  PostToolUse: toolMatcher('tool_name'),
  PostToolUseFailure: toolMatcher('tool_name'),
  PermissionRequest: toolMatcher('tool_name'),
  PermissionDenied: toolMatcher('tool_name'),
  UserPromptSubmit: NO_MATCHER,
  PostToolBatch: NO_MATCHER,
  Stop: NO_MATCHER,
  StopFailure: { supportsMatcher: true, kind: 'error-type' },
  SessionStart: enumMatcher(['startup', 'resume', 'clear', 'compact']),
  SessionEnd: enumMatcher(['clear', 'resume', 'logout', 'prompt_input_exit', 'bypass_permissions_disabled', 'other']),
  Setup: enumMatcher(['init', 'maintenance']),
  Notification: enumMatcher(['permission_prompt', 'idle_prompt', 'auth_success', 'elicitation_dialog', 'elicitation_complete', 'elicitation_response', 'agent_needs_input', 'agent_completed']),
  SubagentStart: FREE_MATCHER,
  SubagentStop: FREE_MATCHER,
  PreCompact: enumMatcher(['manual', 'auto']),
  PostCompact: enumMatcher(['manual', 'auto']),
  ConfigChange: enumMatcher(['user_settings', 'project_settings', 'local_settings', 'policy_settings', 'skills']),
  FileChanged: { supportsMatcher: true, kind: 'file-list' },
  InstructionsLoaded: enumMatcher(['session_start', 'nested_traversal', 'path_glob_match', 'include', 'compact']),
  UserPromptExpansion: FREE_MATCHER,
  Elicitation: FREE_MATCHER,
  ElicitationResult: FREE_MATCHER,
  TeammateIdle: NO_MATCHER,
  TaskCreated: NO_MATCHER,
  TaskCompleted: NO_MATCHER,
  WorktreeCreate: NO_MATCHER,
  WorktreeRemove: NO_MATCHER,
  MessageDisplay: NO_MATCHER,
  CwdChanged: NO_MATCHER,
};

// ---------------------------------------------------------------------------
// Handler types (5) and structured field metadata
// ---------------------------------------------------------------------------

export const CLAUDE_HOOK_HANDLER_TYPES = ['command', 'http', 'mcp_tool', 'prompt', 'agent'] as const;

export type ClaudeHookHandlerType = typeof CLAUDE_HOOK_HANDLER_TYPES[number];

export type ClaudeHookFieldKind = 'string' | 'number' | 'string-array' | 'boolean' | 'string-record' | 'json-object';
export type ClaudeHookFieldRequirement = 'required' | 'optional';

export interface ClaudeHookFieldMeta {
  readonly name: string;
  readonly type: ClaudeHookFieldKind;
  readonly requirement: ClaudeHookFieldRequirement;
  /** Allowed values for a constrained string field (e.g. shell). */
  readonly enumValues?: readonly string[];
}

/** Common fields shared by all handler types. `type` is the discriminator. `once` is intentionally absent (ignored in settings files). */
export const CLAUDE_HOOK_COMMON_FIELDS: readonly ClaudeHookFieldMeta[] = [
  { name: 'type', type: 'string', requirement: 'required' },
  { name: 'if', type: 'string', requirement: 'optional' },
  { name: 'timeout', type: 'number', requirement: 'optional' },
  { name: 'statusMessage', type: 'string', requirement: 'optional' },
];

/** Public, structured fields per handler type. Internal/unknown fields (rewakeMessage, rewakeSummary) are intentionally absent. */
export const CLAUDE_HOOK_TYPE_FIELDS: Readonly<Record<ClaudeHookHandlerType, readonly ClaudeHookFieldMeta[]>> = {
  command: [
    { name: 'command', type: 'string', requirement: 'required' },
    { name: 'args', type: 'string-array', requirement: 'optional' },
    { name: 'async', type: 'boolean', requirement: 'optional' },
    { name: 'asyncRewake', type: 'boolean', requirement: 'optional' },
    { name: 'shell', type: 'string', requirement: 'optional', enumValues: ['bash', 'powershell'] },
  ],
  http: [
    { name: 'url', type: 'string', requirement: 'required' },
    { name: 'headers', type: 'string-record', requirement: 'optional' },
    { name: 'allowedEnvVars', type: 'string-array', requirement: 'optional' },
  ],
  mcp_tool: [
    { name: 'server', type: 'string', requirement: 'required' },
    { name: 'tool', type: 'string', requirement: 'required' },
    { name: 'input', type: 'json-object', requirement: 'optional' },
  ],
  prompt: [
    { name: 'prompt', type: 'string', requirement: 'required' },
    { name: 'model', type: 'string', requirement: 'optional' },
    { name: 'continueOnBlock', type: 'boolean', requirement: 'optional' },
  ],
  agent: [
    { name: 'prompt', type: 'string', requirement: 'required' },
    { name: 'model', type: 'string', requirement: 'optional' },
  ],
};

// ---------------------------------------------------------------------------
// Schema provenance + execution semantics
// ---------------------------------------------------------------------------

export interface ClaudeHookSchemaEvidence {
  readonly cliVersion: string;
  readonly sdkVersion: string;
  readonly sdkBundledClaudeCodeVersion: string;
  readonly officialDocsAccessed: string;
  readonly execution: {
    /** Eligible handlers selected by one matcher result execute concurrently. */
    readonly parallel: 'eligible-handlers-within-one-match';
    /** Only identical handlers selected by that same match are deduplicated. */
    readonly deduplication: 'identical-handlers-within-one-match';
    /** Separate async trigger invocations remain independent executions. */
    readonly independentAsyncTriggersDeduplicated: false;
    readonly order: 'document-only';
  };
}

export const CLAUDE_HOOK_SCHEMA_EVIDENCE: ClaudeHookSchemaEvidence = {
  cliVersion: '2.1.204',
  sdkVersion: '0.3.145',
  sdkBundledClaudeCodeVersion: '2.1.145',
  officialDocsAccessed: '2026-07-25',
  execution: {
    parallel: 'eligible-handlers-within-one-match',
    deduplication: 'identical-handlers-within-one-match',
    independentAsyncTriggersDeduplicated: false,
    order: 'document-only',
  },
};
