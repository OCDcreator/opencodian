import { createHash } from 'crypto';
import * as os from 'os';

const SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|token|secret|password|passwd|api[-_]?key|auth[-_]?token|credential)/i;
const ENVIRONMENT_KEY_PATTERN = /^(?:env|environment|environmentVariables)$/i;
const PEM_PATTERN = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;
const AUTH_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const URL_CREDENTIAL_PATTERN = /(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s:]+:[^/@\s]+@/gi;
const URL_SECRET_PATTERN = /([?&](?:access_token|refresh_token|token|key|api[_-]?key|password|secret|sig|signature|credential)=)[^&#\s]*/gi;
const COOKIE_TEXT_PATTERN = /\b(?:set-cookie|cookie)\s*:\s*[^\r\n]*/gi;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4}){64,}(?:==|=)?$/;

export interface TraceRedactorOptions {
  vaultPath?: string;
  diagnosticsPath?: string;
  temporaryPath?: string;
  /** A provider may supply a getter so changed credentials are never retained as a stale snapshot. */
  knownSecrets?: readonly string[] | (() => readonly string[]);
  /**
   * Compatibility keeps the original OpenCode payload shape; hardened also
   * redacts property keys, Error names, and stringified primitive values.
   */
  redactionMode?: 'compatibility' | 'hardened';
  maxStringBytes?: number;
  maxStackBytes?: number;
  maxServiceOutputBytes?: number;
  maxArrayLength?: number;
  maxDepth?: number;
}

export interface TraceRedactionStats {
  secretsRemoved: number;
  pathsNormalized: number;
  valuesTruncated: number;
  binaryValuesOmitted: number;
  circularValuesOmitted: number;
}

export interface TraceRedactionResult<T = unknown> {
  value: T;
  stats: TraceRedactionStats;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export class TraceRedactor {
  private readonly options: Required<Omit<TraceRedactorOptions, 'vaultPath' | 'diagnosticsPath' | 'temporaryPath' | 'knownSecrets'>>
    & Pick<TraceRedactorOptions, 'vaultPath' | 'diagnosticsPath' | 'temporaryPath' | 'knownSecrets'>;

  constructor(options: TraceRedactorOptions = {}) {
    this.options = {
      ...options,
      maxStringBytes: options.maxStringBytes ?? 64 * 1024,
      maxStackBytes: options.maxStackBytes ?? 32 * 1024,
      maxServiceOutputBytes: options.maxServiceOutputBytes ?? 16 * 1024,
      maxArrayLength: options.maxArrayLength ?? 100,
      maxDepth: options.maxDepth ?? 8,
      redactionMode: options.redactionMode ?? 'compatibility',
    };
  }

  redact<T>(value: T, kind: 'ordinary' | 'stack' | 'service-output' = 'ordinary'): TraceRedactionResult<T> {
    const stats: TraceRedactionStats = {
      secretsRemoved: 0,
      pathsNormalized: 0,
      valuesTruncated: 0,
      binaryValuesOmitted: 0,
      circularValuesOmitted: 0,
    };
    const seen = new WeakSet<object>();
    try {
      return {
        value: this.redactValue(value, stats, seen, 0, undefined, kind) as T,
        stats,
      };
    } catch {
      stats.secretsRemoved += 1;
      return { value: '[REDACTION_FAILED]' as T, stats };
    }
  }

  // eslint-disable-next-line max-params, complexity -- Recursive redaction keeps all value-kind and safety limits in one auditable traversal.
  private redactValue(
    value: unknown,
    stats: TraceRedactionStats,
    seen: WeakSet<object>,
    depth: number,
    key: string | undefined,
    kind: 'ordinary' | 'stack' | 'service-output',
  ): unknown {
    if (ENVIRONMENT_KEY_PATTERN.test(key ?? '') && value && typeof value === 'object') {
      return this.redactEnvironmentObject(value, stats);
    }
    if (SENSITIVE_KEY_PATTERN.test(key ?? '')) {
      stats.secretsRemoved += 1;
      return '[REDACTED]';
    }
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'string') {
      return this.redactString(value, stats, kind);
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof ArrayBuffer) {
      const buffer = Buffer.isBuffer(value)
        ? value
        : value instanceof ArrayBuffer
          ? Buffer.from(value)
          : Buffer.from(value);
      stats.binaryValuesOmitted += 1;
      return { omitted: 'binary', bytes: buffer.byteLength, sha256: sha256(buffer) };
    }
    if (typeof value !== 'object') {
      return this.options.redactionMode === 'hardened'
        ? this.redactString(String(value), stats, kind)
        : String(value);
    }
    if (value instanceof Error) {
      return {
        name: this.options.redactionMode === 'hardened'
          ? this.redactString(String(value.name), stats, 'ordinary')
          : value.name,
        message: this.redactString(value.message, stats, 'ordinary'),
        stack: value.stack
          ? this.redactString(value.stack, stats, 'stack')
          : undefined,
      };
    }
    if (seen.has(value)) {
      stats.circularValuesOmitted += 1;
      return '[CIRCULAR]';
    }
    if (depth >= this.options.maxDepth) {
      return '[MAX_DEPTH]';
    }
    seen.add(value);
    if (Array.isArray(value)) {
      const output = value.slice(0, this.options.maxArrayLength)
        .map((entry) => this.redactValue(entry, stats, seen, depth + 1, undefined, kind));
      if (value.length > output.length) {
        output.push({ omittedItems: value.length - output.length });
      }
      return output;
    }
    const output: Record<string, unknown> = {};
    for (const entryKey of this.safeEnumerableKeys(value)) {
      const outputKey = this.options.redactionMode === 'hardened'
        ? this.uniqueOutputKey(output, this.redactObjectKey(entryKey, stats))
        : entryKey;
      let entryValue: unknown;
      try {
        entryValue = (value as Record<string, unknown>)[entryKey];
      } catch {
        output[outputKey] = '[UNREADABLE]';
        continue;
      }
      output[outputKey] = this.redactValue(entryValue, stats, seen, depth + 1, entryKey, kind);
    }
    return output;
  }

