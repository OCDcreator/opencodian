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
import type { OpencodeConfig, PermissionAction,PermissionConfig } from '../types/permission';

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
      return JSON.parse(content) as OpencodeConfig;
    } catch (error) {
      logger.error('Failed to read config:', error);
      return this.getDefaultConfig();
    }
  }

  /** Write configuration file */
  async write(config: OpencodeConfig): Promise<void> {
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.configDir)) {
        await fs.promises.mkdir(this.configDir, { recursive: true });
      }

      const content = JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        ...config,
      }, null, 2);

      await fs.promises.writeFile(this.configPath, content, 'utf-8');
    } catch (error) {
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
      permission: {
        '*': 'ask',
      },
    };
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
