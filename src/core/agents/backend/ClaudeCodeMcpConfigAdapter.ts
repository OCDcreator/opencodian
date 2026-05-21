/**
 * Adapts OpenCodian MCP config to Claude Agent SDK mcpServers format.
 *
 * OpenCodian uses OpencodeMcpEntryConfig (from .opencode/opencode.json),
 * which is structurally similar to the SDK's McpServerConfig but uses
 * different field names (e.g., 'command' as string[] vs the SDK's separate
 * command/args, 'environment' vs 'env').
 */

import type {
  OpencodeMcpConfigRecord,
  OpencodeMcpEntryConfig,
} from '../../types/opencodeConfig';

export interface ClaudeCodeMcpStdioConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ClaudeCodeMcpSseConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface ClaudeCodeMcpHttpConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export type ClaudeCodeMcpServerConfig =
  | ClaudeCodeMcpStdioConfig
  | ClaudeCodeMcpSseConfig
  | ClaudeCodeMcpHttpConfig;

export type ClaudeCodeMcpServersMap = Record<string, ClaudeCodeMcpServerConfig>;

/**
 * Convert OpenCodian MCP config to Claude Agent SDK mcpServers format.
 *
 * Skips disabled entries. Maps field names:
 * - command: string[] -> { command: string, args: string[] }
 * - environment -> env
 * - url -> url (direct)
 * - headers -> headers (direct)
 */
export function adaptMcpConfigForClaude(
  config: OpencodeMcpConfigRecord,
): ClaudeCodeMcpServersMap {
  const result: ClaudeCodeMcpServersMap = {};

  for (const [name, entry] of Object.entries(config)) {
    if (!entry || entry.enabled === false) {
      continue;
    }

    const adapted = adaptSingleMcpEntry(entry);
    if (adapted) {
      result[name] = adapted;
    }
  }

  return result;
}

function adaptSingleMcpEntry(
  entry: OpencodeMcpEntryConfig,
): ClaudeCodeMcpServerConfig | null {
  if (entry.url) {
    return {
      type: entry.type === 'http' ? 'http' : 'sse',
      url: entry.url,
      ...(entry.headers ? { headers: entry.headers } : {}),
    };
  }

  const [command, ...args] = entry.command ?? [];
  if (!command) {
    return null;
  }

  return {
    type: 'stdio',
    command,
    ...(args.length > 0 ? { args } : {}),
    ...(entry.environment ? { env: entry.environment } : {}),
  };
}
