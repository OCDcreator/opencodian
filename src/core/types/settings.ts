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
import { isSafeVaultRelativePath } from '../../shared/vault';
import {
  CLAUDE_TRACE_CHANNEL_IDS,
  type ClaudeSessionTraceSettings,
  type ClaudeTraceChannelId,
  CODEX_TRACE_CHANNEL_IDS,
  type CodexSessionTraceSettings,
  type CodexTraceChannelId,
} from '../agents/backend/diagnostics/types';
import { type EnvironmentVariablesDomains } from '../agents/BackendEnvironment';
import {
  OPEN_CODE_TRACE_CHANNEL_IDS,
  type OpenCodeSessionTraceSettings,
  type OpenCodeTraceChannelId,
} from '../opencode/diagnostics';
import type { OpenCodeCapabilitySettings } from '../opencode/OpenCodeCapabilitySettingsMigration';
import type { PluginUpdatePersistedState } from '../update/PluginUpdateService';
import type { AgentBackendKind } from './chat';
import type { ModelPricingOverride } from './pricing';

/** Permission mode for tool execution */
export type PermissionMode = 'yolo' | 'plan' | 'normal';

/** Effort level for adaptive thinking models */
export type EffortLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** Backends inline edit can run on. Mirrors the implemented adapter set. */
const INLINE_EDIT_BACKENDS: readonly AgentBackendKind[] = ['opencode', 'claude-code', 'codex', 'pi'];
/** Completion can additionally use ZCode's sessionless text-only path. */
const INLINE_COMPLETION_BACKENDS: readonly AgentBackendKind[] = [...INLINE_EDIT_BACKENDS, 'zcode'];

/**
 * Normalize the per-backend inline-edit model override map.
 *
 * Keeps only known backends with non-empty string values, so a hand-edited or
 * partially migrated settings file cannot make the inline-edit path read a
 * non-string override.
 */
export function normalizeInlineEditModelOverrides(
  value: unknown,
): Partial<Record<AgentBackendKind, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Partial<Record<AgentBackendKind, string>> = {};
  // Kept as a literal rather than imported from the backend barrel: settings is
  // loaded by jsdom unit tests, and the barrel pulls node-only modules in.
  for (const backend of INLINE_EDIT_BACKENDS) {
    const raw = (value as Record<string, unknown>)[backend];
    if (typeof raw === 'string' && raw.trim()) {
      result[backend] = raw.trim();
    }
  }
  return result;
}

/**
 * Normalize the per-backend completion model override map (R-C3).
 *
 * The completion setting reads before the inline-edit chain and is separately
 * normalized because ZCode is available only for sessionless text completion,
 * not generic inline-edit auxiliary queries. This keeps a ZCode entry from
 * accidentally enabling an unsupported generic auxiliary path.
 */
export function normalizeInlineCompletionModelOverrides(
  value: unknown,
): Partial<Record<AgentBackendKind, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Partial<Record<AgentBackendKind, string>> = {};
  for (const backend of INLINE_COMPLETION_BACKENDS) {
    const raw = (value as Record<string, unknown>)[backend];
    if (typeof raw === 'string' && raw.trim()) {
      result[backend] = raw.trim();
    }
  }
  return result;
}

/**
 * Per-backend effort values inline edit accepts, kept as literals for the same
 * jsdom-loading reason as `INLINE_EDIT_BACKENDS`. Claude Code and Codex expose
 * native effort controls; opencode and pi have no aux-session effort seam, so
 * entries for them never normalize.
 */
const INLINE_EDIT_EFFORT_VALUES: Partial<Record<AgentBackendKind, readonly string[]>> = {
  'claude-code': ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'persistent'],
};

/**
 * Normalize the per-backend inline-edit effort override map. Unknown backends
 * and values outside the backend's native effort list are dropped, so a stale
 * or hand-edited settings file cannot send an unsupported effort to a session.
 */
export function normalizeInlineEditEffortOverrides(
  value: unknown,
): Partial<Record<AgentBackendKind, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Partial<Record<AgentBackendKind, string>> = {};
  for (const backend of INLINE_EDIT_BACKENDS) {
    const allowed = INLINE_EDIT_EFFORT_VALUES[backend];
    if (!allowed) continue;
    const raw = (value as Record<string, unknown>)[backend];
    if (typeof raw === 'string' && allowed.includes(raw.trim())) {
      result[backend] = raw.trim();
    }
  }
  return result;
}

export function normalizeCapabilityLabSelectedBackend(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * One user-defined inline-edit preset prompt (R-A2): a menu label plus the
 * instruction body filled into the input when the preset is picked. The shape
 * is settings-layer only — the builtin preset catalog lives in the feature and
 * is always composed on top of this list.
 */
export interface InlineEditPresetPrompt {
  /** Stable unique id. Ids of the builtin catalog are reserved. */
  id: string;
  /** Menu row label. */
  label: string;
  /** Instruction body inserted into the inline-edit input. */
  prompt: string;
}

/** Hard caps for the user-defined preset list, applied at load normalization. */
export const INLINE_EDIT_PRESET_PROMPT_MAX_COUNT = 50;
export const INLINE_EDIT_PRESET_PROMPT_MAX_ID_CHARS = 100;
export const INLINE_EDIT_PRESET_PROMPT_MAX_LABEL_CHARS = 100;
export const INLINE_EDIT_PRESET_PROMPT_MAX_PROMPT_CHARS = 2000;

/** Default and hard bounds for parallel inline edits (R-A5). */
export const INLINE_EDIT_MAX_CONCURRENT_EDITS_DEFAULT = 3;
export const INLINE_EDIT_MAX_CONCURRENT_EDITS_MIN = 1;
export const INLINE_EDIT_MAX_CONCURRENT_EDITS_MAX = 8;

/** Default and hard bounds for the R-C3 suggestion length cap. */
export const INLINE_COMPLETION_MAX_CHARS_DEFAULT = 300;
export const INLINE_COMPLETION_MAX_CHARS_MIN = 50;
export const INLINE_COMPLETION_MAX_CHARS_MAX = 2000;

/**
 * One entry of a user-defined context group (R-B2): a vault-relative path
 * that is either a note or a directory. Groups are persisted in settings and
 * attachable in one click from the inline-edit panel and the chat composer.
 */
export interface ContextGroupEntry {
  /** Vault-relative path (file or folder). */
  path: string;
  /** Entry kind; `'file'` covers any attachable vault text file. */
  kind: 'file' | 'folder';
}

/**
 * A named, ordered set of vault entries the user can attach in one click
 * (R-B2, "主题关联"). Order matters: when a group exceeds the per-turn cap,
 * the first N entries win. Existence is validated at attach time, not here —
 * a stale path is skipped with a notice instead of failing the attach.
 */
export interface ContextGroup {
  /** Stable unique id. */
  id: string;
  /** Display name shown in the attach-topic entries. */
  name: string;
  /** Ordered attachable entries (files or directories). */
  entries: ContextGroupEntry[];
}

/** Hard caps for the context-group list, applied at load normalization. */
export const CONTEXT_GROUP_MAX_COUNT = 50;
export const CONTEXT_GROUP_MAX_ID_CHARS = 100;
export const CONTEXT_GROUP_MAX_NAME_CHARS = 100;
export const CONTEXT_GROUP_MAX_ENTRIES = 200;
export const CONTEXT_GROUP_MAX_PATH_CHARS = 500;

/** Hard caps for the auto-internal-link excluded-term list (R-B1). */
export const AUTO_INTERNAL_LINK_MAX_EXCLUDED_TERMS = 100;
export const AUTO_INTERNAL_LINK_MAX_TERM_CHARS = 100;

/** R-B3 edit-revert retention cap bounds (MiB), applied by load normalization. */
export const EDIT_REVERT_SNAPSHOT_LIMIT_MB_DEFAULT = 50;
export const EDIT_REVERT_SNAPSHOT_LIMIT_MB_MIN = 10;
export const EDIT_REVERT_SNAPSHOT_LIMIT_MB_MAX = 500;

/**
 * Obsidian native tooling mode (R-B4, §10 Q2: CLI first, MCP as a later
 * supplement). `off` is the zero-cost default: no CLI probing, no prompt
 * injection, no request watcher. `cli` routes the agent through the generated
 * gate wrapper for the official desktop CLI. `mcp` is a reserved value for
 * the deferred self-hosted MCP route — accepted and persisted per the
 * requirement's settings table, but NOT implemented this milestone; the
 * settings UI and the chat capability surface say so explicitly.
 */
export type ObsidianToolingMode = 'off' | 'cli' | 'mcp';
export const OBSIDIAN_TOOLING_MODES: readonly ObsidianToolingMode[] = ['off', 'cli', 'mcp'];

/**
 * Normalize the tooling mode: unknown / stale values fall back to `off` so a
 * hand-edited settings file cannot silently activate the capability.
 */
export function normalizeObsidianToolingMode(value: unknown): ObsidianToolingMode {
  return typeof value === 'string' && (OBSIDIAN_TOOLING_MODES as readonly string[]).includes(value)
    ? (value as ObsidianToolingMode)
    : 'off';
}

/**
 * Normalize the R-B3 checkpoint retention cap: finite integers within
 * [MIN, MAX] pass through; anything else falls back to the default so a
 * stale or hand-edited settings file cannot disable retention or inflate
 * the cap without bound.
 */
export function normalizeEditRevertSnapshotLimitMb(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return EDIT_REVERT_SNAPSHOT_LIMIT_MB_DEFAULT;
  }
  const rounded = Math.round(value);
  if (rounded < EDIT_REVERT_SNAPSHOT_LIMIT_MB_MIN || rounded > EDIT_REVERT_SNAPSHOT_LIMIT_MB_MAX) {
    return EDIT_REVERT_SNAPSHOT_LIMIT_MB_DEFAULT;
  }
  return rounded;
}