  private redactEnvironmentObject(value: object, stats: TraceRedactionStats): Record<string, string> {
    const output: Record<string, string> = {};
    for (const key of this.safeEnumerableKeys(value)) {
      const outputKey = this.options.redactionMode === 'hardened'
        ? this.uniqueOutputKey(output, this.redactObjectKey(key, stats))
        : key;
      output[outputKey] = '[REDACTED]';
      stats.secretsRemoved += 1;
    }
    return output;
  }

  private redactObjectKey(key: string, stats: TraceRedactionStats): string {
    const redacted = this.redactString(key, stats, 'ordinary');
    return typeof redacted === 'string' ? redacted : '[REDACTED_KEY]';
  }

  private uniqueOutputKey(output: Record<string, unknown>, key: string): string {
    if (!Object.prototype.hasOwnProperty.call(output, key)) return key;
    let suffix = 1;
    let candidate = `${key}#${suffix}`;
    while (Object.prototype.hasOwnProperty.call(output, candidate)) {
      suffix += 1;
      candidate = `${key}#${suffix}`;
    }
    return candidate;
  }

  private safeEnumerableKeys(value: object): string[] {
    try {
      return Object.keys(value);
    } catch {
      return [];
    }
  }

  private redactString(
    input: string,
    stats: TraceRedactionStats,
    kind: 'ordinary' | 'stack' | 'service-output',
  ): unknown {
    if (BASE64_PATTERN.test(input)) {
      stats.binaryValuesOmitted += 1;
      return { omitted: 'base64', bytes: byteLength(input), sha256: sha256(input) };
    }
    let value = input
      .replace(PEM_PATTERN, () => {
        stats.secretsRemoved += 1;
        return '[REDACTED_PEM]';
      })
      .replace(AUTH_PATTERN, (_match, scheme: string) => {
        stats.secretsRemoved += 1;
        return `${scheme} [REDACTED]`;
      })
      .replace(URL_CREDENTIAL_PATTERN, (_match, scheme: string) => {
        stats.secretsRemoved += 1;
        return `${scheme}[REDACTED]@`;
      })
      .replace(URL_SECRET_PATTERN, (_match, prefix: string) => {
        stats.secretsRemoved += 1;
        return `${prefix}[REDACTED]`;
      })
      .replace(COOKIE_TEXT_PATTERN, (match: string) => {
        stats.secretsRemoved += 1;
        return `${match.slice(0, match.indexOf(':') + 1)} [REDACTED]`;
      });
    const knownSecrets = typeof this.options.knownSecrets === 'function'
      ? this.options.knownSecrets()
      : this.options.knownSecrets ?? [];
    for (const secret of knownSecrets) {
      if (secret.length >= 4 && value.includes(secret)) {
        stats.secretsRemoved += 1;
        value = value.split(secret).join('[REDACTED]');
      }
    }
    const pathPrefixes: Array<[string | undefined, string]> = [
      [this.options.diagnosticsPath, '$DIAGNOSTICS'],
      [this.options.vaultPath, '$VAULT'],
      [this.options.temporaryPath ?? os.tmpdir(), '$TMP'],
      [os.homedir(), '$HOME'],
    ];
    for (const [prefix, replacement] of pathPrefixes) {
      if (!prefix) continue;
      const normalized = this.normalizePathPrefix(value, prefix, replacement);
      value = normalized.value;
      if (normalized.replaced) {
        stats.pathsNormalized += 1;
      }
    }
    const maxBytes = kind === 'stack'
      ? this.options.maxStackBytes
      : kind === 'service-output'
        ? this.options.maxServiceOutputBytes
        : this.options.maxStringBytes;
    if (byteLength(value) <= maxBytes) {
      return value;
    }
    stats.valuesTruncated += 1;
    const prefix = this.truncateUtf8(value, maxBytes);
    return {
      truncated: true,
      originalBytes: byteLength(value),
      sha256: sha256(value),
      preview: prefix,
    };
  }

