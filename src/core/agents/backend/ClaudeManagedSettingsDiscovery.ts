/**
 * Read-only owner for OS-managed Claude Code policy file discovery.
 *
 * This boundary resolves only documented platform roots, discovers confined
 * managed-settings.d JSON files, builds macOS MDM plist candidates, and
 * inspects plist paths without decoding or following symlinks. Registry-backed
 * Windows policy is deliberately outside this filesystem-only owner.
 */
import { lstat, readdir, stat } from 'node:fs/promises';
import { userInfo } from 'node:os';
import * as path from 'node:path';

import {
  assertWithinRoot,
  type ConfigurationAllowlist,
  type ConfigurationEvidence,
} from './ProjectResourceSecureWrite';

const DEFAULT_MANAGED_CONFIG_DIRS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: '/Library/Application Support/ClaudeCode',
  linux: '/etc/claude-code',
  win32: 'C:\\Program Files\\ClaudeCode',
};
const DEFAULT_MACOS_MANAGED_PREFERENCES_DIR = '/Library/Managed Preferences';
const MANAGED_BUNDLE_ID = 'com.anthropic.claudecode';

const EVIDENCE_ABSENT: ConfigurationEvidence = {
  persistence: 'not-applicable',
  application: 'unavailable',
  runtime: 'unavailable',
};
const EVIDENCE_FAILED: ConfigurationEvidence = {
  persistence: 'failed',
  application: 'unavailable',
  runtime: 'unavailable',
};
const EVIDENCE_UNAVAILABLE: ConfigurationEvidence = {
  persistence: 'unavailable',
  application: 'unavailable',
  runtime: 'unavailable',
};

export type ClaudeManagedSettingsOrigin =
  | 'managed-file'
  | 'managed-drop-in'
  | 'managed-plist-device'
  | 'managed-plist-user';

export interface ClaudeManagedSettingsSlot {
  readonly targetPath: string;
  readonly rootPath: string;
  readonly allowlist: ConfigurationAllowlist;
  readonly anchorPath?: string;
  readonly scope: 'managed';
  readonly origin: ClaudeManagedSettingsOrigin;
  readonly priority: number;
  readonly editable: false;
  readonly format: 'json' | 'plist';
}

export interface ClaudeManagedSettingsDiscoveryOptions {
  readonly managedPriority: number;
  readonly managedConfigDir?: string;
  readonly managedPreferencesDir?: string;
  readonly username?: string;
  readonly platform?: NodeJS.Platform;
}

export type ClaudeManagedPlistInspection = {
  readonly exists: boolean;
  readonly evidence: ConfigurationEvidence;
};

function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object'
    ? (error as { code?: string }).code
    : undefined;
}

export class ClaudeManagedSettingsDiscovery {
  private readonly managedPriority: number;
  private readonly managedConfigDir?: string;
  private readonly managedPath: typeof path.posix;
  private readonly managedPreferencesDir?: string;
  private readonly username?: string;

  constructor(options: ClaudeManagedSettingsDiscoveryOptions) {
    const platform = options.platform ?? process.platform;
    this.managedPriority = options.managedPriority;
    this.managedConfigDir = options.managedConfigDir !== undefined
      ? path.resolve(options.managedConfigDir)
      : DEFAULT_MANAGED_CONFIG_DIRS[platform];
    // An injected Windows default must retain Windows separators even when the
    // test host is POSIX. Explicit path overrides always use host semantics.
    this.managedPath = options.managedConfigDir === undefined && platform === 'win32'
      ? path.win32
      : path;
    this.managedPreferencesDir = options.managedPreferencesDir
      ?? (platform === 'darwin' ? DEFAULT_MACOS_MANAGED_PREFERENCES_DIR : undefined);
    this.username = options.username ?? (platform === 'darwin' ? userInfo().username : undefined);
  }

  async discover(): Promise<readonly ClaudeManagedSettingsSlot[]> {
    const slots: ClaudeManagedSettingsSlot[] = [];
    if (this.managedConfigDir !== undefined) {
      slots.push(this.managedFileSlot(this.managedConfigDir));
      slots.push(...await this.discoverManagedDropins(this.managedConfigDir));
    }
    slots.push(...this.discoverManagedPlists());
    return slots;
  }