/** R-C1 whole-vault retrieval bounds, applied by load normalization. */
export const VAULT_RETRIEVAL_TOP_K_DEFAULT = 6;
export const VAULT_RETRIEVAL_TOP_K_MIN = 1;
export const VAULT_RETRIEVAL_TOP_K_MAX = 20;
export const VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_DEFAULT = 4000;
export const VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_MIN = 500;
export const VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_MAX = 20000;
export const VAULT_RETRIEVAL_MAX_EXCLUDED_PATHS = 100;
export const VAULT_RETRIEVAL_MAX_EXCLUDED_PATH_CHARS = 200;

/**
 * Normalize the R-C1 injection count cap: integers within [MIN, MAX] pass
 * through; anything else falls back to the default (edit-revert convention).
 */
export function normalizeVaultRetrievalTopK(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return VAULT_RETRIEVAL_TOP_K_DEFAULT;
  }
  const rounded = Math.round(value);
  if (rounded < VAULT_RETRIEVAL_TOP_K_MIN || rounded > VAULT_RETRIEVAL_TOP_K_MAX) {
    return VAULT_RETRIEVAL_TOP_K_DEFAULT;
  }
  return rounded;
}

/** Normalize the R-C1 per-note truncation cap (same convention as top-K). */
export function normalizeVaultRetrievalMaxCharsPerNote(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_DEFAULT;
  }
  const rounded = Math.round(value);
  if (
    rounded < VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_MIN
    || rounded > VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_MAX
  ) {
    return VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_DEFAULT;
  }
  return rounded;
}

/**
 * Normalize the R-C1 exclusion rule list: non-empty strings only, trimmed,
 * deduplicated case-insensitively, bounded count/length. Rules are
 * vault-relative paths or `*` wildcards within a path segment.
 */
export function normalizeVaultRetrievalExcludedPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const rule = entry.trim().replace(/\\/gu, '/');
    if (rule === '' || rule.length > VAULT_RETRIEVAL_MAX_EXCLUDED_PATH_CHARS) continue;
    const folded = rule.toLowerCase();
    if (seen.has(folded)) continue;
    seen.add(folded);
    result.push(rule);
    if (result.length >= VAULT_RETRIEVAL_MAX_EXCLUDED_PATHS) break;
  }
  return result;
}

// --- R-C2 text-to-image generation -------------------------------------------

/**
 * Wire API format for one configured image-generation model (R-C2). Only the
 * OpenAI images-compatible shape ships in phase 1; the enum is reserved so
 * later formats extend without a settings migration.
 */
export type ImageGenerationApiFormat = 'openai-images';

export const IMAGE_GENERATION_API_FORMATS: readonly ImageGenerationApiFormat[] = ['openai-images'];

/** What happens to a generated asset whose reference was never written (R-C2 §4.6). */
export type ImageGenerationAssetCleanup = 'trash' | 'keep';

export const IMAGE_GENERATION_ASSET_CLEANUPS: readonly ImageGenerationAssetCleanup[] = ['trash', 'keep'];

/** Default embed width for inserted images (R-C2 §7). 0 means natural width. */
export const IMAGE_GENERATION_MAX_WIDTH_DEFAULT = 600;
export const IMAGE_GENERATION_MAX_WIDTH_MIN = 0;
export const IMAGE_GENERATION_MAX_WIDTH_MAX = 100_000;
/** Bounds for one model entry's free-text fields (baseURL/model/size/displayName). */
export const IMAGE_GENERATION_MODEL_FIELD_MAX_CHARS = 500;
export const IMAGE_GENERATION_MAX_MODELS = 20;

/**
 * One configured text-to-image model (R-C2): provider endpoint + model + key.
 * `apiKey` follows the existing settings credential path (same normalization
 * and diagnostic redaction contract as `CodexBackendSettings.apiKey`) and must
 * never be echoed into logs, diagnostics, or non-password UI.
 */
export interface ImageGenerationModelConfig {
  /** Stable id (uuid) so entries can be edited/reordered without re-keying. */
  readonly id: string;
  /** Free-text label shown in pickers; defaults to the model name. */
  readonly displayName: string;
  /** Wire format; phase 1 only ships 'openai-images'. */
  readonly apiFormat: ImageGenerationApiFormat;
  /** API root, e.g. `https://api.openai.com/v1` (no trailing slash). */
  readonly baseURL: string;
  /** Bearer credential, stored and redacted like every other settings key. */
  readonly apiKey: string;
  /** Model name, e.g. `gpt-image-1` or a compatible custom name. */
  readonly model: string;
  /** Requested size, e.g. `1024x1024`; empty string uses the provider default. */
  readonly size: string;
}

/**
 * Normalize the R-C2 model list: keeps well-formed entries only (bounded
 * strings, known apiFormat, non-empty baseURL+model), deduplicates ids,
 * caps the list, and never carries half-edited rows across restarts.
 */
