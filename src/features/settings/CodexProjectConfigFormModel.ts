/**
 * CodexProjectConfigFormModel — form model, allowlist validation, and surgical
 * TOML editing for the vault-level `<vault-root>/.codex/config.toml`.
 *
 * SECURITY CONTRACT:
 * - Project-level config can ONLY override safe behavior parameters.
 * - It must NEVER contain model_provider, openai_base_url, [model_providers.*],
 *   auth, notification, telemetry, env_key, headers, query_params, or any
 *   unknown key. These are blocked with focused diagnostics.
 * - Form saves use surgical TOML text editing to preserve comments, key order,
 *   and formatting. If a safe edit cannot be located, save is blocked (no
 *   canonical rewrite).
 * - Absence of a key means "inherit global"; the form never writes `inherit`.
 */

import { parse as parseToml } from 'smol-toml';

// ---------------------------------------------------------------------------
// Allowed project-level safe keys (Codex config.toml snake_case)
// ---------------------------------------------------------------------------

export const CODEX_PROJECT_ALLOWED_SCALAR_KEYS = [
  'model',
  'model_reasoning_effort',
  'sandbox_mode',
  'approval_policy',
  'network_access',
  'web_search',
] as const;

export const CODEX_PROJECT_ALLOWED_ARRAY_KEYS = [
  'additional_directories',
] as const;

export type CodexProjectAllowedKey =
  | typeof CODEX_PROJECT_ALLOWED_SCALAR_KEYS[number]
  | typeof CODEX_PROJECT_ALLOWED_ARRAY_KEYS[number];

/** All keys explicitly allowed in project-level config.toml. */
export const CODEX_PROJECT_ALLOWED_KEYS: ReadonlySet<string> = new Set<string>([
  ...CODEX_PROJECT_ALLOWED_SCALAR_KEYS,
  ...CODEX_PROJECT_ALLOWED_ARRAY_KEYS,
]);

/**
 * Keys explicitly forbidden at the project level (Codex security model).
 * These would allow a malicious project to hijack credentials, exfiltrate
 * data, or override provider/auth.
 */
export const CODEX_PROJECT_FORBIDDEN_KEY_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /^model_provider$/, label: 'model_provider' },
  { pattern: /^openai_base_url$/, label: 'openai_base_url' },
  { pattern: /^model_providers$/i, label: '[model_providers]' },
  { pattern: /^auth$/i, label: 'auth' },
  { pattern: /^notification/i, label: 'notification' },
  { pattern: /^telemetry$/i, label: 'telemetry' },
  { pattern: /^env_key$/i, label: 'env_key' },
  { pattern: /^http_headers$/i, label: 'http_headers' },
  { pattern: /^env_http_headers$/i, label: 'env_http_headers' },
  { pattern: /^query_params$/i, label: 'query_params' },
  { pattern: /^stream_max_retries$/i, label: 'stream_max_retries' },
  { pattern: /^stream_idle_timeout_ms$/i, label: 'stream_idle_timeout_ms' },
  { pattern: /^request_max_retries$/i, label: 'request_max_retries' },
];

// ---------------------------------------------------------------------------
// Form values (inherit = absence)
// ---------------------------------------------------------------------------

export interface CodexProjectConfigFormValues {
  /** Model name string, or null/empty to inherit global. */
  model: string | null;
  /** Reasoning effort enum, or null to inherit global. */
  modelReasoningEffort: string | null;
  /** Sandbox mode enum, or null to inherit global. */
  sandboxMode: string | null;
  /** Approval policy enum (Codex config values), or null to inherit global. */
  approvalPolicy: string | null;
  /** Network access boolean, or null to inherit global. */
  networkAccess: boolean | null;
  /** Web search mode enum (disabled/cached/live), or null to inherit global. */
  webSearch: string | null;
  /** Additional directories array, or null/empty to inherit global. */
  additionalDirectories: string[] | null;
}

export const EMPTY_CODEX_PROJECT_CONFIG_VALUES: CodexProjectConfigFormValues = {
  model: null,
  modelReasoningEffort: null,
  sandboxMode: null,
  approvalPolicy: null,
  networkAccess: null,
  webSearch: null,
  additionalDirectories: null,
};

// ---------------------------------------------------------------------------
// Validation result for advanced TOML mode
// ---------------------------------------------------------------------------

export interface CodexProjectConfigTomlDiagnostic {
  /** The key that triggered the diagnostic. */
  key: string;
  /** Diagnostic kind: forbidden (security), unknown (unrecognized), or invalid-shape (wrong value type/enum). */
  kind: 'forbidden' | 'unknown' | 'invalid-shape';
  /** i18n key for rendering the localized reason. */
  reasonKey: string;
  /** Interpolation parameters for the i18n key. */
  params?: Record<string, string>;
}

