import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parse as parseJsonc, type ParseError } from 'jsonc-parser';

export type PiMcpTransport = 'stdio' | 'http';
export type PiMcpAuthMode = 'oauth' | 'bearer' | 'none';

export interface PiMcpServerDeclaration {
  name: string;
  transport: PiMcpTransport;
  /** Stdio command line or HTTP URL. Environment, header and token values are never included. */
  endpoint: string;
  disabled: boolean;
  auth: PiMcpAuthMode;
  /** Config file whose entry won; later sources override earlier ones. */
  source: string;
}

export interface PiMcpConfigSnapshot {
  servers: PiMcpServerDeclaration[];
  /** Existing config files that were merged, lowest precedence first. */
  sources: string[];
  /** PI_MCP_CONFIG_MODE=exclusive: Pi ignores every source except its own global file. */
  exclusive: boolean;
}

export interface PiMcpConfigReadOptions {
  /** Pi runs with the vault as its working directory, so project configs resolve beneath it. */
  workingDirectory: string;
  homeDir?: string;
  env?: Record<string, string | undefined>;
}

const SECRET_ARGUMENT_PATTERN = /(token|key|secret|password|credential|auth)/i;

/**
 * Read-only view of the MCP servers Pi's own configuration declares.
 *
 * Pi's MCP support comes from its extension ecosystem, not from the RPC protocol, so the
 * declaration can only be read from the config files the extension itself merges. Precedence
 * mirrors that merge (shared global -> agents global -> Pi global -> project -> project Pi
 * override); entries from later files replace earlier ones of the same name.
 *
 * Deliberately not mirrored: ancestor-directory discovery, `imports`/plugin config expansion,
 * and rebranded application names. This service never writes any file.
 */
export class PiMcpConfigService {
  read(options: PiMcpConfigReadOptions): PiMcpConfigSnapshot {
    const home = options.homeDir ?? os.homedir();
    const env = options.env ?? process.env;
    const exclusive = String(env.PI_MCP_CONFIG_MODE ?? '').trim().toLowerCase() === 'exclusive';
    const sources = exclusive
      ? [this.piGlobalConfigPath(home, env)]
      : this.configSources(home, env, options.workingDirectory);

    const merged = new Map<string, PiMcpServerDeclaration>();
    const readFiles: string[] = [];
    for (const file of sources) {
      const entries = this.readServerEntries(file);
      if (entries === null) continue;
      readFiles.push(file);
      for (const [name, entry] of Object.entries(entries)) {
        merged.set(name, this.toDeclaration(name, entry, file));
      }
    }

    return {
      servers: [...merged.values()].sort((left, right) => left.name.localeCompare(right.name)),
      sources: readFiles,
      exclusive,
    };
  }

  private configSources(
    home: string,
    env: Record<string, string | undefined>,
    workingDirectory: string,
  ): string[] {
    return [
      path.join(home, '.config', 'mcp', 'mcp.json'),
      path.join(home, '.agents', 'mcp.json'),
      path.join(home, '.agents', 'mcp', 'mcp.json'),
      this.piGlobalConfigPath(home, env),
      path.join(workingDirectory, '.mcp.json'),
      path.join(workingDirectory, '.pi', 'mcp.json'),
    ];
  }

  private piGlobalConfigPath(home: string, env: Record<string, string | undefined>): string {
    const configured = String(env.PI_CODING_AGENT_DIR ?? '').trim();
    const agentDirectory = !configured
      ? path.join(home, '.pi', 'agent')
      : configured === '~'
        ? home
        : configured.startsWith('~/') || configured.startsWith('~\\')
          ? path.resolve(home, configured.slice(2))
          : path.resolve(configured);
    return path.join(agentDirectory, 'mcp.json');
  }

  /** `{}` when the file exists but declares nothing; null when it is absent or unreadable. */
  private readServerEntries(file: string): Record<string, unknown> | null {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
    // jsonc-parser reports problems through `errors` instead of throwing, so a malformed file
    // would otherwise parse into a half-built object and be listed as a source.
    const errors: ParseError[] = [];
    const parsed = parseJsonc(text, errors, { allowTrailingComma: true }) as { mcpServers?: unknown } | undefined;
    if (errors.length > 0) return null;
    const servers = parsed && typeof parsed === 'object' ? parsed.mcpServers : undefined;
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return {};
    return servers as Record<string, unknown>;
  }

  private toDeclaration(name: string, entry: unknown, source: string): PiMcpServerDeclaration {
    const record = entry && typeof entry === 'object' && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    return {
      name,
      transport: url ? 'http' : 'stdio',
      endpoint: url ? this.redactUrl(url) : this.describeStdioCommand(record),
      disabled: record.disabled === true,
      auth: this.resolveAuthMode(record),
      source,
    };
  }

  private describeStdioCommand(record: Record<string, unknown>): string {
    const command = typeof record.command === 'string' ? record.command.trim() : '';
    const args = Array.isArray(record.args)
      ? record.args.filter((value): value is string => typeof value === 'string')
      : [];
    return [command, ...args.map((value) => this.redactArgument(value))].filter(Boolean).join(' ');
  }

  /** Keep a bare flag (`--token`) readable, but never the value it carries. */
  private redactArgument(value: string): string {
    if (!SECRET_ARGUMENT_PATTERN.test(value)) return value;
    return /^-{1,2}[A-Za-z][\w-]*$/.test(value) ? value : '***';
  }

  private redactUrl(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return rawUrl.split(/[?#]/)[0] ?? rawUrl;
    }
  }

  private resolveAuthMode(record: Record<string, unknown>): PiMcpAuthMode {
    if (record.auth === 'oauth') return 'oauth';
    if (record.auth === 'bearer') return 'bearer';
    const token = [record.bearerToken, record.bearerTokenEnv]
      .some((value) => typeof value === 'string' && value.trim().length > 0);
    return token ? 'bearer' : 'none';
  }
}