export function normalizeImageGenerationModels(value: unknown): ImageGenerationModelConfig[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const result: ImageGenerationModelConfig[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    const baseURL = typeof candidate.baseURL === 'string' ? candidate.baseURL.trim() : '';
    const model = typeof candidate.model === 'string' ? candidate.model.trim() : '';
    if (!baseURL || !model) continue;
    const rawFormat = typeof candidate.apiFormat === 'string' ? candidate.apiFormat : '';
    const apiFormat: ImageGenerationApiFormat = IMAGE_GENERATION_API_FORMATS.includes(
      rawFormat as ImageGenerationApiFormat,
    )
      ? (rawFormat as ImageGenerationApiFormat)
      : 'openai-images';
    const modelField = model.slice(0, IMAGE_GENERATION_MODEL_FIELD_MAX_CHARS);
    let id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (!id || seenIds.has(id)) {
      id = `imagegen-${result.length}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    seenIds.add(id);
    const displayName = (typeof candidate.displayName === 'string' ? candidate.displayName.trim() : '')
      .slice(0, IMAGE_GENERATION_MODEL_FIELD_MAX_CHARS)
      || modelField;
    result.push({
      id,
      displayName,
      apiFormat,
      baseURL: baseURL.slice(0, IMAGE_GENERATION_MODEL_FIELD_MAX_CHARS).replace(/\/+$/, ''),
      apiKey: typeof candidate.apiKey === 'string' ? candidate.apiKey : '',
      model: modelField,
      size: (typeof candidate.size === 'string' ? candidate.size.trim() : '')
        .slice(0, IMAGE_GENERATION_MODEL_FIELD_MAX_CHARS),
    });
    if (result.length >= IMAGE_GENERATION_MAX_MODELS) break;
  }
  return result;
}

/**
 * Normalize the R-C2 default embed width: integers within [MIN, MAX] pass
 * through; anything else falls back to the default (edit-revert convention).
 */
export function normalizeImageGenerationMaxWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return IMAGE_GENERATION_MAX_WIDTH_DEFAULT;
  }
  const rounded = Math.round(value);
  if (rounded < IMAGE_GENERATION_MAX_WIDTH_MIN || rounded > IMAGE_GENERATION_MAX_WIDTH_MAX) {
    return IMAGE_GENERATION_MAX_WIDTH_DEFAULT;
  }
  return rounded;
}

/** Normalize the R-C2 orphan-asset cleanup policy; unknown values → 'trash'. */
export function normalizeImageGenerationAssetCleanup(value: unknown): ImageGenerationAssetCleanup {
  return IMAGE_GENERATION_ASSET_CLEANUPS.includes(value as ImageGenerationAssetCleanup)
    ? (value as ImageGenerationAssetCleanup)
    : 'trash';
}

// --- R-C6 remote control (external loopback interface) ------------------------

/** Default bind address (R-C6 §7): loopback only unless explicitly re-confirmed. */
export const REMOTE_CONTROL_BIND_ADDRESS_DEFAULT = '127.0.0.1';
/** Hard bound for the free-text bind address field. */
export const REMOTE_CONTROL_BIND_ADDRESS_MAX_CHARS = 45;
/** Hard bound for the stored access token field (base64url of 32 bytes ≈ 43). */
export const REMOTE_CONTROL_TOKEN_MAX_CHARS = 200;
/** Hard bound for the persisted ISO acknowledgement timestamp. */
export const REMOTE_CONTROL_ACKNOWLEDGED_AT_MAX_CHARS = 40;

/**
 * Normalize the R-C6 bind address: `localhost` collapses to `127.0.0.1`
 * (same listener), known loopback literals pass through, and any other
 * non-empty address-shaped string is kept verbatim — binding it requires the
 * non-loopback acknowledgement timestamp, enforced by the service at start
 * time, not by normalization (fail-closed at the security boundary).
 */
export function normalizeRemoteControlBindAddress(value: unknown): string {
  if (typeof value !== 'string') {
    return REMOTE_CONTROL_BIND_ADDRESS_DEFAULT;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return REMOTE_CONTROL_BIND_ADDRESS_DEFAULT;
  }
  if (trimmed.length > REMOTE_CONTROL_BIND_ADDRESS_MAX_CHARS) {
    return REMOTE_CONTROL_BIND_ADDRESS_DEFAULT;
  }
  if (trimmed.toLowerCase() === 'localhost') {
    return '127.0.0.1';
  }
  return trimmed;
}

/**
 * Normalize the R-C6 access token. This field follows the existing settings
 * credential path (same contract as `CodexBackendSettings.apiKey`): string
 * only, never echoed into logs/diagnostics/UI, never cleared by disabling the
 * feature — revocation happens exclusively through regeneration.
 */
export function normalizeRemoteControlToken(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > REMOTE_CONTROL_TOKEN_MAX_CHARS) {
    return '';
  }
  return trimmed;
}

/**
 * Normalize the R-C6 non-loopback acknowledgement timestamp: kept only when
 * it looks like a persisted timestamp, so a corrupted value cannot silently
 * stand in for the user's explicit confirmation.
 */
export function normalizeRemoteControlNonLoopbackAcknowledgedAt(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > REMOTE_CONTROL_ACKNOWLEDGED_AT_MAX_CHARS) {
    return '';
  }
  return trimmed;
}

/**
 * Normalize the R-C6 master switch. `false` (the default) means no
 * `http.Server` is ever constructed — no socket, no listener, zero cost.
 */
export function normalizeRemoteControlEnabled(value: unknown): boolean {
  return value === true;
}

/**
 * Normalize the user-defined context-group list (R-B2). Drops malformed
 * entries (non-strings, empty id/name, oversized fields, paths over the cap
 * or containing `<>` — the same backstop the attached-context block uses) and
 * duplicate ids / duplicate paths within one group, keeping the first
 * occurrence, so a stale or hand-edited settings file cannot produce blank
 * rows, dead chips, or unbounded lists.
 */
export function normalizeContextGroups(value: unknown): ContextGroup[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const result: ContextGroup[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.name !== 'string') continue;
    const id = record.id.trim();
    const name = record.name.trim();
    if (!id || !name) continue;
    if (id.length > CONTEXT_GROUP_MAX_ID_CHARS) continue;
    if (name.length > CONTEXT_GROUP_MAX_NAME_CHARS) continue;
    if (seenIds.has(id)) continue;
    const entries = normalizeContextGroupEntries(record.entries);
    seenIds.add(id);
    result.push({ id, name, entries });
    if (result.length >= CONTEXT_GROUP_MAX_COUNT) break;
  }
  return result;
}

function normalizeContextGroupEntries(value: unknown): ContextGroupEntry[] {
  if (!Array.isArray(value)) return [];
  const seenPaths = new Set<string>();
  const result: ContextGroupEntry[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.path !== 'string') continue;
    const path = record.path.trim();
    if (!path) continue;
    if (path.length > CONTEXT_GROUP_MAX_PATH_CHARS) continue;
    // Angle brackets would break the attached-context tag protocol; the
    // attach-time resolver rejects such paths anyway, so drop them here.
    if (/[<>]/.test(path)) continue;
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    result.push({ path, kind: record.kind === 'folder' ? 'folder' : 'file' });
    if (result.length >= CONTEXT_GROUP_MAX_ENTRIES) break;
  }
  return result;
}

/**
 * Normalize the auto-internal-link excluded-term list (R-B1): trimmed,
 * non-empty, de-duplicated (case/width-folded comparison happens at match
 * time, so the list itself keeps the user's original wording), capped in
 * count and per-term length.
 */
export function normalizeAutoInternalLinkExcludedTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const term = entry.trim();
    if (!term || term.length > AUTO_INTERNAL_LINK_MAX_TERM_CHARS) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    result.push(term);
    if (result.length >= AUTO_INTERNAL_LINK_MAX_EXCLUDED_TERMS) break;
  }
  return result;
}


/**
 * Normalize the parallel-edit cap (R-A5). Non-numbers, NaN and out-of-range
 * values fall back to the default; floats are floored. The cap bounds live
 * auxiliary query sessions, so the upper bound is deliberately small.
 */
export function normalizeInlineEditMaxConcurrentEdits(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return INLINE_EDIT_MAX_CONCURRENT_EDITS_DEFAULT;
  }
  const clamped = Math.floor(value);
  if (clamped < INLINE_EDIT_MAX_CONCURRENT_EDITS_MIN) return INLINE_EDIT_MAX_CONCURRENT_EDITS_DEFAULT;
  if (clamped > INLINE_EDIT_MAX_CONCURRENT_EDITS_MAX) return INLINE_EDIT_MAX_CONCURRENT_EDITS_MAX;
  return clamped;
}

/**
 * Normalize the completion output cap (R-C3). Non-numbers and NaN fall back
 * to the default; out-of-range values clamp; floats floor. The cap is the
 * hard bound `validateCompletion` enforces on every suggestion.
 */
export function normalizeInlineCompletionMaxChars(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return INLINE_COMPLETION_MAX_CHARS_DEFAULT;
  }
  const clamped = Math.floor(value);
  if (clamped < INLINE_COMPLETION_MAX_CHARS_MIN) return INLINE_COMPLETION_MAX_CHARS_MIN;
  if (clamped > INLINE_COMPLETION_MAX_CHARS_MAX) return INLINE_COMPLETION_MAX_CHARS_MAX;
  return clamped;
}

/**
 * Normalize the user-defined inline-edit preset list. Drops malformed entries
 * (non-strings, empty id/label/prompt, oversized fields) and duplicate ids,
 * keeping the first occurrence, so a stale or hand-edited settings file cannot
 * render blank menu rows or unbounded lists.
 */
export function normalizeInlineEditPresetPrompts(value: unknown): InlineEditPresetPrompt[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: InlineEditPresetPrompt[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string'
      || typeof record.label !== 'string'
      || typeof record.prompt !== 'string') {
      continue;
    }
    const id = record.id.trim();
    const label = record.label.trim();
    const prompt = record.prompt.trim();
    if (!id || !label || !prompt) continue;
    if (id.length > INLINE_EDIT_PRESET_PROMPT_MAX_ID_CHARS) continue;
    if (label.length > INLINE_EDIT_PRESET_PROMPT_MAX_LABEL_CHARS) continue;
    if (prompt.length > INLINE_EDIT_PRESET_PROMPT_MAX_PROMPT_CHARS) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, label, prompt });
    if (result.length >= INLINE_EDIT_PRESET_PROMPT_MAX_COUNT) break;
  }
  return result;
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
export type CodexReasoningEffort =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultra'
  | 'persistent';

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
  /** Optional user-installed Codex CLI executable path. Empty uses PATH discovery. */
  executablePath: string;
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
  /** Codex session trace (diagnostics) settings. */
  sessionTrace: CodexSessionTraceSettings;
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
  /** Claude Code session trace (diagnostics) settings. */
  sessionTrace: ClaudeSessionTraceSettings;
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

export interface PiBackendSettings {
  executablePath: string;
  provider: string;
  model: string;
  thinkingLevel: '' | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

export function normalizePiBackendSettings(value: unknown): PiBackendSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const text = (key: string): string => typeof source[key] === 'string' ? (source[key] as string).trim() : '';
  const thinkingLevel = text('thinkingLevel');
  return {
    executablePath: text('executablePath'), provider: text('provider'), model: text('model'),
    thinkingLevel: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(thinkingLevel) ? thinkingLevel as PiBackendSettings['thinkingLevel'] : '',
  };
}

export interface ZCodeBackendSettings {
  /**
   * Optional user-installed ZCode runtime override: the `zcode-agent` native
   * binary, the `zcode.cjs` node bundle, or a directory containing either.
   * Empty means auto-discovery of the official installation (the settings
   * override is never machine-hard-coded).
   */
  executablePath: string;
  /**
   * Persisted default model as `providerId/modelId`. Applied once at session
   * materialization; conversation overrides never overwrite this default.
   */
  model: string;
  /** Persisted default thinking level (validated against the live catalog before use). */
  thinkingLevel: string;
  /** Persisted default mode (plan/build/edit/yolo/auto). Empty = runtime default. */
  mode: '' | 'plan' | 'build' | 'edit' | 'yolo' | 'auto';
}

export function normalizeZCodeBackendSettings(value: unknown): ZCodeBackendSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const text = (key: string): string => typeof source[key] === 'string' ? (source[key] as string).trim() : '';
  const mode = text('mode');
  return {
    executablePath: text('executablePath'),
    model: text('model'),
    thinkingLevel: text('thinkingLevel'),
    mode: ['plan', 'build', 'edit', 'yolo', 'auto'].includes(mode) ? mode as ZCodeBackendSettings['mode'] : '',
  };
}

export interface BackendSettings {
  opencode: {
    sessionTrace: OpenCodeSessionTraceSettings;
  };
  claudeCode: ClaudeCodeBackendSettings;
  codex: CodexBackendSettings;
  pi: PiBackendSettings;
  zcode: ZCodeBackendSettings;
}

export function getDefaultOpenCodeSessionTraceSettings(): OpenCodeSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(
      OPEN_CODE_TRACE_CHANNEL_IDS.map((channelId) => [channelId, true]),
    ) as Record<OpenCodeTraceChannelId, boolean>,
    storageDirectory: '',
  };
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
    sessionTrace: getDefaultClaudeSessionTraceSettings(),
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

export function getDefaultClaudeSessionTraceSettings(): ClaudeSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(
      CLAUDE_TRACE_CHANNEL_IDS.map((channelId) => [channelId, true]),
    ) as Record<ClaudeTraceChannelId, boolean>,
    storageDirectory: '',
  };
}

export function getDefaultBackendSettings(): BackendSettings {
  return {
    opencode: {
      sessionTrace: getDefaultOpenCodeSessionTraceSettings(),
    },
    claudeCode: getDefaultClaudeCodeBackendSettings(),
    codex: getDefaultCodexBackendSettings(),
    pi: normalizePiBackendSettings(undefined),
    zcode: normalizeZCodeBackendSettings(undefined),
  };
}

export function getDefaultCodexSessionTraceSettings(): CodexSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(
      CODEX_TRACE_CHANNEL_IDS.map((channelId) => [channelId, true]),
    ) as Record<CodexTraceChannelId, boolean>,
    storageDirectory: '',
    captureContent: true,
  };
}

export function getDefaultCodexBackendSettings(): CodexBackendSettings {
  return {
    executablePath: '',
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
    sessionTrace: getDefaultCodexSessionTraceSettings(),
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
    sessionTrace: normalizeClaudeSessionTraceSettings(candidate.sessionTrace),
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
    ? value as { opencode?: unknown; claudeCode?: unknown; codex?: unknown; pi?: unknown; zcode?: unknown }
    : {};
  return {
    opencode: normalizeOpenCodeBackendSettings(candidate.opencode),
    claudeCode: normalizeClaudeCodeBackendSettings(candidate.claudeCode),
    codex: normalizeCodexBackendSettings(candidate.codex),
    pi: normalizePiBackendSettings(candidate.pi),
    zcode: normalizeZCodeBackendSettings(candidate.zcode),
  };
}

function normalizeOpenCodeBackendSettings(value: unknown): BackendSettings['opencode'] {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as { sessionTrace?: unknown }
    : {};
  const traceCandidate = candidate.sessionTrace && typeof candidate.sessionTrace === 'object'
    && !Array.isArray(candidate.sessionTrace)
    ? candidate.sessionTrace as Partial<OpenCodeSessionTraceSettings>
    : {};
  const defaults = getDefaultOpenCodeSessionTraceSettings();
  const channels = Object.fromEntries(
    OPEN_CODE_TRACE_CHANNEL_IDS.map((channelId) => [
      channelId,
      traceCandidate.consoleChannels?.[channelId] !== false,
    ]),
  ) as Record<OpenCodeTraceChannelId, boolean>;
  return {
    sessionTrace: {
      enabled: traceCandidate.enabled !== false,
      consolePreset: traceCandidate.consolePreset === 'full' ? 'full' : defaults.consolePreset,
      consoleChannels: channels,
      storageDirectory: typeof traceCandidate.storageDirectory === 'string'
        ? traceCandidate.storageDirectory.trim()
        : defaults.storageDirectory,
    },
  };
}

function normalizeCodexSessionTraceSettings(value: unknown): CodexSessionTraceSettings {
  const traceCandidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<CodexSessionTraceSettings>
    : {};
  const traceDefaults = getDefaultCodexSessionTraceSettings();
  const traceChannels = Object.fromEntries(
    CODEX_TRACE_CHANNEL_IDS.map((channelId) => [
      channelId,
      traceCandidate.consoleChannels?.[channelId] !== false,
    ]),
  ) as Record<CodexTraceChannelId, boolean>;
  return {
    enabled: traceCandidate.enabled !== false,
    consolePreset: traceCandidate.consolePreset === 'full' ? 'full' : traceDefaults.consolePreset,
    consoleChannels: traceChannels,
    storageDirectory: typeof traceCandidate.storageDirectory === 'string'
      ? traceCandidate.storageDirectory.trim()
      : traceDefaults.storageDirectory,
    captureContent: traceCandidate.captureContent !== false,
  };
}

function normalizeClaudeSessionTraceSettings(value: unknown): ClaudeSessionTraceSettings {
  const traceCandidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<ClaudeSessionTraceSettings>
    : {};
  const traceDefaults = getDefaultClaudeSessionTraceSettings();
  const traceChannels = Object.fromEntries(
    CLAUDE_TRACE_CHANNEL_IDS.map((channelId) => [
      channelId,
      traceCandidate.consoleChannels?.[channelId] !== false,
    ]),
  ) as Record<ClaudeTraceChannelId, boolean>;
  return {
    enabled: traceCandidate.enabled !== false,
    consolePreset: traceCandidate.consolePreset === 'off' || traceCandidate.consolePreset === 'full'
      ? traceCandidate.consolePreset
      : traceDefaults.consolePreset,
    consoleChannels: traceChannels,
    storageDirectory: typeof traceCandidate.storageDirectory === 'string'
      ? traceCandidate.storageDirectory.trim()
      : traceDefaults.storageDirectory,
  };
}

function normalizeCodexBackendSettings(value: unknown): CodexBackendSettings {
  const VALID_SANDBOX_MODES: readonly CodexSandboxMode[] = ['read-only', 'workspace-write', 'danger-full-access'];
  const VALID_EFFORTS: readonly CodexReasoningEffort[] = [
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    'ultra',
    'persistent',
  ];
  const VALID_WEB_SEARCH: readonly CodexWebSearchMode[] = ['disabled', 'cached', 'live'];
  const VALID_APPROVAL_POLICY: readonly CodexApprovalPolicy[] = ['inherit', 'untrusted', 'on-request', 'never'];
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as { executablePath?: unknown; apiKey?: unknown; model?: unknown; pricingProviderId?: unknown; pricingEndpoint?: unknown; sandboxMode?: unknown; modelReasoningEffort?: unknown; additionalDirectories?: unknown; networkAccessEnabled?: unknown; webSearchMode?: unknown; approvalPolicy?: unknown; sessionTrace?: unknown }
    : {};
  const rawSandbox = typeof candidate.sandboxMode === 'string' ? candidate.sandboxMode : '';
  const rawEffort = typeof candidate.modelReasoningEffort === 'string' ? candidate.modelReasoningEffort : '';
  const rawWebSearch = typeof candidate.webSearchMode === 'string' ? candidate.webSearchMode : '';
  const rawApprovalPolicy = typeof candidate.approvalPolicy === 'string' ? candidate.approvalPolicy : '';
  return {
    executablePath: typeof candidate.executablePath === 'string' ? candidate.executablePath.trim() : '',
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
    sessionTrace: normalizeCodexSessionTraceSettings(candidate.sessionTrace),
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

export function normalizeUserBubbleStyleId(value: unknown): UserBubbleStyleId {
  switch (value) {
    case 'solid':
    case 'glass':
      return value;
    default:
      return 'solid';
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
  /** Left/right inset of the whole chat frame (header + messages) from the panel edge. */
  messagesAreaInsetX: number;
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

/**
 * User bubble rendering mode. `solid` derives an opaque background from the
 * theme surface color; `glass` is the legacy glassmorphism bubble with
 * backdrop blur and layered gradients.
 */
export type UserBubbleStyleId = 'solid' | 'glass';

export interface ChatAppearanceUserSettings {
  style: UserBubbleStyleId;
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
  /** Left/right inset between the composer card and the panel edge. */
  composerInsetX: number;
  /** Vertical breathing room around the composer card (dock gap below in floating themes; top+bottom in docked themes). */
  composerInsetY: number;
  /** Maximum height the composer textarea may grow to before it scrolls. */
  textareaMaxHeight: number;
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

export type ThemeStyleId = 'glass' | 'flat' | 'soft' | 'sharp' | 'shadcn';

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
  | 'sharp-amber'
  | 'shadcn-neutral';

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
      messagesAreaInsetX: 12,
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
      style: 'solid',
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
      // Slider now mixes against the opaque per-theme lens endpoint
      // (--opencodian-composer-lens-bg-solid), so 32% here keeps the previous
      // glass character that 72% produced against the old translucent endpoint.
      backgroundOpacity: 32,
      blur: 18,
      shadowBlur: 28,
      composerInsetX: 0,
      composerInsetY: 12,
      textareaMaxHeight: 240,
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
    style: normalizeUserBubbleStyleId(user?.style),
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
    composerInsetX: normalizeFiniteNumberInRange(input?.composerInsetX, defaults.composerInsetX, 0, 40),
    composerInsetY: normalizeFiniteNumberInRange(input?.composerInsetY, defaults.composerInsetY, 0, 40),
    textareaMaxHeight: normalizeFiniteNumberInRange(input?.textareaMaxHeight, defaults.textareaMaxHeight, 120, 480),
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
    messagesAreaInsetX: normalizeFiniteNumberInRange(layout?.messagesAreaInsetX, defaults.messagesAreaInsetX, 8, 48),
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
    case 'shadcn-neutral':
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

  /**
   * Master switch for inline edit: while false the editor command and the
   * editor context-menu entry are unavailable.
   */
  inlineEditEnabled: boolean;

  /**
   * Show the floating "inline edit" button next to the active text selection.
   */
  inlineEditSelectionAffordance: boolean;

  /**
   * Typing `@` at the start of a line or right after whitespace opens the
   * inline-edit panel there (the `@` itself is swallowed). Off by default:
   * `@` is a common character (emails, mentions) and conflicts with other
   * plugins' `@` habits (docs/requirements/flowtext-parity.md R-A1, §10 Q1).
   */
  inlineEditTriggerAt: boolean;

  /**
   * Per-backend model override for inline edit. The value format follows each
   * backend: `provider/model` for opencode and pi, an SDK alias or full id for
   * claude-code, a model id for codex. Absent means "use the active chat tab's
   * model, otherwise the backend default".
   */
  inlineEditModelOverrides: Partial<Record<AgentBackendKind, string>>;

  /**
   * Per-backend effort override for inline edit, set from the floating bar's
   * effort picker. Only claude-code and codex have native aux-session effort
   * seams; absent means "the backend's own default effort".
   */
  inlineEditEffortOverrides: Partial<Record<AgentBackendKind, string>>;

  /**
   * User-defined preset prompts for the inline-edit `#` menu (R-A2). The
   * builtin catalog is always composed on top; an empty list means "builtins
   * only". Managed from the settings page (add/remove/edit).
   */
  inlineEditPresetPrompts: InlineEditPresetPrompt[];

  /**
   * How many inline edits may run in parallel inside one editor (R-A5,
   * default 3). Every parallel edit is an independent auxiliary query
   * session, so the cap also bounds concurrent model sessions; opening
   * beyond the cap is refused with a notice rather than silently replacing
   * an existing edit. Clamped to 1–8.
   */
  inlineEditMaxConcurrentEdits: number;

  /**
   * Whole-document inline-edit form (R-A6, default on). When off, the
   * 整篇 mode toggle and the `inline-edit-document` command are hidden.
   */
  inlineEditDocumentModeEnabled: boolean;

  /**
   * Alt-triggered ghost-text inline completion (R-C3, default off). When
   * off there are no completion sessions, no network, and no decoration
   * work — only the gated editor extension registered at plugin load (the
   * documented C3-Q1 deviation, same shape as the `@` trigger).
   */
  inlineCompletionEnabled: boolean;

  /**
   * Prewarm exactly one read-only, empty auxiliary session for the active chat
   * backend. This never submits a prompt or completion turn (R-F4, default off).
   */
  chatWarmSessionEnabled: boolean;

  /**
   * Hard cap for one completion suggestion in characters (R-C3, default
   * 300). Enforced by truncation in `validateCompletion` before any other
   * rule, so a suggestion can never exceed it.
   */
  inlineCompletionMaxChars: number;

  /**
   * Per-backend model override for Alt completions (R-C3). Completions are
   * latency-sensitive — the ghost text cannot appear before the model's first
   * byte — so a user may pin a fast model here without changing inline edit.
   * Value format follows each backend exactly like `inlineEditModelOverrides`
   * (`provider/model` for opencode and pi, a model id/alias for claude-code
   * and codex). Empty map means "use the inline-edit model chain", which is
   * byte-identical to the behaviour before this setting existed.
   */
  inlineCompletionModelOverrides: Partial<Record<AgentBackendKind, string>>;

  /**
   * Auto-internal-link post-processing for inline-edit generation results
   * (R-B1, default off). When on, occurrences of verified reference-note
   * headings in the generated text become internal links before the diff is
   * rendered, so the user sees and can reject them. Off means the generated
   * text is byte-identical to the model output.
   */
  autoInternalLinkEnabled: boolean;

  /**
   * Terms never auto-linked by R-B1 (e.g. generic words like "总结"). The
   * match compares case-/width-folded forms; the list keeps original wording.
   */
  autoInternalLinkExcludedTerms: string[];

  /**
   * User-defined context groups / topics (R-B2): named, ordered sets of vault
   * entries attachable in one click from the inline-edit panel and the chat
   * composer. Persisted here so they survive restarts and work across notes.
   */
  contextGroups: ContextGroup[];

  /**
   * Conversation → vault Markdown export (advantage-parity R-D1). Manual
   * export is always purely additive; `autoExport` (default off) refreshes
   * the note the feature itself created after each turn, giving up honestly
   * when the user edited that note.
   */
  conversationExport: ConversationExportSettings;

  /**
   * Store settings secrets in the Obsidian Keychain instead of `data.json`
   * (advantage-parity R-D2, default on when the host exposes the keychain).
   * The live settings object always holds real values; only the persisted
   * core profile swaps secrets for placeholders. Turning this off is the
   * explicit rollback: the next persist writes real values back into
   * `settings.core.json`.
   */
  secretsKeychainEnabled: boolean;

  /**
   * Play a short chime when a chat turn completes (advantage-parity R-D3,
   * default off). Only fires for background-task conversations or while the
   * Obsidian window is unfocused — never for a foreground turn the user is
   * watching.
   */
  turnCompletionSoundEnabled: boolean;

  /**
   * Vault-relative audio file for the completion chime (R-D3). Empty string
   * uses the embedded builtin chime; an unresolvable path degrades to the
   * builtin with an explicit notice.
   */
  turnCompletionSoundPath: string;

  /**
   * Backend-neutral edit revert master switch (R-B3, default on). When off,
   * no snapshots are captured and the sidebar shows no revert actions; the
   * capture listeners stay cheap no-ops. Independent of OpenCode's
   * session-level `revertSession`, which keeps its own rewind UI.
   */
  editRevertEnabled: boolean;

  /**
   * Retention cap for `.opencodian/checkpoints/` in MiB (R-B3, default 50,
   * clamped 10–500 by load normalization). Oldest checkpoint rounds evict
   * first once the cap is exceeded.
   */
  editRevertSnapshotLimitMb: number;

  /**
   * Obsidian native tooling mode (R-B4, default `off`). When off there is no
   * CLI probing, no prompt injection and no request watcher. `cli` enables
   * the official desktop CLI through the plugin-generated confirmation gate
   * wrapper; `mcp` is reserved for the deferred MCP route and is not
   * implemented this milestone (surfaced as unavailable, never silent).
   */
  obsidianToolingMode: ObsidianToolingMode;

  /**
   * Opt-in whole-vault lexical retrieval (R-C1, §10 Q3, default off). When
   * off there is no indexing, no listeners and no injected context — the
   * outgoing request is byte-identical to the pre-feature behavior. When on,
   * up to `vaultRetrievalTopK` snippets are offered as visible, individually
   * cancellable composer chips each turn.
   */
  vaultRetrievalEnabled: boolean;

  /** Injection count cap (R-C1, default 6, clamped 1–20 by load normalization). */
  vaultRetrievalTopK: number;

  /** Per-note truncation cap in chars (R-C1, default 4000, clamped 500–20000). */
  vaultRetrievalMaxCharsPerNote: number;

  /**
   * Optional embedding channel over the R-C1 index (advantage-parity R-E4,
   * default off — the lexical channel alone is the pre-feature behavior).
   * While on, retrieval injection merges lexical ∪ semantic TopK with each
   * hit labelled by channel; every failure degrades honestly to lexical.
   */
  semanticRetrievalEnabled: boolean;
  /** Provider id from `providers[]` whose OpenAI-compatible /embeddings is used. */
  semanticEmbeddingProvider: string;
  /** Embedding model name sent to the endpoint (free text). */
  semanticEmbeddingModel: string;

  /**
   * Index exclusion rules (R-C1, default none): vault-relative paths,
   * directory prefixes or `*` wildcards within a path segment. `.obsidian/`
   * and `.opencodian/` are always excluded regardless of this list.
   */
  vaultRetrievalExcludedPaths: string[];

  /**
   * Opt-in local PDF index (R-C4, default off). When off no PDF is ever
   * extracted for indexing, no index files are written, and PDF retrieval
   * injects nothing — requests stay byte-identical to the pre-feature
   * behavior. Exclusion rules reuse `vaultRetrievalExcludedPaths`; injection
   * caps reuse `vaultRetrievalTopK` / `vaultRetrievalMaxCharsPerNote`.
   */
  pdfIndexEnabled: boolean;

  /**
   * Configured text-to-image models (R-C2, default none): provider endpoint +
   * model + credential per entry. Credentials follow the existing settings
   * key path and are redacted from every diagnostic surface.
   */
  imageGenerationModels: ImageGenerationModelConfig[];

  /** Default embed width for inserted generated images (R-C2, default 600). */
  imageGenerationMaxWidth: number;

  /**
   * Orphan-asset policy (R-C2 §4.6, default 'trash'): what happens to a
   * generated image whose reference the user never accepted. Documented in
   * the settings description — never a silent behaviour.
   */
  imageGenerationAssetCleanup: ImageGenerationAssetCleanup;

  /**
   * R-C6 remote-drive master switch (default off). While off the plugin
   * constructs no `http.Server` at all — no socket, no listener, no request
   * surface (requirement: "关闭状态：不监听任何端口（含 IPv6）").
   */
  remoteControlEnabled: boolean;

  /**
   * R-C6 bind address (default `127.0.0.1`). `localhost`/`::1` are loopback;
   * any other address requires an explicit second confirmation recorded in
   * `remoteControlNonLoopbackAcknowledgedAt`, and the service re-checks that
   * acknowledgement at start time (UI + service double gate).
   */
  remoteControlBindAddress: string;

  /**
   * R-C6 access token (`crypto.randomBytes(32)` → base64url). Follows the
   * existing settings credential path (same contract as
   * `CodexBackendSettings.apiKey`): string-only normalization, never echoed
   * into logs, diagnostics, or non-password UI. Disabling the feature does
   * NOT clear it (close ≠ revoke); revocation is regeneration.
   */
  remoteControlToken: string;

  /**
   * R-C6 non-loopback confirmation timestamp (ISO string, empty = not
   * acknowledged). Set only through the settings confirmation modal; cleared
   * when the bind address returns to a loopback value, so a stale one-time
   * confirmation can never permanently authorize a network-facing listener.
   */
  remoteControlNonLoopbackAcknowledgedAt: string;

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

  /**
   * advantage-parity R-F8: user-declared context-window caps for catalog
   * models that lack authoritative metadata (key = "provider/model").
   * Applied at the catalog boundary and ONLY where the entry has no
   * contextWindow of its own — an override never masks real metadata.
   * ContextRing percentages and compaction thresholds consume it unchanged
   * through the existing contextWindow flow.
   */
  modelContextWindowOverrides: Record<string, number>;
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
  showTurnChangeRecords: boolean;
  /** R-F5: keep the read-only conversation manager rail visible in wide chat panes. */
  chatSessionRailEnabled: boolean;
  /** R-F6: enable vim-inspired non-editable chat navigation keys. */
  chatVimNavigationEnabled: boolean;
  /** Normalized one-character key for scrolling the active messages pane up. */
  chatVimNavigationUpKey: string;
  /** Normalized one-character key for scrolling the active messages pane down. */
  chatVimNavigationDownKey: string;
  /** Normalized one-character key for focusing the composer. */
  chatVimNavigationComposerKey: string;
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

  /** When enabled, a newer compatible stable release is installed automatically during the startup update check. */
  pluginUpdateAutoInstall: boolean;

  /**
   * Backend-neutral workspace memory (core.memory). Master switch ships
   * dark for safe rollout; the nested knobs mirror MemorySettingsSnapshot.
   */
  memory: MemoryBackendUserSettings;

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
   * Per-provider environment-variable domains (advantage-parity R-F7):
   * `shared` applies to every backend, `providers[backend]` only to that
   * backend kind / provider id. Legacy per-backend env settings keep their
   * override priority; domains merge underneath them.
   */
  environmentVariables: EnvironmentVariablesDomains;

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

/** Anything but a real boolean falls back to the safe default (auto-install off). */
export function normalizePluginUpdateAutoInstall(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.pluginUpdateAutoInstall;
}

/** R-F6 defaults are deliberately letters that are inert while the feature is off. */
export const DEFAULT_CHAT_VIM_NAVIGATION_KEYS = {
  up: 'w',
  down: 's',
  composer: 'i',
} as const;

export interface ChatVimNavigationKeys {
  up: string;
  down: string;
  composer: string;
}

export type ChatVimNavigationKeySlot = keyof ChatVimNavigationKeys;

/**
 * Read one printable, single-code-point key. Whitespace, modifier-looking
 * values, multi-character values and duplicate bindings all fail closed to
 * the stable defaults so a hand-edited settings file cannot shadow normal
 * chat input unexpectedly.
 */
export function normalizeChatVimNavigationKeys(
  value: Partial<ChatVimNavigationKeys> | null | undefined,
): ChatVimNavigationKeys {
  const normalized = {
    up: normalizeChatVimNavigationKey(value?.up, DEFAULT_CHAT_VIM_NAVIGATION_KEYS.up),
    down: normalizeChatVimNavigationKey(value?.down, DEFAULT_CHAT_VIM_NAVIGATION_KEYS.down),
    composer: normalizeChatVimNavigationKey(value?.composer, DEFAULT_CHAT_VIM_NAVIGATION_KEYS.composer),
  };
  const values = Object.values(normalized);
  return new Set(values).size === values.length
    ? normalized
    : { ...DEFAULT_CHAT_VIM_NAVIGATION_KEYS };
}

/**
 * Normalize a single slot's key. An unusable value (non-string, whitespace,
 * multi-code-point, modifier-looking) falls back to that slot's default.
 */
export function normalizeChatVimNavigationKey(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const key = raw.trim().toLowerCase();
  return Array.from(key).length === 1 ? key : fallback;
}

export interface ChatVimNavigationKeyUpdate {
  /** The triple to persist: either the accepted candidate or the previous one. */
  keys: ChatVimNavigationKeys;
  /** True when the candidate collided with another slot and was refused. */
  rejected: boolean;
}

/**
 * Apply a single-slot edit to the binding triple, refusing collisions.
 *
 * The whole-triple reset in {@link normalizeChatVimNavigationKeys} is the right
 * fail-closed answer for a *persisted* map (a hand-edited file with duplicate
 * keys must not silently shadow chat input), but it is the wrong answer for an
 * *interactive* edit: resetting all three would discard the other two valid
 * custom keys the user never touched. So an edit that would collide with
 * another slot is refused outright and the previous triple is returned
 * unchanged; callers surface that refusal instead of silently rewriting the
 * settings. A non-colliding edit only ever changes its own slot.
 */
export function applyChatVimNavigationKey(
  current: Partial<ChatVimNavigationKeys> | null | undefined,
  slot: ChatVimNavigationKeySlot,
  raw: unknown,
): ChatVimNavigationKeyUpdate {
  const base = normalizeChatVimNavigationKeys(current);
  const candidate: ChatVimNavigationKeys = {
    ...base,
    [slot]: normalizeChatVimNavigationKey(raw, DEFAULT_CHAT_VIM_NAVIGATION_KEYS[slot]),
  };
  const values = Object.values(candidate);
  return new Set(values).size === values.length
    ? { keys: candidate, rejected: false }
    : { keys: base, rejected: true };
}

/** advantage-parity R-D2: keychain toggle normalizes to the safe default (on). */
export function normalizeSecretsKeychainEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.secretsKeychainEnabled;
}

/** advantage-parity R-D3: chime toggle normalizes to the safe default (off). */
export function normalizeTurnCompletionSoundEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.turnCompletionSoundEnabled;
}

/** advantage-parity R-F8: string-keyed positive-integer map; junk dropped. */
export function normalizeModelContextWindowOverrides(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [rawRef, rawWindow] of Object.entries(value as Record<string, unknown>)) {
    const ref = rawRef.trim();
    const window = typeof rawWindow === 'number' ? rawWindow : Number(rawWindow);
    const [refProvider, ...rest] = ref.split('/');
    if (!refProvider || rest.length === 0 || !rest.every((part) => part.length > 0)
      || !Number.isInteger(window) || window <= 0 || window > 100_000_000) {
      continue;
    }
    out[ref] = window;
  }
  return out;
}