export interface CodexProjectConfigValidationResult {
  valid: boolean;
  diagnostics: CodexProjectConfigTomlDiagnostic[];
}

// Strict value-shape policy for allowed keys.
const SCALAR_STRING_KEYS = new Set(['model']);
const SCALAR_ENUM_KEYS: Record<string, readonly string[]> = {
  model_reasoning_effort: ['minimal', 'low', 'medium', 'high', 'xhigh'],
  sandbox_mode: ['read-only', 'workspace-write', 'danger-full-access'],
  approval_policy: ['never', 'on-request', 'on-failure', 'untrusted'],
  web_search: ['disabled', 'cached', 'live'],
};
const SCALAR_BOOLEAN_KEYS = new Set(['network_access']);
const ARRAY_STRING_KEYS = new Set(['additional_directories']);

/**
 * Validate parsed TOML against the project-level allowlist AND strict
 * value-shape policy.
 *
 * - Every top-level key must be in CODEX_PROJECT_ALLOWED_KEYS.
 * - Forbidden keys (model_provider, auth, etc.) get 'forbidden'.
 * - Unknown keys get 'unknown'.
 * - Allowed keys must have the correct value type: string for scalars,
 *   string-in-enum for enum keys, array-of-strings for array keys.
 * - A table value (e.g. `[model]`) for any allowed scalar key is rejected
 *   as 'invalid-shape' — this prevents nested-table bypass of the allowlist.
 *
 * All three diagnostic kinds block save.
 */
export function validateCodexProjectTomlKeys(
  parsed: Record<string, unknown>,
): CodexProjectConfigValidationResult {
  const diagnostics: CodexProjectConfigTomlDiagnostic[] = [];

  for (const key of Object.keys(parsed)) {
    if (!CODEX_PROJECT_ALLOWED_KEYS.has(key)) {
      const forbidden = CODEX_PROJECT_FORBIDDEN_KEY_PATTERNS.find((p) => p.pattern.test(key));
      if (forbidden) {
        diagnostics.push({
          key,
          kind: 'forbidden',
          reasonKey: 'settings.codex.projectConfig.diagnostic.forbidden',
          params: { key, label: forbidden.label },
        });
      } else {
        diagnostics.push({
          key,
          kind: 'unknown',
          reasonKey: 'settings.codex.projectConfig.diagnostic.unknown',
          params: { key, allowed: [...CODEX_PROJECT_ALLOWED_KEYS].join(', ') },
        });
      }
      continue;
    }

    // Strict value-shape check for allowed keys.
    const value = parsed[key];
    const shapeDiag = validateAllowedKeyValueShape(key, value);
    if (shapeDiag) {
      diagnostics.push({ key, kind: 'invalid-shape', ...shapeDiag });
    }
  }

  return { valid: diagnostics.length === 0, diagnostics };
}

/**
 * Validate that an allowed key's value has the correct TOML type/shape.
 * Returns a structured diagnostic (reasonKey + params) if invalid, null if valid.
 */
function validateAllowedKeyValueShape(
  key: string,
  value: unknown,
): { reasonKey: string; params?: Record<string, string> } | null {
  if (SCALAR_STRING_KEYS.has(key)) {
    if (typeof value !== 'string') {
      return {
        reasonKey: 'settings.codex.projectConfig.diagnostic.invalidShape.wrongType',
        params: { key, expected: 'string', actual: tomlTypeName(value) },
      };
    }
    return null;
  }
  const enumValues = SCALAR_ENUM_KEYS[key];
  if (enumValues) {
    if (typeof value !== 'string') {
      return {
        reasonKey: 'settings.codex.projectConfig.diagnostic.invalidShape.wrongType',
        params: { key, expected: 'string', actual: tomlTypeName(value) },
      };
    }
    if (!enumValues.includes(value)) {
      return {
        reasonKey: 'settings.codex.projectConfig.diagnostic.invalidShape.invalidEnum',
        params: { key, allowed: enumValues.join(', '), value },
      };
    }
    return null;
  }
  if (SCALAR_BOOLEAN_KEYS.has(key)) {
    if (typeof value !== 'boolean') {
      return {
        reasonKey: 'settings.codex.projectConfig.diagnostic.invalidShape.wrongType',
        params: { key, expected: 'boolean', actual: tomlTypeName(value) },
      };
    }
    return null;
  }
  if (ARRAY_STRING_KEYS.has(key)) {
    if (!Array.isArray(value)) {
      return {
        reasonKey: 'settings.codex.projectConfig.diagnostic.invalidShape.wrongType',
        params: { key, expected: 'array of strings', actual: tomlTypeName(value) },
      };
    }
    if (!value.every((item) => typeof item === 'string')) {
      return {
        reasonKey: 'settings.codex.projectConfig.diagnostic.invalidShape.arrayElementNotString',
        params: { key },
      };
    }
    return null;
  }
  return null;
}

function tomlTypeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'table';
  return typeof value;
}

/**
 * Parse and validate raw TOML content for the advanced editor.
 * Returns a validation result; never throws.
 */
export function validateCodexProjectTomlContent(
  content: string,
): CodexProjectConfigValidationResult {
  let parsed: Record<string, unknown>;
  try {
    const result = parseToml(content);
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      return {
        valid: false,
        diagnostics: [{ key: '(root)', kind: 'unknown', reasonKey: 'settings.codex.projectConfig.diagnostic.rootNotTable' }],
      };
    }
    parsed = result as Record<string, unknown>;
  } catch {
    return {
      valid: false,
      diagnostics: [{ key: '(parse)', kind: 'unknown', reasonKey: 'settings.codex.projectConfig.diagnostic.parseFailed' }],
    };
  }
  return validateCodexProjectTomlKeys(parsed);
}

// ---------------------------------------------------------------------------
// Surgical TOML editing (preserves comments, key order, formatting)
// ---------------------------------------------------------------------------

export interface TomlScalarEdit {
  /** The TOML key name (snake_case). */
  key: string;
  /** The new value, or null to remove the key (inherit). */
  value: string | null;
  /** If true, value is a bare TOML scalar (boolean/number), not quoted string. */
  bare?: boolean;
}

/**
 * Apply surgical scalar edits to TOML text, preserving comments, key order,
 * and formatting. This does NOT re-serialize the TOML.
 *
 * Strategy per key:
 * - If value is null: remove the `key = ...` line (and its trailing newline).
 * - If key exists as `key = "old"` or `key = old`: replace only the value part
 *   on the same line, preserving the key and indentation.
 * - If key does not exist: append `key = "value"` at the end of the top-level
 *   section (before any `[table]` header, or at EOF if none).
 *
 * If the key appears inside a [table] section or cannot be safely located as a
 * top-level scalar, the edit is skipped (caller should check the result). This
 * avoids canonical rewrite — the decision requires "no canonical rewrite."
 *
 * @returns the edited content, or null if any edit could not be safely applied.
 */
export function applyTomlScalarEdits(
  content: string,
  edits: readonly TomlScalarEdit[],
): string | null {
  let lines = content.split('\n');
  const firstTableHeaderIndex = findFirstTableHeaderIndex(lines);

  for (const edit of edits) {
    if (edit.value === null) {
      lines = removeTopLevelKey(lines, edit.key);
    } else {
      const result = setTopLevelScalar(lines, edit.key, edit.value, { firstTableHeaderIndex, bare: edit.bare });
      if (result === null) {
        // Could not safely locate the key for surgical edit. Block save
        // rather than canonical-rewriting.
        return null;
      }
      lines = result;
    }
  }

  return lines.join('\n');
}

function findFirstTableHeaderIndex(lines: readonly string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('[')) {
      return i;
    }
  }
  return lines.length;
}

/**
 * Remove a top-level `key = ...` line. Only matches keys before the first
 * `[table]` header. Returns lines unchanged if the key is not found.
 */
