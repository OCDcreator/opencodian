/**
 * OpenCode Configuration Manager
 * 
 * Manages project-level OpenCode configuration files (.opencode/opencode.json)
 * This allows OpenCodian to control OpenCode's permission settings without
 * modifying global user configuration.
 */

import * as fs from 'fs';
import { Notice } from 'obsidian';
import * as path from 'path';

import { createLogger } from '../../shared';
import type {
  OpencodeAgentConfig,
  OpencodeAgentConfigRecord,
  OpencodeCommandConfig,
  OpencodeCommandConfigRecord,
  OpencodeCompactionConfig,
  OpencodeConfig,
  OpencodePluginSpec,
  PermissionAction,
  PermissionConfig,
} from '../types';
import { isRecord, OPENCODE_SCHEMA_URL, parseOpencodeConfigText } from './modelConfig';

const logger = createLogger('OpencodeConfigManager');

export class OpencodeConfigManager {
  private vaultPath: string;
  private configDir: string;
  private configPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.configDir = path.join(vaultPath, '.opencode');
    this.configPath = path.join(this.configDir, 'opencode.json');
  }

  /** Check if configuration file exists */
  async exists(): Promise<boolean> {
    try {
      await fs.promises.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /** Read configuration file */
  async read(): Promise<OpencodeConfig> {
    if (!(await this.exists())) {
      return this.getDefaultConfig();
    }

    try {
      const content = await fs.promises.readFile(this.configPath, 'utf-8');
      return parseOpencodeConfigText(content);
    } catch (error) {
      logger.error('Failed to read config:', error);
      return this.getDefaultConfig();
    }
  }

  /** Write configuration file */
  async write(config: OpencodeConfig): Promise<void> {
    let tempPath: string | null = null;
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.configDir)) {
        await fs.promises.mkdir(this.configDir, { recursive: true });
      }

      const content = JSON.stringify({
        $schema: OPENCODE_SCHEMA_URL,
        ...config,
      }, null, 2);

      tempPath = path.join(
        this.configDir,
        `opencode.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
      );
      await fs.promises.writeFile(tempPath, content, 'utf-8');
      await fs.promises.rename(tempPath, this.configPath);
    } catch (error) {
      if (tempPath) {
        try {
          await fs.promises.unlink(tempPath);
        } catch {
          // Ignore temp cleanup failures.
        }
      }
      logger.error('Failed to write config:', error);
      throw new Error('Failed to write OpenCode configuration');
    }
  }

  /** Update permission configuration */
  async updatePermission(permission: PermissionConfig | PermissionAction): Promise<void> {
    const config = await this.read();
    config.permission = permission;
    await this.write(config);
  }

  async getPluginConfig(): Promise<OpencodePluginSpec[]> {
    const config = await this.read();
    return Array.isArray(config.plugin) ? [...config.plugin] : [];
  }

  async updatePluginConfig(plugins: OpencodePluginSpec[]): Promise<void> {
    const config = await this.read();
    if (plugins.length > 0) {
      config.plugin = [...plugins];
    } else {
      delete config.plugin;
    }
    await this.write(config);
  }

  async getCompactionConfig(): Promise<OpencodeCompactionConfig | undefined> {
    const config = await this.read();
    if (!isRecord(config.compaction)) {
      return undefined;
    }

    return this.cloneConfigObject(config.compaction);
  }

  async updateCompactionConfig(
    compaction: OpencodeCompactionConfig | null | undefined,
  ): Promise<void> {
    const config = await this.read();
    if (!compaction) {
      delete config.compaction;
      await this.write(config);
      return;
    }

    const next = this.mergeConfigObjects(
      isRecord(config.compaction) ? config.compaction : undefined,
      compaction,
    );
    if (Object.keys(next).length > 0) {
      config.compaction = next;
    } else {
      delete config.compaction;
    }
    await this.write(config);
  }

  async getDefaultAgent(): Promise<string | undefined> {
    const config = await this.read();
    const defaultAgent = typeof config.default_agent === 'string'
      ? config.default_agent.trim()
      : '';
    return defaultAgent || undefined;
  }

  async updateDefaultAgent(defaultAgent: string | null | undefined): Promise<void> {
    const config = await this.read();
    const nextDefaultAgent = typeof defaultAgent === 'string' ? defaultAgent.trim() : '';
    if (nextDefaultAgent) {
      config.default_agent = nextDefaultAgent;
    } else {
      delete config.default_agent;
    }
    await this.write(config);
  }

  async getAgentConfig(): Promise<OpencodeAgentConfigRecord> {
    const config = await this.read();
    const legacyAgents = this.cloneConfigRecord<OpencodeAgentConfig>(config.mode);
    const nativeAgents = this.cloneConfigRecord<OpencodeAgentConfig>(config.agent);
    return {
      ...legacyAgents,
      ...nativeAgents,
    };
  }

  async updateAgentConfig(agents: OpencodeAgentConfigRecord): Promise<void> {
    const config = await this.read();
    const nextAgents = this.normalizeConfigRecord('agent', agents);
    if (Object.keys(nextAgents).length > 0) {
      config.agent = nextAgents;
    } else {
      delete config.agent;
    }
    await this.write(config);
  }

  async upsertAgentConfig(agentId: string, agent: OpencodeAgentConfig): Promise<void> {
    const config = await this.read();
    const normalizedAgentId = this.normalizeConfigEntryId('agent', agentId);
    const nativeAgents = this.cloneConfigRecord<OpencodeAgentConfig>(config.agent);
    const legacyAgents = this.cloneConfigRecord<OpencodeAgentConfig>(config.mode);
    const existingAgent = nativeAgents[normalizedAgentId] ?? legacyAgents[normalizedAgentId];

    nativeAgents[normalizedAgentId] = this.mergeConfigObjects(existingAgent, agent);
    config.agent = nativeAgents;
    await this.write(config);
  }

  async removeAgentConfig(agentId: string): Promise<void> {
    const config = await this.read();
    const normalizedAgentId = this.normalizeConfigEntryId('agent', agentId);
    const nativeAgents = this.cloneConfigRecord<OpencodeAgentConfig>(config.agent);
    delete nativeAgents[normalizedAgentId];
    if (Object.keys(nativeAgents).length > 0) {
      config.agent = nativeAgents;
    } else {
      delete config.agent;
    }

    const legacyAgents = this.cloneConfigRecord<OpencodeAgentConfig>(config.mode);
    if (Object.prototype.hasOwnProperty.call(legacyAgents, normalizedAgentId)) {
      delete legacyAgents[normalizedAgentId];
      if (Object.keys(legacyAgents).length > 0) {
        config.mode = legacyAgents;
      } else {
        delete config.mode;
      }
    }

    await this.write(config);
  }

  async getCommandConfig(): Promise<OpencodeCommandConfigRecord> {
    const config = await this.read();
    return this.cloneConfigRecord<OpencodeCommandConfig>(config.command);
  }

  async updateCommandConfig(commands: OpencodeCommandConfigRecord): Promise<void> {
    const config = await this.read();
    const nextCommands = this.normalizeConfigRecord('command', commands);
    if (Object.keys(nextCommands).length > 0) {
      config.command = nextCommands;
    } else {
      delete config.command;
    }
    await this.write(config);
  }

  async upsertCommandConfig(commandId: string, command: OpencodeCommandConfig): Promise<void> {
    const config = await this.read();
    const normalizedCommandId = this.normalizeConfigEntryId('command', commandId);
    const commands = this.cloneConfigRecord<OpencodeCommandConfig>(config.command);

    commands[normalizedCommandId] = this.mergeConfigObjects(commands[normalizedCommandId], command);
    config.command = commands;
    await this.write(config);
  }

  async removeCommandConfig(commandId: string): Promise<void> {
    const config = await this.read();
    const normalizedCommandId = this.normalizeConfigEntryId('command', commandId);
    const commands = this.cloneConfigRecord<OpencodeCommandConfig>(config.command);
    delete commands[normalizedCommandId];
    if (Object.keys(commands).length > 0) {
      config.command = commands;
    } else {
      delete config.command;
    }
    await this.write(config);
  }

  /** Get current permission configuration */
  async getPermissionConfig(): Promise<PermissionConfig | PermissionAction | undefined> {
    const config = await this.read();
    return config.permission;
  }

  /** Set YOLO mode (allow all) */
  async setYoloMode(): Promise<void> {
    await this.updatePermission('allow');
  }

  /** Set normal mode (ask for everything) */
  async setNormalMode(): Promise<void> {
    await this.updatePermission({
      '*': 'ask',
      read: 'ask',
      edit: 'ask',
      write: 'ask',
      bash: 'ask',
      websearch: 'ask',
      webfetch: 'ask',
      glob: 'ask',
      grep: 'ask',
      list: 'ask',
      task: 'ask',
      skill: 'ask',
    });
  }

  /** Set plan mode (deny write operations, ask for others) */
  async setPlanMode(): Promise<void> {
    await this.updatePermission({
      '*': 'ask',
      edit: 'deny',
      write: 'deny',
      bash: 'ask',
    });
  }

  /** Update permission for a specific tool */
  async setToolPermission(tool: string, action: PermissionAction): Promise<void> {
    const config = await this.read();
    
    // If current permission is a string, convert to object
    if (typeof config.permission === 'string') {
      config.permission = { '*': config.permission };
    }

    // Ensure permission is an object
    if (!config.permission || typeof config.permission !== 'object') {
      config.permission = {};
    }

    const permission = config.permission as PermissionConfig;
    permission[tool as keyof PermissionConfig] = action;
    
    await this.write(config);
  }

  /** Get configuration directory path */
  getConfigDir(): string {
    return this.configDir;
  }

  getPluginDir(): string {
    return path.join(this.configDir, 'plugins');
  }

  /** Get configuration file path */
  getConfigPath(): string {
    return this.configPath;
  }

  /** Remove configuration file */
  async remove(): Promise<void> {
    try {
      if (await this.exists()) {
        await fs.promises.unlink(this.configPath);
      }
    } catch (error) {
      logger.error('Failed to remove config:', error);
    }
  }

  private getDefaultConfig(): OpencodeConfig {
    return {
      $schema: 'https://opencode.ai/config.json',
      model: undefined,
      permission: {
        '*': 'ask',
      },
    };
  }

  private cloneConfigRecord<T extends Record<string, unknown>>(value: unknown): Record<string, T> {
    if (!isRecord(value)) {
      return {};
    }

    const next: Record<string, T> = {};
    for (const [entryId, entry] of Object.entries(value)) {
      if (!entryId || !isRecord(entry)) {
        continue;
      }

      next[entryId] = this.cloneConfigObject(entry) as T;
    }
    return next;
  }

  private normalizeConfigRecord<T extends Record<string, unknown>>(
    entryKind: string,
    entries: Record<string, T>,
  ): Record<string, T> {
    const next: Record<string, T> = {};
    for (const [entryId, entry] of Object.entries(entries)) {
      const normalizedEntryId = this.normalizeConfigEntryId(entryKind, entryId);
      next[normalizedEntryId] = this.cloneConfigObject(entry);
    }
    return next;
  }

  private normalizeConfigEntryId(entryKind: string, entryId: string): string {
    const normalizedEntryId = entryId.trim();
    if (!normalizedEntryId) {
      throw new Error(`OpenCode ${entryKind} id is required`);
    }
    return normalizedEntryId;
  }

  private mergeConfigObjects<T extends Record<string, unknown>>(
    existing: T | undefined,
    patch: T,
  ): T {
    const next: Record<string, unknown> = existing
      ? this.cloneConfigObject(existing)
      : {};

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        delete next[key];
        continue;
      }

      const currentValue = next[key];
      if (isRecord(currentValue) && isRecord(value)) {
        next[key] = this.mergeConfigObjects(currentValue, value);
        continue;
      }

      next[key] = this.cloneConfigValue(value);
    }

    return next as T;
  }

  private cloneConfigObject<T extends Record<string, unknown>>(value: T): T {
    return this.cloneConfigValue(value);
  }

  private cloneConfigValue<T>(value: T): T {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? value : JSON.parse(serialized) as T;
  }

  /** 
   * Check if OpenCode service needs restart after config change
   * Note: This is a limitation - OpenCode reads config at startup
   */
  async notifyRestartRequired(): Promise<void> {
    new Notice(
      'OpenCode configuration updated. Restart the OpenCode service for changes to take effect.',
      5000
    );
  }
}
