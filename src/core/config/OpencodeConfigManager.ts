import * as fs from 'fs';
import { Notice } from 'obsidian';
import * as path from 'path';

import { createLogger } from '../../shared';
import type {
  OpencodeAgentConfig, OpencodeAgentConfigRecord, OpencodeCommandConfig,
  OpencodeCommandConfigRecord, OpencodeCompactionConfig, OpencodeConfig,
  OpencodeFormatterConfig, OpencodePluginSpec, PermissionAction, PermissionConfig,
  PermissionMode, ToolPermission,
} from '../types';
import { prepareCommandPatchWithScopedAgent, removeCommandScopedAgent } from './commandScopedAgent';
import { readFormatterConfigValue, writeFormatterConfigValue } from './formatterConfig';
import { isRecord, OPENCODE_SCHEMA_URL, parseOpencodeConfigText } from './modelConfig';

const logger = createLogger('OpencodeConfigManager');

export type PermissionConfigCustomFeature = 'external-directory' | 'task-allowlist' | 'patterned-rules';

export interface PermissionConfigSummary {
  templateMode: PermissionMode | null;
  customFeatures: PermissionConfigCustomFeature[];
}

const NORMAL_PERMISSION_TEMPLATE: PermissionConfig = {
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
};

const PLAN_PERMISSION_TEMPLATE: PermissionConfig = {
  '*': 'ask',
  edit: 'deny',
  write: 'deny',
  bash: 'ask',
};

const PERMISSION_MODE_TEMPLATES: Record<PermissionMode, PermissionAction | PermissionConfig> = {
  yolo: 'allow',
  normal: NORMAL_PERMISSION_TEMPLATE,
  plan: PLAN_PERMISSION_TEMPLATE,
};