function removeTopLevelKey(lines: readonly string[], key: string): string[] {
  const keyPattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`);
  const result: string[] = [];
  let removed = false;
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('[')) {
      inTable = true;
    }
    if (!inTable && !removed && keyPattern.test(line)) {
      removed = true;
      continue;
    }
    result.push(line);
  }
  return result;
}

/**
 * Split a TOML value-and-trailing-content string into value and comment.
 * Handles basic strings ("..."), literal strings ('...'), and bare values.
 * Preserves the original comment (including leading space) for surgical edits.
 */
function splitValueAndComment(valuePart: string): { value: string; comment: string } {
  const trimmed = valuePart.trimEnd();
  if (trimmed.startsWith('"')) {
    // Basic string: skip escape sequences and find closing quote.
    let i = 1;
    while (i < trimmed.length) {
      if (trimmed[i] === '\\') { i += 2; continue; }
      if (trimmed[i] === '"') break;
      i++;
    }
    if (i < trimmed.length) {
      return { value: trimmed.slice(0, i + 1), comment: trimmed.slice(i + 1) };
    }
    return { value: trimmed, comment: '' };
  }
  if (trimmed.startsWith("'")) {
    const closeIdx = trimmed.indexOf("'", 1);
    if (closeIdx >= 0) {
      return { value: trimmed.slice(0, closeIdx + 1), comment: trimmed.slice(closeIdx + 1) };
    }
    return { value: trimmed, comment: '' };
  }
  // Bare value: find inline comment (# preceded by whitespace or at start).
  const hashIdx = trimmed.search(/\s#/);
  if (hashIdx >= 0) {
    return { value: trimmed.slice(0, hashIdx), comment: trimmed.slice(hashIdx) };
  }
  return { value: trimmed, comment: '' };
}

/**
 * Set or insert a top-level scalar. Returns null if the key exists but cannot
 * be safely edited in-place (e.g., it's inside a multi-line array or table).
 */
interface SetScalarOptions {
  firstTableHeaderIndex: number;
  bare?: boolean;
}

function setTopLevelScalar(
  lines: readonly string[],
  key: string,
  value: string,
  opts: SetScalarOptions,
): string[] | null {
  const { firstTableHeaderIndex, bare } = opts;
  // Capture original assignment operator spacing: `key=value`, `key = value`, `key  =  value`
  const keyPattern = new RegExp(`^(\\s*)${escapeRegex(key)}(\\s*=\\s*)(.*)$`);
  const result = [...lines];
  let found = false;

  for (let i = 0; i < Math.min(result.length, firstTableHeaderIndex); i++) {
    const match = result[i].match(keyPattern);
    if (match) {
      const existingValuePart = match[3];
      const assignmentOp = match[2]; // preserves original ` = ` spacing
      // Check the existing value isn't a multi-line array.
      if (existingValuePart.trim().startsWith('[') && !existingValuePart.includes(']')) {
        return null;
      }
      // Preserve trailing inline comments.
      const { comment } = splitValueAndComment(existingValuePart);
      const indent = match[1];
      const formatted = bare ? value : formatTomlStringValue(value);
      result[i] = `${indent}${key}${assignmentOp}${formatted}${comment}`;
      found = true;
      break;
    }
  }

  if (!found) {
    const insertIndex = Math.min(firstTableHeaderIndex, result.length);
    const formatted = bare ? value : formatTomlStringValue(value);
    const newLine = `${key} = ${formatted}`;
    // Ensure there's a blank line between top-level scalars and the first
    // table header if the line before the insert isn't blank.
    if (insertIndex > 0 && insertIndex < result.length) {
      const lineBefore = result[insertIndex - 1];
      if (lineBefore.trim().length > 0) {
        result.splice(insertIndex, 0, '', newLine);
      } else {
        result.splice(insertIndex, 0, newLine);
      }
    } else if (insertIndex === 0) {
      result.unshift(newLine);
    } else {
      result.push(newLine);
    }
  }

  return result;
}

function formatTomlStringValue(value: string): string {
  // TOML basic string: escape backslash and double-quote.
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Form values ↔ TOML content conversion
// ---------------------------------------------------------------------------

/**
 * Build the list of scalar edits needed to transform existing TOML content
 * into the form values. Uses surgical editing to preserve comments.
 *
 * Returns null if the edits cannot be safely applied (caller should guide
 * the user to advanced mode).
 */
export function buildProjectConfigEdits(
  values: CodexProjectConfigFormValues,
): TomlScalarEdit[] {
  return [
    { key: 'model', value: values.model?.trim() || null },
    { key: 'model_reasoning_effort', value: values.modelReasoningEffort || null },
    { key: 'sandbox_mode', value: values.sandboxMode || null },
    { key: 'approval_policy', value: values.approvalPolicy || null },
    { key: 'network_access', value: values.networkAccess === null ? null : String(values.networkAccess), bare: true },
    { key: 'web_search', value: values.webSearch || null },
    // additional_directories is handled separately as an array.
  ];
}

/**
 * Parse existing project config TOML into form values.
 * Only extracts allowed keys; ignores everything else silently (the advanced
 * TOML validator catches forbidden keys separately).
 */
export function parseProjectConfigFormValues(
  content: string,
): CodexProjectConfigFormValues {
  let parsed: Record<string, unknown>;
  try {
    const result = parseToml(content);
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      return { ...EMPTY_CODEX_PROJECT_CONFIG_VALUES };
    }
    parsed = result as Record<string, unknown>;
  } catch {
    return { ...EMPTY_CODEX_PROJECT_CONFIG_VALUES };
  }

  const asString = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const asStringArray = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    const filtered = v
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
    return filtered.length > 0 ? filtered : null;
  };

  const asBoolean = (v: unknown): boolean | null =>
    typeof v === 'boolean' ? v : null;

  return {
    model: asString(parsed['model']),
    modelReasoningEffort: asString(parsed['model_reasoning_effort']),
    sandboxMode: asString(parsed['sandbox_mode']),
    approvalPolicy: asString(parsed['approval_policy']),
    networkAccess: asBoolean(parsed['network_access']),
    webSearch: asString(parsed['web_search']),
    additionalDirectories: asStringArray(parsed['additional_directories']),
  };
}