/** advantage-parity R-E4: semantic retrieval toggle (safe default off). */
export function normalizeSemanticRetrievalEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.semanticRetrievalEnabled;
}

/** advantage-parity R-E4: string-only provider id / model name, trimmed. */
export function normalizeSemanticEmbeddingText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** advantage-parity R-D3: string-only chime path, trimmed. */
export function normalizeTurnCompletionSoundPath(value: unknown): string {
  return typeof value === 'string' ? value.trim() : DEFAULT_SETTINGS.turnCompletionSoundPath;
}

/** User-facing memory backend settings (mirrors core MemorySettingsSnapshot). */
export interface MemoryBackendUserSettings {
  /** Master switch. Default false — the memory backend ships dark. */
  memoryBackendEnabled: boolean;
  /** Per-turn background extraction while the master switch is on. Default true. */
  memoryExtractionEnabled: boolean;
  /** Opt-in semantic recall (lexical body injection). Default false. */
  memorySemanticRecallEnabled: boolean;
  /** Optional extraction model as `provider/model`. Empty string = session default. */
  memoryExtractionModel: string;
  /**
   * Optional shared store root. Empty = vault-local `.opencodian/memory`.
   * A leading `~` expands against the user home dir so one value (e.g.
   * `~/.zcode/cli/memories`) resolves correctly on every host that syncs
   * the vault settings.
   */
  memoryExternalRoot: string;
  /**
   * Optional git remote URL for whole-tree memory sync (shared protocol
   * with opencode-zmem; empty = off). Requires `memoryExternalRoot`.
   */
  memorySyncRemoteUrl: string;
}

