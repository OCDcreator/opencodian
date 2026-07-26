/**
 * Project-scoped Claude provider configuration.
 *
 * Owns the only writable provider-config boundary: <vault>/.claude/settings.local.json.
 * User-level Claude files and shell environment are inspection-only inputs.
 */

import { lstat, mkdir, readFile } from 'fs/promises';
import { homedir } from 'os';
import * as path from 'path';

import {
  CLAUDE_OFFICIAL_PROVIDER_PRESET,
  CLAUDE_PROVIDER_MANAGED_ENV_KEYS,
  type ClaudeProviderPreset,
} from '../../types/settings';
import {
  assertWithinAllowlistedRoot,
  assertWithinRoot,
  type ConfigurationEvidence,
  type FileRevision,
  ProjectResourceError,
  readAllowlistedFileSnapshot,
  type SafeFileMutationResult,
  safeWriteFile,
} from './ProjectResourceSecureWrite';

const CLAUDE_SETTINGS_DIR = '.claude';
const LOCAL_SETTINGS_FILE = 'settings.local.json';
const PROJECT_SETTINGS_FILE = 'settings.json';
const MANAGED_TOP_LEVEL_KEYS = ['model', 'fallbackModel'] as const;
const SHELL_ENV_KEY_PATTERN = /^(?:ANTHROPIC_|CLAUDE_CODE_)/;
const SECRET_KEY_PATTERN = /(?:api[_-]?key|secret|password|credential|authorization|oauth|(?:access|refresh|session|auth)?[_-]?token)/i;

export interface ClaudeProviderConfigLayer {
  id: 'user' | 'project' | 'local';
  filePath: string;
  exists: boolean;
  content: Record<string, unknown>;
  parseError?: string;
  /** Present only for the local file; used as the UI's compare-and-swap token. */
  revision?: FileRevision | null;
}

export interface ClaudeProviderConfigSnapshot {
  layers: ClaudeProviderConfigLayer[];
  shellEnv: Record<string, string>;
}

export interface ClaudeProviderPresetValidation {
  baseUrlEndsWithV1: boolean;
  authTokenHasBearerPrefix: boolean;
  fallbackMatchesModel: boolean;
  hasReservedExtraEnv: boolean;
}

export interface ApplyClaudeProviderPresetResult {
  lastAppliedManagedEnvKeys: string[];
  revision: FileRevision;
  evidence: ConfigurationEvidence;
  /** Retained for source compatibility; malformed JSON now fails closed. */
  backupPath?: string;
}

export interface MigrateClaudeProviderModelsResult {
  migrated: boolean;
  revision?: FileRevision;
  evidence?: ConfigurationEvidence;
  /** Retained for source compatibility; malformed JSON now fails closed. */
  backupPath?: string;
}

export interface ClaudeProviderMutationOptions {
  /** Explicit caller revision. Omit only for legacy immediate read-modify-write callers. */
  expectedRevision?: FileRevision | null;
  readonly archiveRootPath?: string;
}

interface WritableSettings {
  filePath: string;
  content: Record<string, unknown>;
  revision: FileRevision | null;
}

export class ClaudeProviderConfigMutationError extends Error {
  constructor(public readonly result: SafeFileMutationResult) {
    super(`Claude provider configuration persistence failed (${result.status})`);
    this.name = 'ClaudeProviderConfigMutationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function normalizeExtraEnv(extraEnv: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(extraEnv)) {
    const normalizedKey = key.trim();
    if (
      normalizedKey
      && !CLAUDE_PROVIDER_MANAGED_ENV_KEYS.includes(normalizedKey as typeof CLAUDE_PROVIDER_MANAGED_ENV_KEYS[number])
      && typeof value === 'string'
    ) {
      result[normalizedKey] = value;
    }
  }
  return result;
}

function localSettingsPath(vaultPath: string): string {
  return path.join(vaultPath, CLAUDE_SETTINGS_DIR, LOCAL_SETTINGS_FILE);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}