  /**
   * Path-only plist inspection: never read bytes, decode UTF-8, parse JSON, or
   * follow a symlink. Parent-anchor confinement plus lstat no-follow only.
   */
  async inspectPlistPath(
    slot: Pick<ClaudeManagedSettingsSlot, 'anchorPath' | 'rootPath' | 'targetPath'>,
  ): Promise<ClaudeManagedPlistInspection> {
    if (slot.anchorPath !== undefined) {
      try {
        await stat(slot.anchorPath);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return { exists: false, evidence: EVIDENCE_ABSENT };
        return { exists: false, evidence: EVIDENCE_FAILED };
      }
      try {
        await assertWithinRoot(slot.anchorPath, slot.rootPath);
      } catch {
        return { exists: false, evidence: EVIDENCE_FAILED };
      }
    }
    let entry;
    try {
      entry = await lstat(slot.targetPath);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { exists: false, evidence: EVIDENCE_ABSENT };
      return { exists: false, evidence: EVIDENCE_FAILED };
    }
    if (!entry.isFile()) return { exists: false, evidence: EVIDENCE_FAILED };
    return { exists: true, evidence: EVIDENCE_UNAVAILABLE };
  }

  private managedFileSlot(managedRoot: string): ClaudeManagedSettingsSlot {
    return {
      targetPath: this.managedPath.join(managedRoot, 'managed-settings.json'),
      rootPath: managedRoot,
      allowlist: [{ scope: 'global', rootPath: managedRoot }],
      anchorPath: this.managedPath.dirname(managedRoot),
      scope: 'managed',
      origin: 'managed-file',
      priority: this.managedPriority,
      editable: false,
      format: 'json',
    };
  }

  private discoverManagedPlists(): readonly ClaudeManagedSettingsSlot[] {
    if (this.managedPreferencesDir === undefined) return [];
    const prefs = path.resolve(this.managedPreferencesDir);
    const slots: ClaudeManagedSettingsSlot[] = [{
      targetPath: path.join(prefs, `${MANAGED_BUNDLE_ID}.plist`),
      rootPath: prefs,
      allowlist: [],
      anchorPath: path.dirname(prefs),
      scope: 'managed',
      origin: 'managed-plist-device',
      priority: this.managedPriority,
      editable: false,
      format: 'plist',
    }];
    if (this.username !== undefined) {
      const userDir = path.join(prefs, this.username);
      slots.push({
        targetPath: path.join(userDir, `${MANAGED_BUNDLE_ID}.plist`),
        rootPath: userDir,
        allowlist: [],
        anchorPath: prefs,
        scope: 'managed',
        origin: 'managed-plist-user',
        priority: this.managedPriority,
        editable: false,
        format: 'plist',
      });
    }
    return slots;
  }

  /** Discover only confined regular `managed-settings.d/*.json` files. */
  private async discoverManagedDropins(
    managedRoot: string,
  ): Promise<readonly ClaudeManagedSettingsSlot[]> {
    try {
      await stat(managedRoot);
      await assertWithinRoot(this.managedPath.dirname(managedRoot), managedRoot);
    } catch {
      return [];
    }
    const dropinDir = this.managedPath.join(managedRoot, 'managed-settings.d');
    try {
      await assertWithinRoot(managedRoot, dropinDir);
    } catch {
      throw new Error('managed drop-in discovery failed: drop-in dir confinement');
    }
    let entries;
    try {
      entries = await readdir(dropinDir, { withFileTypes: true });
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return [];
      throw error;
    }
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((entry) => ({
        targetPath: this.managedPath.join(dropinDir, entry.name),
        rootPath: dropinDir,
        allowlist: [{ scope: 'global' as const, rootPath: dropinDir }],
        anchorPath: managedRoot,
        scope: 'managed' as const,
        origin: 'managed-drop-in' as const,
        priority: this.managedPriority,
        editable: false as const,
        format: 'json' as const,
      }));
  }
}
