/** Public, non-secret DSH 0.2.2-rc.1 configuration. Runtime validation lives in core.backend. */
export type DshJsonValue = null | boolean | number | string | DshJsonValue[] | DshJsonObject;
export type DshJsonObject = { [key: string]: DshJsonValue };
export type DshThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type DshSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type DshApprovalPolicy = 'ask' | 'never';
export type DshModality = 'text' | 'image';
export type DshPiApi = 'openai-completions' | 'openai-responses' | 'anthropic-messages';
export type DshRetryBackoff = { initialDelayMs?: number; maxDelayMs?: number; jitterRatio?: number };
export type DshRetryPolicy =
  | { mode: 'normal'; maxRetries?: number; retryableCodes?: string[]; backoff?: DshRetryBackoff }
  | { mode: 'always'; backoff?: DshRetryBackoff };
export type DshChatTemplateValue = string | number | boolean | null | {
  $var: 'thinking.enabled' | 'thinking.effort' | 'thinking.budget';
  omitWhenOff?: boolean;
};

/** Only the fields offered by dsh-llm-pi-ai's public compat gate, not all pi-ai internals. */
export type DshPiCompat = {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  supportsFinishReason?: boolean;
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  requiresReasoningContentOnAssistantMessages?: boolean;
  thinkingFormat?: 'openai' | 'deepseek' | 'openrouter' | 'together' | 'baseten' | 'zai' | 'qwen'
    | 'chat-template' | 'qwen-chat-template' | 'string-thinking' | 'ant-ling';
  chatTemplateKwargs?: Record<string, DshChatTemplateValue>;
  chatTemplateArgs?: Record<string, DshChatTemplateValue>;
  supportsThinkingTokenBudget?: boolean;
  thinkingTokenBudgetField?: 'thinking_token_budget' | 'thinking_budget' | 'thinking_budget_tokens';
  vllmPriority?: number;
  supportsMaxOutputTokens?: boolean;
  supportsStrictMode?: boolean;
  cacheControlFormat?: 'anthropic';
  supportsLongCacheRetention?: boolean;
  supportsEagerToolInputStreaming?: boolean;
  supportsCacheControlOnTools?: boolean;
  supportsTemperature?: boolean;
  forceAdaptiveThinking?: boolean;
  allowEmptySignature?: boolean;
  supportsStrictTools?: boolean;
};
export type DshPiModelOverride = {
  name?: string;
  contextWindow?: number;
  /** An explicit model maxTokens also supplies the per-request default. */
  maxTokens?: number;
  input?: DshModality[];
  reasoningEfforts?: false | Partial<Record<DshThinkingLevel, string | null>>;
  compat?: DshPiCompat;
};
export type DshPiModel = DshPiModelOverride & { id: string };
export type DshPiProvider = {
  /** Credential reference name, never the resolved secret. */
  apiKeyEnv?: string;
  displayName?: string;
  api?: DshPiApi;
  baseURL?: string;
  models?: DshPiModel[];
  modelOverrides?: Record<string, DshPiModelOverride>;
  compat?: DshPiCompat;
  /** Capacity fallbacks describe a model; they cannot enlarge its actual capability. */
  defaultContextWindow?: number;
  defaultMaxTokens?: number;
  defaultInput?: DshModality[];
  /** Non-authentication, non-secret HTTP headers only. */
  headers?: Record<string, string>;
  /** OpenCodian-owned extension. Resolve outside vault storage; never emit as a DSH config key. */
  headerCredentialRefs?: Record<string, string>;
  reasoning?: DshThinkingLevel;
  thinkingBudgets?: Partial<Record<'minimal' | 'low' | 'medium' | 'high', number>>;
  cacheRetention?: 'none' | 'short' | 'long';
  transport?: 'sse' | 'websocket' | 'websocket-cached' | 'auto';
  timeoutMs?: number;
  websocketConnectTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  maxRequestImageBytes?: number;
  maxRequestImages?: number;
  imageOffloadCountQuantum?: number;
  requestImagePixelBudget?: number;
  requestImageMaxBytes?: number;
  retryPolicy?: DshRetryPolicy;
};
export type DshDeepSeekModel = {
  id: string;
  name?: string;
  description?: string;
  contextWindow?: number;
  maxTokens?: number;
  inputModalities?: DshModality[];
  imagePixelBudget?: number | 'low';
  imageMaxBytes?: number;
  systemPromptUpdate?: 'in-history';
  toolUpdate?: 'in-history' | 'addition-only';
};
export type DshDeepSeekConfiguration = {
  apiKeyEnv?: string;
  baseURL?: string;
  thinking?: 'enabled' | 'disabled';
  reasoningEffort?: 'off' | 'low' | 'high' | 'max';
  maxTokens?: number;
  defaultContextWindow?: number;
  models?: DshDeepSeekModel[];
  streamIdleTimeoutMs?: number;
  modelsTimeoutMs?: number;
  modelsMaxAgeMs?: number;
  maxRequestFilesBytes?: number;
  maxInlineRequestImageBytes?: number;
  maxImagesPerRequest?: number;
  imageOffloadByteQuantum?: number;
  inlineImageOffloadByteQuantum?: number;
  imageOffloadCountQuantum?: number;
  filesApiTimeoutMs?: number;
  fileExpiresAfterSeconds?: number;
  fileRefreshMarginSeconds?: number;
  fileQuotaCleanupBatch?: number;
  retryPolicy?: DshRetryPolicy;
};
export type DshCompactionPolicy = {
  thresholdRatio?: number;
  headroomTokens?: number;
  retainRatio?: number;
  retainTokens?: number;
  summarizationProvider?: string;
  summarizationModel?: string;
  maxTokens?: number;
  compactionRetries?: number;
  maxOverflowRetries?: number;
};
export type DshPermissionPreset = {
  sandbox: DshSandboxMode;
  approval: DshApprovalPolicy;
  name?: string;
  description?: string;
};

