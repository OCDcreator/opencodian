export type ToolExecutionStatus = 'pending' | 'running' | 'completed' | 'error' | 'blocked';

export interface ToolExecutionStateLike {
  status?: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface ResolveToolExecutionStatusOptions {
  toolName?: string;
  state?: ToolExecutionStateLike | null;
  storedStatus?: ToolExecutionStatus | null;
  result?: string | null;
}

const BLOCKED_RESULT_PATTERNS = [
  /the user dismissed this question/i,
  /the user rejected permission to use this specific tool call/i,
  /the user has specified a rule which prevents you from using this specific tool call/i,
];

const BASH_METADATA_FAILURE_PATTERNS = [
  /bash tool terminated command after exceeding timeout/i,
  /user aborted the command/i,
];

const BASH_OUTPUT_FAILURE_PATTERNS = [
  /^\s*fatal:/im,
  /^\s*curl:\s*\(\d+\)/im,
  /^\s*rm:\s+cannot\b/im,
  /^\s*(?:bash|sh|zsh|ls|cat|cp|mv|rm|find|sed|grep): .*no such file or directory/im,
  /command not found/i,
  /is not recognized as an internal or external command/i,
  /failed to receive handshake/i,
  /permission denied/i,
  /ssl\/tls connection failed/i,
];

function canonicalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function isInternalStructuredOutputTool(toolName?: string | null): boolean {
  if (typeof toolName !== 'string' || !toolName.trim()) {
    return false;
  }

  return canonicalizeToolName(toolName) === 'structuredoutput';
}

function getNumericMetadataValue(metadata: Record<string, unknown> | undefined, key: string): number | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number(value);
  }

  return null;
}

function hasExplicitFailureMetadata(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) {
    return false;
  }

  if (metadata.success === false || metadata.ok === false || metadata.failed === true) {
    return true;
  }

  const failedCount = getNumericMetadataValue(metadata, 'failed');
  if (failedCount !== null && failedCount > 0) {
    return true;
  }

  const exitCode = getNumericMetadataValue(metadata, 'exit') ?? getNumericMetadataValue(metadata, 'exitCode');
  return exitCode !== null && exitCode !== 0;
}

function stripBashMetadata(result: string): string {
  return result.replace(/<bash_metadata>[\s\S]*?<\/bash_metadata>/gi, '').trim();
}

function hasBashFailureMarkers(result: string): boolean {
  if (!result) {
    return false;
  }

  if (BASH_METADATA_FAILURE_PATTERNS.some((pattern) => pattern.test(result))) {
    return true;
  }

  const visibleOutput = stripBashMetadata(result);
  return BASH_OUTPUT_FAILURE_PATTERNS.some((pattern) => pattern.test(visibleOutput));
}

export function resolveToolResultText(
  state?: ToolExecutionStateLike | null,
  result?: string | null,
): string | undefined {
  if (typeof state?.error === 'string' && state.error.trim()) {
    return `Error: ${state.error}`;
  }

  if (typeof state?.output === 'string') {
    return state.output;
  }

  if (typeof result === 'string') {
    return result;
  }

  return undefined;
}

export function isToolExecutionError(options: ResolveToolExecutionStatusOptions): boolean {
  const { toolName, state } = options;
  const result = resolveToolResultText(state, options.result) ?? '';

  if (toolName === 'invalid') {
    return true;
  }

  if (state?.status === 'error') {
    return true;
  }

  if (typeof state?.error === 'string' && state.error.trim()) {
    return true;
  }

  if (result.trimStart().startsWith('Error:')) {
    return true;
  }

  if (hasExplicitFailureMetadata(state?.metadata)) {
    return true;
  }

  return toolName === 'bash' && hasBashFailureMarkers(result);
}

export function isToolExecutionBlocked(options: ResolveToolExecutionStatusOptions): boolean {
  const { state, storedStatus } = options;
  const result = resolveToolResultText(state, options.result) ?? '';

  if (storedStatus === 'blocked') {
    return true;
  }

  if (state?.status === 'blocked') {
    return true;
  }

  return BLOCKED_RESULT_PATTERNS.some((pattern) => pattern.test(result));
}

export function resolveToolExecutionStatus(
  options: ResolveToolExecutionStatusOptions,
): ToolExecutionStatus {
  const { state, storedStatus } = options;

  if (isToolExecutionBlocked(options)) {
    return 'blocked';
  }

  if (state?.status === 'pending' || state?.status === 'running') {
    return state.status;
  }

  if (storedStatus === 'pending' || storedStatus === 'running') {
    return storedStatus;
  }

  if (isToolExecutionError(options)) {
    return 'error';
  }

  const hasResult = resolveToolResultText(state, options.result) !== undefined;
  if (storedStatus === 'completed' || state?.status === 'completed' || hasResult) {
    return 'completed';
  }

  return 'running';
}