  private normalizePathPrefix(
    input: string,
    prefix: string,
    replacement: string,
  ): { value: string; replaced: boolean } {
    const trimmed = prefix.replace(/[\\/]+$/, '');
    if (!trimmed) return { value: input, replaced: false };
    const forward = trimmed.replace(/\\/g, '/');
    const backward = forward.replace(/\//g, '\\');
    const rawVariants = [...new Set([trimmed, forward, backward])]
      .filter((variant) => variant.length > 0)
      .sort((left, right) => right.length - left.length);
    let value = input;
    let replaced = false;
    for (const variant of rawVariants) {
      if (!value.includes(variant)) continue;
      value = value.split(variant).join(replacement);
      replaced = true;
    }
    for (const variant of rawVariants) {
      const encoded = encodeURIComponent(variant);
      if (!encoded) continue;
      const pattern = new RegExp(this.escapeRegularExpression(encoded), 'gi');
      if (!pattern.test(value)) continue;
      pattern.lastIndex = 0;
      value = value.replace(pattern, replacement);
      replaced = true;
    }
    return { value, replaced };
  }

  private escapeRegularExpression(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private truncateUtf8(value: string, maxBytes: number): string {
    let preview = '';
    let previewBytes = 0;
    for (const character of value) {
      const characterBytes = byteLength(character);
      if (previewBytes + characterBytes > maxBytes) break;
      preview += character;
      previewBytes += characterBytes;
    }
    return preview;
  }
}

import * as path from 'path';

/** Shared default diagnostics root: <userData>/OpenCodian/diagnostics/<backend>. */
export function resolveDefaultTraceDirectory(backend: string): string {
  let userData: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const remote = require('@electron/remote') as { app?: { getPath(name: string): string } } | undefined;
    userData = remote?.app?.getPath('userData');
  } catch {
    userData = undefined;
  }
  const base = userData ?? defaultUserDataDirectory();
  return path.join(base, 'OpenCodian', 'diagnostics', backend);
}

function defaultUserDataDirectory(): string {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'obsidian');
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? os.homedir(), 'obsidian');
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'obsidian');
}