/** Sparse overrides: omission inherits. No row identity, plugin code, or loader control is user-editable. */
export type DshNativeConfigurationNamespaceMap = {
  'agent-default-model': { provider?: string; model?: string; reasoningEffort?: string };
  'llm-deepseek': DshDeepSeekConfiguration;
  'llm-pi-ai': { providers?: Record<string, DshPiProvider> };
  permission: { presets?: Record<string, DshPermissionPreset>; defaultPreset?: string };
  'sandbox-policy': { mode?: DshSandboxMode; workspaceRoot?: string; additionalWritableRoots?: string[] };
  approval: { policy?: DshApprovalPolicy };
  'compaction-basic': DshCompactionPolicy & {
    auto?: boolean;
    modelPolicies?: Array<DshCompactionPolicy & { provider: string; model: string }>;
  };
  'skill-filesystem': {
    providerName?: string;
    includeDefaultRoots?: boolean;
    dshHome?: string;
    agentsHome?: string;
    customSkillDirs?: string[];
    watch?: boolean;
    watchUsePolling?: boolean;
    watchStabilityThresholdMs?: number;
    watchPollIntervalMs?: number;
    watchMaxProjects?: number;
    watchFollowSymlinks?: boolean;
    bundledSkillDir?: string;
  };
  'tool-web': {
    search?: boolean;
    fetch?: boolean;
    searchMaxResults?: number;
    searchMaxQueries?: number;
    searchSummaryMaxChars?: number;
    fetchTimeoutMs?: number;
    searchTimeoutMs?: number;
    fetchMaxOutputChars?: number;
  };
  web: { searchProvider?: string; fetchProvider?: string };
  'tool-fs': {
    read?: boolean;
    readImage?: boolean;
    write?: boolean;
    edit?: boolean;
    applyPatch?: boolean;
    readLimit?: number;
    readMaxLineLength?: number;
    readMaxBytes?: number;
    readStreamMinSize?: number;
  };
  /** Audited rows with no public configurable fields in 0.2.2-rc.1. */
  'fs-observation-policy': Record<string, never>;
  subagent: { maxDepth?: number; maxActiveSubagents?: number };
  'tool-todo': { allowParallelInProgress?: boolean };
  'tool-jobs': {
    waitTimeoutMs?: number;
    maxWaitTimeoutMs?: number;
    completionDelivery?: 'quiet' | 'wakeup';
    maxConsecutiveWakes?: number;
    inlineOutputBytes?: number;
  };
  jobs: { maxConcurrentJobsPerOwner?: number; retainBytes?: number; settledRetainBytes?: number; pumpPollMs?: number };
  'shell-env': { dshHome?: string };
  'timeout-policy': Record<string, never>;
  'llm-retry': Record<string, never>;
  'image-offload': Record<string, never>;
};
export type DshNativeConfigurationNamespace = keyof DshNativeConfigurationNamespaceMap;
export type DshNativeConfigurationOverrides = Partial<DshNativeConfigurationNamespaceMap>;
export type DshNativeConfiguration = { version: 1; overrides: DshNativeConfigurationOverrides };

export interface DshNativeConfigurationFieldDescriptor {
  readonly namespace: DshNativeConfigurationNamespace;
  /** Dotted public path; '*' represents a map key, '[]' an array member. */
  readonly path: string;
  readonly type: 'boolean' | 'string' | 'number' | 'enum' | 'object' | 'array' | 'record' | 'union' | 'null';
  readonly enumValues?: readonly string[];
  readonly alternatives?: readonly DshNativeConfigurationFieldDescriptor[];
  readonly literalValue?: string | number | boolean | null;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly integer?: boolean;
  readonly minimumItems?: number;
  readonly required?: boolean;
  readonly unit?: 'ms' | 'seconds' | 'tokens' | 'bytes' | 'pixels' | 'ratio' | 'count' | 'characters' | 'lines';
  readonly sensitive?: 'credential-reference';
  readonly semantics?: 'capacity-fallback' | 'request-limit' | 'credential-reference' | 'filesystem-path';
  readonly advanced?: boolean;
  readonly source: 'upstream' | 'plugin';
  readonly persistence: 'vault' | 'credential-reference';
  /** A translation key if a consumer supplies a label; never a hard-coded UI label. */
  readonly labelKey?: string;
}
export interface DshNativeConfigurationGroupDescriptor {
  readonly namespace: DshNativeConfigurationNamespace;
  readonly entryId: DshNativeConfigurationNamespace;
  readonly configuration: 'fields' | 'none';
  readonly fields: readonly DshNativeConfigurationFieldDescriptor[];
  readonly labelKey?: string;
}
