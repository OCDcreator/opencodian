/**
 * Safe read-only summary reader for the global Codex configuration file
 * (`~/.codex/config.toml` or `$CODEX_HOME/config.toml`).
 *
 * SECURITY CONTRACT — this module is the ONLY chokepoint for reading global
 * Codex config into the plugin UI. It:
 *
 * - Reads the file ONCE per call. No watching, polling, streaming, or caching.
 * - Parses TOML and extracts ONLY an explicit allowlist of safe display fields.
 * - Sanitizes every URL by stripping user-info, query, and fragment.
 * - NEVER exposes env_key, http_headers, env_http_headers, auth.*, query_params,
 *   retry/timeout values, unknown keys, raw TOML, or parse-error content that
 *   may leak config.
 * - NEVER writes, creates, deletes, formats, restores, or opens an editor for
 *   ~/.codex/config.toml or ~/.codex/auth.json.
 * - Only reports configuration DECLARATION. It never claims the app-server
 *   runtime actually uses the declared provider (see upstream #23417).
 */

import { createHash } from 'node:crypto';
import { readFile as fsReadFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { parse as parseToml } from 'smol-toml';

/**
 * Resolve the global Codex config path.
 *
 * Honors `$CODEX_HOME` when set to a non-empty value; otherwise defaults to
 * `~/.codex/config.toml`.
 */
export function resolveGlobalCodexConfigPath(): string {
  const codexHome = process.env.CODEX_HOME;
  const base = codexHome && codexHome.trim().length > 0
    ? codexHome.trim()
    : path.join(homedir(), '.codex');
  return path.join(base, 'config.toml');
}

// ---------------------------------------------------------------------------
// Public summary types
// ---------------------------------------------------------------------------

export type GlobalCodexConfigFileState = 'missing' | 'readable' | 'parse-failed' | 'read-failed';

export interface GlobalCodexConfigProviderSummary {
  /** Provider table id (the `[model_providers.<id>]` key). */
  id: string;
  /** Declared display name, or the id when absent. */
  name: string;
  /** Sanitized base_url (user-info/query/fragment stripped), or null. */
  baseUrl: string | null;
  /** Declared wire_api, or null. */
  wireApi: string | null;
  /** True when this provider id matches the top-level model_provider. */
  isDeclaredDefault: boolean;
}

export interface GlobalCodexConfigSummary {
  /** Result state of the read attempt. */
  fileState: GlobalCodexConfigFileState;
  /** Absolute path of the file that was read. */
  filePath: string;
  /** ISO timestamp of the last successful read, or null when not readable. */
  lastSuccessfulRead: string | null;
  /** Top-level declared model, or null. */
  model: string | null;
  /** Top-level declared model_provider, or null. */
  modelProvider: string | null;
  /** Sanitized top-level openai_base_url, or null. */
  openaiBaseUrl: string | null;
  /** Safe summary of every `[model_providers.*]` table. */
  providers: GlobalCodexConfigProviderSummary[];
}

// ---------------------------------------------------------------------------
// URL sanitization
// ---------------------------------------------------------------------------

/**
 * Strip user-info, query, and fragment from a URL.
 *
 * Returns null for empty/non-string input. If the URL cannot be parsed by the
 * WHATWG URL parser, strips userinfo/query/fragment heuristically and rejects
 * (returns null) any result that still contains an `@` sign — malformed URLs
 * must NEVER leak user-info or any credential-like content.
 */
export function sanitizeConfigUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    // Drop user-info, query, fragment. Keep origin + pathname only.
    url.username = '';
    url.password = '';
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    // Cannot safely parse. Strip query/fragment, then userinfo, then reject
    // any remaining `@` sign — never leak credential-like content from a
    // malformed URL.
    const withoutQuery = trimmed.split('?')[0].split('#')[0];
    // Remove user:password@ (between scheme:// and host/path).
    const withoutUserinfo = withoutQuery.replace(
      /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@]+@/,
      '$1',
    );
    if (withoutUserinfo.includes('@')) {
      // Still has `@` after heuristic strip — too risky to display.
      return null;
    }
    return withoutUserinfo.slice(0, 512);
  }
}

// ---------------------------------------------------------------------------
// Safe field extraction
// ---------------------------------------------------------------------------