async function loadWritableSettings(vaultPath: string): Promise<WritableSettings> {
  const normalizedVaultPath = vaultPath.trim();
  if (!normalizedVaultPath) {
    throw new ProjectResourceError('empty-vault');
  }

  const filePath = localSettingsPath(normalizedVaultPath);
  const claudeRoot = path.join(normalizedVaultPath, CLAUDE_SETTINGS_DIR);
  await assertWithinRoot(normalizedVaultPath, claudeRoot);
  try {
    await lstat(claudeRoot);
  } catch (error) {
    if (isMissingFileError(error)) {
      return { filePath, content: {}, revision: null };
    }
    throw error;
  }
  await assertWithinAllowlistedRoot([{ scope: 'local', rootPath: claudeRoot }], filePath);
  const snapshot = await readAllowlistedFileSnapshot({
    targetPath: filePath,
    allowlist: [{ scope: 'local', rootPath: claudeRoot }],
  });
  if (snapshot.status === 'absent') return { filePath, content: {}, revision: null };
  if (snapshot.status !== 'success') {
    const detail = snapshot.status === 'read-failed' ? snapshot.cause : snapshot.status;
    throw new Error(`Claude settings.local.json changed while reading: ${detail}`);
  }

  try {
    const parsed: unknown = JSON.parse(snapshot.content);
    if (!isRecord(parsed)) {
      throw new Error('root must be an object');
    }
    return { filePath, content: cloneJsonRecord(parsed), revision: snapshot.revision };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Claude settings.local.json must be valid strict JSON: ${detail}`);
  }
}

function successfulMutationEvidence(): ConfigurationEvidence {
  return {
    persistence: 'verified',
    application: 'pending',
    runtime: 'unavailable',
    detail: 'Claude settings.local.json and its revision were verified. The next Claude process must reload it; no runtime readback was captured.',
  };
}

function resolveExpectedRevision(
  options: ClaudeProviderMutationOptions,
  observedRevision: FileRevision | null,
): FileRevision | null {
  return Object.prototype.hasOwnProperty.call(options, 'expectedRevision')
    ? options.expectedRevision ?? null
    : observedRevision;
}

async function writeLocalSettings(
  options: {
    vaultPath: string;
    filePath: string;
    content: Record<string, unknown>;
    expectedRevision: FileRevision | null;
    archiveRootPath?: string;
  },
): Promise<Extract<SafeFileMutationResult, { status: 'success' }>> {
  const normalizedVaultPath = options.vaultPath.trim();
  const claudeRoot = path.join(normalizedVaultPath, CLAUDE_SETTINGS_DIR);
  // The narrow `.claude` root can be planted as an escaping symlink after the
  // initial vault proof. Re-check immediately after materialization and before
  // the shared allowlist mutation resolves its root.
  await assertWithinRoot(normalizedVaultPath, claudeRoot);
  await mkdir(claudeRoot, { recursive: true });
  await assertWithinRoot(normalizedVaultPath, claudeRoot);
  const result = await safeWriteFile({
    targetPath: options.filePath,
    content: `${JSON.stringify(options.content, null, 2)}\n`,
    expectedRevision: options.expectedRevision,
    allowlist: [{ scope: 'local', rootPath: claudeRoot }],
    archive: {
      ...(options.archiveRootPath ? { archiveRootPath: options.archiveRootPath } : {}),
      backend: 'claude',
      kind: 'provider-settings',
      format: 'json',
    },
    format: 'json',
  });
  if (result.status !== 'success') {
    throw new ClaudeProviderConfigMutationError(result);
  }
  return result;
}

function removeManagedKeys(content: Record<string, unknown>, lastAppliedManagedEnvKeys: readonly string[]): Record<string, unknown> {
  const next = cloneJsonRecord(content);
  for (const key of MANAGED_TOP_LEVEL_KEYS) {
    delete next[key];
  }

  const existingEnv = isRecord(next.env) ? { ...next.env } : {};
  for (const key of [...CLAUDE_PROVIDER_MANAGED_ENV_KEYS, ...lastAppliedManagedEnvKeys]) {
    delete existingEnv[key];
  }

  if (Object.keys(existingEnv).length === 0) {
    delete next.env;
  } else {
    next.env = existingEnv;
  }
  return next;
}

function isOfficialPreset(preset: ClaudeProviderPreset): boolean {
  return preset.id === CLAUDE_OFFICIAL_PROVIDER_PRESET.id;
}

/** Pure UI/core validation. A false field means no corresponding issue. */
export function validateClaudeProviderPreset(preset: ClaudeProviderPreset): ClaudeProviderPresetValidation {
  const baseUrl = preset.baseUrl.trim().replace(/\/+$/, '');
  const token = preset.authToken.trim();
  return {
    baseUrlEndsWithV1: /\/v1$/i.test(baseUrl),
    authTokenHasBearerPrefix: /^Bearer\s+/i.test(token),
    fallbackMatchesModel: Boolean(
      preset.model.trim()
      && preset.fallbackModel.trim()
      && preset.model.trim() === preset.fallbackModel.trim(),
    ),
    hasReservedExtraEnv: Object.keys(preset.extraEnv).some((key) =>
      CLAUDE_PROVIDER_MANAGED_ENV_KEYS.includes(key.trim() as typeof CLAUDE_PROVIDER_MANAGED_ENV_KEYS[number]),
    ),
  };
}

/** Apply one preset while preserving every unmanaged top-level and env key. */
export async function applyClaudeProviderPreset(
  vaultPath: string,
  preset: ClaudeProviderPreset,
  lastAppliedManagedEnvKeys: readonly string[],
  options: ClaudeProviderMutationOptions = {},
): Promise<ApplyClaudeProviderPresetResult> {
  const validation = validateClaudeProviderPreset(preset);
  if (Object.values(validation).some(Boolean)) {
    throw new Error('Invalid Claude provider preset');
  }

  const writable = await loadWritableSettings(vaultPath);
  const next = removeManagedKeys(writable.content, lastAppliedManagedEnvKeys);
  if (!isOfficialPreset(preset)) {
    const model = preset.model.trim();
    const fallbackModel = preset.fallbackModel.trim();
    const env: Record<string, unknown> = isRecord(next.env) ? { ...next.env } : {};
    if (model) {
      next.model = model;
    }
    if (fallbackModel) {
      next.fallbackModel = [fallbackModel];
    }

    const baseUrl = preset.baseUrl.trim().replace(/\/+$/, '');
    const authToken = preset.authToken.trim();
    const haikuModel = preset.haikuModel.trim();
    if (baseUrl) {
      env.ANTHROPIC_BASE_URL = baseUrl;
    }
    if (authToken) {
      env.ANTHROPIC_AUTH_TOKEN = authToken;
    }
    if (haikuModel) {
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = haikuModel;
    }

    const extraEnv = normalizeExtraEnv(preset.extraEnv);
    Object.assign(env, extraEnv);
    if (Object.keys(env).length > 0) {
      next.env = env;
    }
  }

  const mutation = await writeLocalSettings({
    vaultPath,
    filePath: writable.filePath,
    content: next,
    expectedRevision: resolveExpectedRevision(options, writable.revision),
    ...(options.archiveRootPath ? { archiveRootPath: options.archiveRootPath } : {}),
  });
  return {
    lastAppliedManagedEnvKeys: isOfficialPreset(preset) ? [] : Object.keys(normalizeExtraEnv(preset.extraEnv)),
    revision: mutation.revision,
    evidence: successfulMutationEvidence(),
  };
}

/** Move legacy plugin model fields into the project file without overriding user-authored values. */
export async function migrateClaudeProviderModels(
  vaultPath: string,
  model: string,
  fallbackModel: string,
  options: ClaudeProviderMutationOptions = {},
): Promise<MigrateClaudeProviderModelsResult> {
  const writable = await loadWritableSettings(vaultPath);
  const next = cloneJsonRecord(writable.content);
  let migrated = false;
  const normalizedModel = model.trim();
  const normalizedFallback = fallbackModel.trim();
  if (normalizedModel && !Object.prototype.hasOwnProperty.call(next, 'model')) {
    next.model = normalizedModel;
    migrated = true;
  }
  if (normalizedFallback && !Object.prototype.hasOwnProperty.call(next, 'fallbackModel')) {
    next.fallbackModel = [normalizedFallback];
    migrated = true;
  }
  if (migrated) {
    const mutation = await writeLocalSettings({
      vaultPath,
      filePath: writable.filePath,
      content: next,
      expectedRevision: resolveExpectedRevision(options, writable.revision),
      ...(options.archiveRootPath ? { archiveRootPath: options.archiveRootPath } : {}),
    });
    return {
      migrated,
      revision: mutation.revision,
      evidence: successfulMutationEvidence(),
    };
  }
  return { migrated };
}

async function readConfigLayer(
  id: ClaudeProviderConfigLayer['id'],
  filePath: string,
  vaultPath?: string,
): Promise<ClaudeProviderConfigLayer> {
  if (!filePath) {
    return { id, filePath, exists: false, content: {} };
  }
  if (id === 'local' && vaultPath) {
    const localRoot = path.dirname(filePath);
    try {
      await assertWithinRoot(vaultPath, localRoot);
      const snapshot = await readAllowlistedFileSnapshot({
        targetPath: filePath,
        allowlist: [{ scope: 'local', rootPath: localRoot }],
      });
      if (snapshot.status === 'absent') {
        return { id, filePath, exists: false, content: {}, revision: null };
      }
      if (snapshot.status !== 'success') {
        return {
          id,
          filePath,
          exists: false,
          content: {},
          revision: null,
          parseError: `Local settings could not be read safely (${snapshot.status})`,
        };
      }
      try {
        const parsed: unknown = JSON.parse(snapshot.content);
        if (!isRecord(parsed)) {
          return { id, filePath, exists: true, content: {}, revision: snapshot.revision, parseError: 'Settings JSON must contain an object' };
        }
        return { id, filePath, exists: true, content: cloneJsonRecord(parsed), revision: snapshot.revision };
      } catch (error) {
        return {
          id,
          filePath,
          exists: true,
          content: {},
          revision: snapshot.revision,
          parseError: error instanceof Error ? error.message : String(error),
        };
      }
    } catch (error) {
      return {
        id,
        filePath,
        exists: false,
        content: {},
        revision: null,
        parseError: error instanceof Error ? error.message : String(error),
      };
    }
  }
  try {
    const text = await readFile(filePath, 'utf-8');
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed)) {
        return { id, filePath, exists: true, content: {}, parseError: 'Settings JSON must contain an object' };
      }
      return { id, filePath, exists: true, content: cloneJsonRecord(parsed) };
    } catch (error) {
      return {
        id,
        filePath,
        exists: true,
        content: {},
        parseError: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return { id, filePath, exists: false, content: {} };
    }
    return {
      id,
      filePath,
      exists: false,
      content: {},
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Read all inspectable configuration layers. This function never writes outside the vault. */
export async function readClaudeProviderConfigSnapshot(vaultPath: string): Promise<ClaudeProviderConfigSnapshot> {
  const trimmedVaultPath = vaultPath.trim();
  const userSettingsPath = path.join(homedir(), CLAUDE_SETTINGS_DIR, PROJECT_SETTINGS_FILE);
  const projectSettingsPath = trimmedVaultPath
    ? path.join(trimmedVaultPath, CLAUDE_SETTINGS_DIR, PROJECT_SETTINGS_FILE)
    : '';
  const localFilePath = trimmedVaultPath ? localSettingsPath(trimmedVaultPath) : '';
  const layers = await Promise.all([
    readConfigLayer('user', userSettingsPath),
    readConfigLayer('project', projectSettingsPath),
    readConfigLayer('local', localFilePath, trimmedVaultPath),
  ]);
  const shellEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (SHELL_ENV_KEY_PATTERN.test(key) && typeof value === 'string') {
      shellEnv[key] = value;
    }
  }
  return { layers, shellEnv };
}

export function maskClaudeProviderValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && SECRET_KEY_PATTERN.test(key)) {
    if (value.length <= 8) {
      return '••••••••';
    }
    return `${value.slice(0, 4)}…${value.slice(-3)}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskClaudeProviderValue(key, item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([nestedKey, nestedValue]) => [
      nestedKey,
      maskClaudeProviderValue(nestedKey, nestedValue),
    ]));
  }
  return value;
}

export function maskClaudeProviderConfigSnapshot(snapshot: ClaudeProviderConfigSnapshot): ClaudeProviderConfigSnapshot {
  return {
    layers: snapshot.layers.map((layer) => ({
      ...layer,
      content: maskClaudeProviderValue('content', layer.content) as Record<string, unknown>,
    })),
    shellEnv: maskClaudeProviderValue('env', snapshot.shellEnv) as Record<string, string>,
  };
}

/** Return the highest known value from shell → user → project shared layers (local is intentionally excluded). */
export function resolveClaudeProviderGlobalEffectiveValue(
  snapshot: ClaudeProviderConfigSnapshot,
  key: string,
): unknown {
  const envKey = key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_CODE_');
  let value: unknown = envKey ? snapshot.shellEnv[key] : undefined;
  for (const layerId of ['user', 'project'] as const) {
    const layer = snapshot.layers.find((candidate) => candidate.id === layerId);
    if (!layer) {
      continue;
    }
    const candidate = envKey && isRecord(layer.content.env)
      ? layer.content.env[key]
      : layer.content[key];
    if (candidate !== undefined) {
      value = candidate;
    }
  }
  return value;
}