/** Unknown shapes fall back field-by-field to the safe defaults. */
export function normalizeMemoryBackendUserSettings(value: unknown): MemoryBackendUserSettings {
  const candidate = (typeof value === 'object' && value !== null ? value : {}) as Partial<MemoryBackendUserSettings>;
  const fallback = DEFAULT_SETTINGS.memory;
  return {
    memoryBackendEnabled: typeof candidate.memoryBackendEnabled === 'boolean'
      ? candidate.memoryBackendEnabled
      : fallback.memoryBackendEnabled,
    memoryExtractionEnabled: typeof candidate.memoryExtractionEnabled === 'boolean'
      ? candidate.memoryExtractionEnabled
      : fallback.memoryExtractionEnabled,
    memorySemanticRecallEnabled: typeof candidate.memorySemanticRecallEnabled === 'boolean'
      ? candidate.memorySemanticRecallEnabled
      : fallback.memorySemanticRecallEnabled,
    memoryExtractionModel: typeof candidate.memoryExtractionModel === 'string'
      ? candidate.memoryExtractionModel.trim().slice(0, 200)
      : fallback.memoryExtractionModel,
    memoryExternalRoot: typeof candidate.memoryExternalRoot === 'string'
      ? candidate.memoryExternalRoot.trim().slice(0, 300)
      : fallback.memoryExternalRoot,
    memorySyncRemoteUrl: typeof candidate.memorySyncRemoteUrl === 'string'
      ? candidate.memorySyncRemoteUrl.trim().slice(0, 500)
      : fallback.memorySyncRemoteUrl,
  };
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

/** Conversation → vault Markdown export settings (advantage-parity R-D1). */
export interface ConversationExportSettings {
  /** Vault-relative directory for exported notes, no leading/trailing slash. */
  directory: string;
  /** File name template; supports {$date} {$time} {$topic} {$backend} {$id}. */
  filenameTemplate: string;
  /** Auto-refresh the conversation's export note after each turn (default off). */
  autoExport: boolean;
}

export const DEFAULT_CONVERSATION_EXPORT_SETTINGS: ConversationExportSettings = {
  directory: 'opencodian-conversations',
  filenameTemplate: '{$date}_{$topic}',
  autoExport: false,
};

/**
 * Normalize a user-configured export directory: strips slashes and rejects
 * absolute / traversal forms (same boundary rule as attachment paths).
 * Returns null when the value cannot be made safe.
 */
export function normalizeConversationExportDirectory(raw: string): string | null {
  const trimmed = raw.trim().replace(/^[\\/]+|[\\/]+$/g, '');
  if (!trimmed || !isSafeVaultRelativePath(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Normalize a filename template: trims and falls back to the default when
 * empty (an unusable rendered stem is handled again at export time).
 */
export function normalizeConversationExportFilenameTemplate(raw: string): string {
  return raw.trim() || DEFAULT_CONVERSATION_EXPORT_SETTINGS.filenameTemplate;
}

export function normalizeConversationExportSettings(raw: unknown): ConversationExportSettings {
  const source = (raw ?? {}) as Partial<ConversationExportSettings>;
  const directory = typeof source.directory === 'string'
    ? normalizeConversationExportDirectory(source.directory)
    : null;
  return {
    directory: directory ?? DEFAULT_CONVERSATION_EXPORT_SETTINGS.directory,
    filenameTemplate: typeof source.filenameTemplate === 'string'
      ? normalizeConversationExportFilenameTemplate(source.filenameTemplate)
      : DEFAULT_CONVERSATION_EXPORT_SETTINGS.filenameTemplate,
    autoExport: source.autoExport === true,
  };
}

/** Default settings */
export const DEFAULT_SETTINGS: OpenCodianSettings = {
  userName: '',
  activeBackend: 'opencode',
  enabledBackends: ['opencode'],
  inlineEditEnabled: true,
  inlineEditSelectionAffordance: true,
  inlineEditTriggerAt: false,
  inlineEditModelOverrides: {},
  inlineEditEffortOverrides: {},
  inlineEditPresetPrompts: [],
  inlineEditMaxConcurrentEdits: INLINE_EDIT_MAX_CONCURRENT_EDITS_DEFAULT,
  inlineEditDocumentModeEnabled: true,

  // R-C3 Alt ghost-text completion (opt-in; off is zero cost).
  inlineCompletionEnabled: false,
  // R-F4 chat warm session (opt-in; start/warm only, zero turns and zero cost).
  chatWarmSessionEnabled: false,
  inlineCompletionMaxChars: INLINE_COMPLETION_MAX_CHARS_DEFAULT,
  inlineCompletionModelOverrides: {},
  autoInternalLinkEnabled: false,
  autoInternalLinkExcludedTerms: [],
  contextGroups: [],

  // advantage-parity R-D1: conversation → vault Markdown export.
  conversationExport: { ...DEFAULT_CONVERSATION_EXPORT_SETTINGS },
  // advantage-parity R-D2: secrets via Obsidian Keychain (placeholder form
  // in the persisted core profile; explicit rollback via this toggle).
  secretsKeychainEnabled: true,
  // advantage-parity R-D3: turn-completion chime (opt-in; quiet by default).
  turnCompletionSoundEnabled: false,
  turnCompletionSoundPath: '',
  editRevertEnabled: true,
  editRevertSnapshotLimitMb: EDIT_REVERT_SNAPSHOT_LIMIT_MB_DEFAULT,
  obsidianToolingMode: 'off',

  // R-C1 whole-vault retrieval (opt-in; off is zero cost).
  vaultRetrievalEnabled: false,
  vaultRetrievalTopK: VAULT_RETRIEVAL_TOP_K_DEFAULT,
  vaultRetrievalMaxCharsPerNote: VAULT_RETRIEVAL_MAX_CHARS_PER_NOTE_DEFAULT,
  // advantage-parity R-E4: semantic retrieval enhancement (opt-in, off by
  // default; needs an explicitly configured provider + model).
  semanticRetrievalEnabled: false,
  semanticEmbeddingProvider: '',
  semanticEmbeddingModel: '',
  vaultRetrievalExcludedPaths: [],
  pdfIndexEnabled: false,

  // R-C2 text-to-image generation (no models configured by default).
  imageGenerationModels: [],
  imageGenerationMaxWidth: IMAGE_GENERATION_MAX_WIDTH_DEFAULT,
  imageGenerationAssetCleanup: 'trash',

  // R-C6 remote control (opt-in; off constructs no server at all).
  remoteControlEnabled: false,
  remoteControlBindAddress: REMOTE_CONTROL_BIND_ADDRESS_DEFAULT,
  remoteControlToken: '',
  remoteControlNonLoopbackAcknowledgedAt: '',
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
  modelContextWindowOverrides: {},
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
  showTurnChangeRecords: true,
  // advantage-parity R-F5/R-F6: both are opt-in so the default chat remains unchanged.
  chatSessionRailEnabled: false,
  chatVimNavigationEnabled: false,
  chatVimNavigationUpKey: 'w',
  chatVimNavigationDownKey: 's',
  chatVimNavigationComposerKey: 'i',
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
  pluginUpdateAutoInstall: false,

  memory: {
    memoryBackendEnabled: false,
    memoryExtractionEnabled: true,
    memorySemanticRecallEnabled: false,
    memoryExtractionModel: '',
    memoryExternalRoot: '',
    memorySyncRemoteUrl: '',
  },

  locale: 'en',

  hiddenSlashCommands: [],
  slashCommandSkillMode: 'direct',
  skillCatalogCacheTtl: 30000,
  toolCatalogCacheTtl: 30000,
  acpAgents: [],

  // advantage-parity R-F7: empty domains are the byte-identical-to-before default.
  environmentVariables: { shared: {}, providers: {} },

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
