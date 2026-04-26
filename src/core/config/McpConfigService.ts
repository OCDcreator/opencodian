import * as fs from 'fs';

import type {
  OpencodeConfig,
  OpencodeMcpConfigRecord,
  OpencodeMcpEntryConfig,
} from '../types';
import { isRecord, parseOpencodeConfigText } from './modelConfig';
import { OpencodeConfigManager } from './OpencodeConfigManager';

export interface McpServerOwnership {
  projectOwned: boolean;
  entry?: OpencodeMcpEntryConfig;
}

export type McpServerOwnershipMap = Record<string, McpServerOwnership>;

const PARSE_ERROR_MESSAGE = 'OpenCode config could not be parsed. Fix .opencode/opencode.json before editing MCP servers.';

export class McpConfigService {
  constructor(private readonly configManager: OpencodeConfigManager) {}

  async readProjectServers(): Promise<OpencodeMcpConfigRecord> {
    const config = await this.readConfigStrict();
    return this.cloneMcpRecord(config.mcp);
  }

  async resolveOwnership(serverNames: string[]): Promise<McpServerOwnershipMap> {
    const projectServers = await this.readProjectServers();
    const ownership: McpServerOwnershipMap = {};
    for (const name of serverNames) {
      if (Object.prototype.hasOwnProperty.call(projectServers, name)) {
        ownership[name] = {
          projectOwned: true,
          entry: this.cloneConfigValue(projectServers[name]),
        };
      } else {
        ownership[name] = { projectOwned: false };
      }
    }
    return ownership;
  }

  async upsertServer(name: string, entry: OpencodeMcpEntryConfig): Promise<void> {
    const serverName = this.normalizeServerName(name);
    const config = await this.readConfigStrict();
    const servers = this.cloneMcpRecord(config.mcp);
    const existing = servers[serverName];
    servers[serverName] = this.mergeEntryPreservingUnknownFields(existing, entry);
    config.mcp = servers;
    await this.configManager.write(config);
  }

  async deleteServer(name: string): Promise<void> {
    const serverName = this.normalizeServerName(name);
    const config = await this.readConfigStrict();
    const servers = this.cloneMcpRecord(config.mcp);
    if (!Object.prototype.hasOwnProperty.call(servers, serverName)) {
      throw new Error(`MCP server "${serverName}" is not owned by the project config.`);
    }
    delete servers[serverName];
    if (Object.keys(servers).length > 0) {
      config.mcp = servers;
    } else {
      delete config.mcp;
    }
    await this.configManager.write(config);
  }

  private async readConfigStrict(): Promise<OpencodeConfig> {
    if (!(await this.configManager.exists())) {
      return await this.configManager.read();
    }
    try {
      const content = await fs.promises.readFile(this.configManager.getConfigPath(), 'utf-8');
      return parseOpencodeConfigText(content);
    } catch {
      throw new Error(PARSE_ERROR_MESSAGE);
    }
  }

  private cloneMcpRecord(value: unknown): OpencodeMcpConfigRecord {
    if (!isRecord(value)) {
      return {};
    }
    const result: OpencodeMcpConfigRecord = {};
    for (const [name, entry] of Object.entries(value)) {
      if (!name || !isRecord(entry)) {
        continue;
      }
      result[name] = this.cloneConfigValue(entry) as OpencodeMcpEntryConfig;
    }
    return result;
  }

  private normalizeServerName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('MCP server name is required.');
    }
    return trimmed;
  }

  private cloneConfigValue<T>(value: T): T {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? value : JSON.parse(serialized) as T;
  }

  private mergeEntryPreservingUnknownFields(
    existing: OpencodeMcpEntryConfig | undefined,
    next: OpencodeMcpEntryConfig,
  ): OpencodeMcpEntryConfig {
    const existingClone = existing ? this.cloneConfigValue(existing) : {};
    const nextClone = this.cloneConfigValue(next);
    const strippedBase = this.stripKnownEntryFields(existingClone);
    const merged: OpencodeMcpEntryConfig = {
      ...strippedBase,
      ...nextClone,
    };

    if (nextClone.oauth && typeof nextClone.oauth === 'object' && !Array.isArray(nextClone.oauth)) {
      const existingOauth = existingClone.oauth && typeof existingClone.oauth === 'object' && !Array.isArray(existingClone.oauth)
        ? existingClone.oauth as Record<string, unknown>
        : {};
      const nextOauth = nextClone.oauth as Record<string, unknown>;
      merged.oauth = {
        ...this.stripKnownOauthFields(existingOauth),
        ...nextOauth,
      };
    }

    return merged;
  }

  private stripKnownEntryFields(entry: OpencodeMcpEntryConfig): OpencodeMcpEntryConfig {
    const clone = { ...entry };
    delete clone.type;
    delete clone.command;
    delete clone.environment;
    delete clone.url;
    delete clone.headers;
    delete clone.enabled;
    delete clone.timeout;
    delete clone.oauth;
    return clone;
  }

  private stripKnownOauthFields(oauth: Record<string, unknown>): Record<string, unknown> {
    const clone = { ...oauth };
    delete clone.clientId;
    delete clone.clientSecret;
    delete clone.scope;
    delete clone.redirectUri;
    return clone;
  }
}