export class OpencodeConfigManager {
  private vaultPath: string;
  private configDir: string;
  private configPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.configDir = path.join(vaultPath, '.opencode');
    this.configPath = path.join(this.configDir, 'opencode.json');
  }

  async exists(): Promise<boolean> {
    try {
      await fs.promises.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

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
    const compaction = (await this.read()).compaction;
    return isRecord(compaction) ? this.cloneConfigObject(compaction) : undefined;
  }

  async getFormatterConfig(): Promise<OpencodeFormatterConfig | undefined> {
    return readFormatterConfigValue(await this.read());
  }

  /**
   * Write the formatter subtree exactly. Unlike compaction/agent helpers that use
   * deep merge, this replaces the entire formatter value so that removed entries
   * are actually deleted on disk.
   */
  async updateFormatterConfig(
    formatter: OpencodeFormatterConfig | null | undefined,
  ): Promise<void> {
    const config = await this.read();
    writeFormatterConfigValue(config, formatter);
    await this.write(config);
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
    const defaultAgent = (await this.read()).default_agent;
    const normalizedDefaultAgent = typeof defaultAgent === 'string' ? defaultAgent.trim() : '';
    return normalizedDefaultAgent || undefined;
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
    const nativeAgents = this.cloneConfigRecord<OpencodeAgentConfig>(config.agent);
    const legacyAgents = this.cloneConfigRecord<OpencodeAgentConfig>(config.mode);

    const commandPatch = prepareCommandPatchWithScopedAgent({
      command,
      commandId: normalizedCommandId,
      existingCommand: commands[normalizedCommandId],
      legacyAgents,
      nativeAgents,
    });

    commands[normalizedCommandId] = this.mergeConfigObjects(commands[normalizedCommandId], commandPatch);
    config.command = commands;
    if (Object.keys(nativeAgents).length > 0) {
      config.agent = nativeAgents;
    } else {
      delete config.agent;
    }
    await this.write(config);
  }

  async removeCommandConfig(commandId: string): Promise<void> {
    const config = await this.read();
    const normalizedCommandId = this.normalizeConfigEntryId('command', commandId);
    const commands = this.cloneConfigRecord<OpencodeCommandConfig>(config.command);
    const nativeAgents = this.cloneConfigRecord<OpencodeAgentConfig>(config.agent);
    delete commands[normalizedCommandId];
    if (Object.keys(commands).length > 0) {
      config.command = commands;
    } else {
      delete config.command;
    }
    removeCommandScopedAgent(nativeAgents, normalizedCommandId);
    if (Object.keys(nativeAgents).length > 0) {
      config.agent = nativeAgents;
    } else {
      delete config.agent;
    }
    await this.write(config);
  }

  async getPermissionConfig(): Promise<PermissionConfig | PermissionAction | undefined> { return (await this.read()).permission; }

  async setYoloMode(): Promise<void> { await this.updatePermission(OpencodeConfigManager.getPermissionTemplate('yolo')); }

  async setNormalMode(): Promise<void> { await this.updatePermission(OpencodeConfigManager.getPermissionTemplate('normal')); }

  async setPlanMode(): Promise<void> { await this.updatePermission(OpencodeConfigManager.getPermissionTemplate('plan')); }

  async setToolPermission(tool: string, action: PermissionAction): Promise<void> {
    const config = await this.read();
    if (typeof config.permission === 'string') {
      config.permission = { '*': config.permission };
    }
    if (!config.permission || typeof config.permission !== 'object') {
      config.permission = {};
    }
    const permission = config.permission as PermissionConfig;
    permission[tool as keyof PermissionConfig] = action;
    await this.write(config);
  }

  getConfigDir(): string { return this.configDir; }

  getPluginDir(): string { return path.join(this.configDir, 'plugins'); }

  getConfigPath(): string { return this.configPath; }

  async remove(): Promise<void> {
    try {
      if (await this.exists()) {
        await fs.promises.unlink(this.configPath);
      }
    } catch (error) {
      logger.error('Failed to remove config:', error);
    }
  }

  static async ensureInitialized(vaultPath: string, permissionMode: PermissionMode): Promise<void> {
    try {
      const configManager = new OpencodeConfigManager(vaultPath);
      if (await configManager.exists()) return;

      logger.debug(`Creating OpenCode config with mode: ${permissionMode}`);
      await configManager.updatePermission(OpencodeConfigManager.getPermissionTemplate(permissionMode));
      logger.debug(`OpenCode config created at: ${configManager.getConfigPath()}`);
    } catch (error) {
      logger.error('Failed to initialize OpenCode config:', error);
      // Don't throw - plugin should still work even if config creation fails
    }
  }

  static async syncPermissionMode(vaultPath: string, permissionMode: PermissionMode, options?: { healthCheck?: () => Promise<boolean> }): Promise<void> {
    try {
      const configManager = new OpencodeConfigManager(vaultPath);
      await configManager.updatePermission(OpencodeConfigManager.getPermissionTemplate(permissionMode));
      const config = await configManager.read();
      logger.debug(`OpenCode config updated to mode: ${permissionMode}`);
      logger.debug(`Config file location: ${configManager.getConfigPath()}`);
      logger.debug('Config permissions:', JSON.stringify(config.permission, null, 2));

      if (options?.healthCheck && await options.healthCheck()) {
        logger.debug('OpenCode server is running. Config changes require restart to take effect.');
      }
    } catch (error) {
      logger.error('Failed to sync OpenCode config:', error);
    }
  }

  private getDefaultConfig(): OpencodeConfig {
    return { $schema: 'https://opencode.ai/config.json', model: undefined, permission: { '*': 'ask' } };
  }

  static getPermissionTemplate(mode: PermissionMode): PermissionConfig | PermissionAction {
    const template = PERMISSION_MODE_TEMPLATES[mode];
    return typeof template === 'string'
      ? template
      : Object.fromEntries(Object.entries(template)) as PermissionConfig;
  }

  static summarizePermissionConfig(
    permission: PermissionConfig | PermissionAction | undefined,
  ): PermissionConfigSummary {
    const templateMode = (['yolo', 'normal', 'plan'] as const).find((mode) =>
      OpencodeConfigManager.permissionConfigEquals(permission, PERMISSION_MODE_TEMPLATES[mode])
    ) ?? null;

    if (templateMode) {
      return { templateMode, customFeatures: [] };
    }

    if (!permission || typeof permission === 'string') {
      return { templateMode: null, customFeatures: [] };
    }

    const customFeatures: PermissionConfigCustomFeature[] = [];

    if (permission.external_directory !== undefined) {
      customFeatures.push('external-directory');
    }

    if (OpencodeConfigManager.isTaskAllowlist(permission.task)) {
      customFeatures.push('task-allowlist');
    }

    const hasPatternedRules = Object.entries(permission).some(([permissionName, value]) => {
      if (!OpencodeConfigManager.hasSpecificPatterns(value)) {
        return false;
      }

      if (permissionName === 'external_directory') {
        return false;
      }

      return !(permissionName === 'task' && OpencodeConfigManager.isTaskAllowlist(value));
    });

    if (hasPatternedRules) {
      customFeatures.push('patterned-rules');
    }

    return {
      templateMode: null,
      customFeatures,
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

  private normalizeConfigRecord<T extends Record<string, unknown>>(entryKind: string, entries: Record<string, T>): Record<string, T> {
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

  private static permissionConfigEquals(
    left: PermissionConfig | PermissionAction | undefined,
    right: PermissionConfig | PermissionAction,
  ): boolean {
    if (typeof left !== typeof right) {
      return false;
    }

    if (typeof left === 'string' || typeof right === 'string') {
      return left === right;
    }

    if (!left || !right) {
      return false;
    }

    const leftEntries = Object.entries(left);
    const rightEntries = Object.entries(right);
    if (leftEntries.length !== rightEntries.length) {
      return false;
    }

    return leftEntries.every(([key, value]) =>
      OpencodeConfigManager.toolPermissionEquals(
        value,
        right[key as keyof PermissionConfig],
      )
    );
  }

  private static toolPermissionEquals(
    left: ToolPermission | undefined,
    right: ToolPermission | undefined,
  ): boolean {
    if (left === right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    if (typeof left === 'string' || typeof right === 'string') {
      return false;
    }

    const leftEntries = Object.entries(left);
    const rightEntries = Object.entries(right);
    if (leftEntries.length !== rightEntries.length) {
      return false;
    }

    return leftEntries.every(([key, value]) => right[key] === value);
  }

  private static hasSpecificPatterns(value: ToolPermission | undefined): boolean {
    return typeof value === 'object'
      && value !== null
      && Object.keys(value).some((pattern) => pattern !== '*');
  }

  private static isTaskAllowlist(value: ToolPermission | undefined): boolean {
    return typeof value === 'object'
      && value !== null
      && value['*'] === 'deny'
      && Object.entries(value).some(([pattern, action]) => pattern !== '*' && action === 'allow');
  }

  private cloneConfigValue<T>(value: T): T {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? value : JSON.parse(serialized) as T;
  }

  async notifyRestartRequired(): Promise<void> { new Notice('OpenCode configuration updated. Restart the OpenCode service for changes to take effect.', 5000); }
}