const SAFE_STRING_FIELDS = new Set(['model', 'model_provider', 'openai_base_url']);

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractProviderSummaries(
  parsed: Record<string, unknown>,
  declaredProvider: string | null,
): GlobalCodexConfigProviderSummary[] {
  const providersTable = parsed['model_providers'];
  if (!isPlainObject(providersTable)) {
    return [];
  }
  const summaries: GlobalCodexConfigProviderSummary[] = [];
  for (const [id, raw] of Object.entries(providersTable)) {
    if (!isPlainObject(raw)) {
      continue;
    }
    // Only extract the explicitly-allowed safe fields. Everything else
    // (env_key, http_headers, env_http_headers, auth.*, query_params,
    // retry/timeout) is deliberately ignored.
    const name = asString(raw['name']) ?? id;
    const baseUrl = sanitizeConfigUrl(raw['base_url']);
    const wireApi = asString(raw['wire_api']);
    summaries.push({
      id,
      name,
      baseUrl,
      wireApi,
      isDeclaredDefault: declaredProvider !== null && id === declaredProvider,
    });
  }
  // Stable sort: declared default first, then alphabetical by id.
  summaries.sort((a, b) => {
    if (a.isDeclaredDefault !== b.isDeclaredDefault) {
      return a.isDeclaredDefault ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
  return summaries;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

export interface ReadGlobalCodexConfigSummaryOptions {
  /**
   * Override the config path (for testing). When omitted, uses
   * `resolveGlobalCodexConfigPath()`.
   */
  filePath?: string;
  /**
   * Override the file reader (for testing). Must return UTF-8 content.
   * Defaults to the shared `readFile` from ConfigurationFileCommitOperations.
   */
  readFile?: (filePath: string) => Promise<string>;
  /**
   * Override the "now" timestamp (for testing).
   */
  now?: () => Date;
}

/**
 * Read and summarize the global Codex config file safely.
 *
 * Returns a typed summary regardless of outcome. Parse failures and read
 * failures NEVER include raw content, partial TOML, or error strings that may
 * leak configuration — only the state enum.
 */
export async function readGlobalCodexConfigSummary(
  options?: ReadGlobalCodexConfigSummaryOptions,
): Promise<GlobalCodexConfigSummary> {
  const filePath = options?.filePath ?? resolveGlobalCodexConfigPath();
  const reader = options?.readFile ?? ((p: string) => fsReadFile(p, 'utf8'));
  const now = options?.now ?? (() => new Date());

  const empty: GlobalCodexConfigSummary = {
    fileState: 'missing',
    filePath,
    lastSuccessfulRead: null,
    model: null,
    modelProvider: null,
    openaiBaseUrl: null,
    providers: [],
  };

  let content: string;
  try {
    content = await reader(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { ...empty, fileState: 'missing' };
    }
    // Any other read error (EACCES, etc.) — fail closed without content.
    return { ...empty, fileState: 'read-failed' };
  }

  let parsed: Record<string, unknown>;
  try {
    const result = parseToml(content);
    if (!isPlainObject(result)) {
      return { ...empty, fileState: 'parse-failed' };
    }
    parsed = result;
  } catch {
    // Parse failure — never expose the error or partial content.
    return { ...empty, fileState: 'parse-failed' };
  }

  // Extract ONLY safe allowlisted fields.
  const model = extractSafeString(parsed, 'model');
  const modelProvider = extractSafeString(parsed, 'model_provider');
  const openaiBaseUrl = sanitizeConfigUrl(parsed['openai_base_url']);
  const providers = extractProviderSummaries(parsed, modelProvider);

  return {
    fileState: 'readable',
    filePath,
    lastSuccessfulRead: now().toISOString(),
    model,
    modelProvider,
    openaiBaseUrl,
    providers,
  };
}

/**
 * Extract a known-safe top-level string field. Uses the SAFE_STRING_FIELDS
 * allowlist to ensure we never surface unknown keys.
 */
function extractSafeString(
  parsed: Record<string, unknown>,
  field: string,
): string | null {
  if (!SAFE_STRING_FIELDS.has(field)) {
    return null;
  }
  return asString(parsed[field]);
}

/**
 * Compute a stable content hash for a summary (for change detection in tests).
 * Only hashes safe fields; never includes raw config content.
 */
export function hashGlobalCodexConfigSummary(summary: GlobalCodexConfigSummary): string {
  const safe = JSON.stringify({
    s: summary.fileState,
    m: summary.model,
    p: summary.modelProvider,
    u: summary.openaiBaseUrl,
    ps: summary.providers.map((p) => ({ i: p.id, n: p.name, b: p.baseUrl, w: p.wireApi, d: p.isDeclaredDefault })),
  });
  return createHash('sha256').update(safe, 'utf8').digest('hex').slice(0, 16);
}
