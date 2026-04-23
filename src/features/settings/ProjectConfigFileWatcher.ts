import type { App, EventRef } from 'obsidian';
import { normalizePath } from 'obsidian';
import * as path from 'path';

import { createLogger, getVaultBasePath } from '../../shared';

const logger = createLogger('ProjectConfigFileWatcher');
const DEFAULT_CHANGE_DEBOUNCE_MS = 75;

interface ProjectConfigFileWatcherOptions {
  app: App;
  configPath: string;
  onChange: () => void | Promise<void>;
  debounceMs?: number;
}

export class ProjectConfigFileWatcher {
  private eventRefs: EventRef[] = [];
  private pendingChangeTimeoutId: number | null = null;
  private relativeConfigPath: string | null = null;

  constructor(private readonly options: ProjectConfigFileWatcherOptions) {}

  start(): void {
    this.dispose();

    this.relativeConfigPath = this.resolveRelativeConfigPath();
    if (!this.relativeConfigPath) {
      return;
    }

    this.eventRefs.push(
      this.options.app.vault.on('create', (file) => {
        this.handleMutation(this.getAbstractFilePath(file));
      }),
      this.options.app.vault.on('modify', (file) => {
        this.handleMutation(this.getAbstractFilePath(file));
      }),
      this.options.app.vault.on('delete', (file) => {
        this.handleMutation(this.getAbstractFilePath(file));
      }),
      this.options.app.vault.on('rename', (file, oldPath) => {
        this.handleRename(this.getAbstractFilePath(file), oldPath);
      }),
    );
  }

  dispose(): void {
    this.clearPendingChange();
    for (const eventRef of this.eventRefs) {
      this.options.app.vault.offref(eventRef);
    }
    this.eventRefs = [];
    this.relativeConfigPath = null;
  }

  private resolveRelativeConfigPath(): string | null {
    const vaultBasePath = getVaultBasePath(this.options.app);
    if (!vaultBasePath) {
      return null;
    }

    const relativeConfigPath = normalizePath(path.relative(vaultBasePath, this.options.configPath));
    if (!relativeConfigPath || relativeConfigPath.startsWith('..')) {
      return null;
    }

    return relativeConfigPath;
  }

  private getAbstractFilePath(file: unknown): string | null {
    if (!file || typeof file !== 'object') {
      return null;
    }

    const candidate = (file as { path?: unknown }).path;
    return typeof candidate === 'string' ? normalizePath(candidate) : null;
  }

  private matchesProjectConfig(filePath: string | null | undefined): boolean {
    if (!filePath || !this.relativeConfigPath) {
      return false;
    }

    return normalizePath(filePath) === this.relativeConfigPath;
  }

  private handleMutation(filePath: string | null): void {
    if (this.matchesProjectConfig(filePath)) {
      this.scheduleChange();
    }
  }

  private handleRename(nextPath: string | null, oldPath: string | null | undefined): void {
    if (this.matchesProjectConfig(nextPath) || this.matchesProjectConfig(oldPath)) {
      this.scheduleChange();
    }
  }

  private scheduleChange(): void {
    this.clearPendingChange();
    this.pendingChangeTimeoutId = window.setTimeout(() => {
      this.pendingChangeTimeoutId = null;
      this.runChangeHandler();
    }, this.options.debounceMs ?? DEFAULT_CHANGE_DEBOUNCE_MS);
  }

  private clearPendingChange(): void {
    if (this.pendingChangeTimeoutId === null) {
      return;
    }

    window.clearTimeout(this.pendingChangeTimeoutId);
    this.pendingChangeTimeoutId = null;
  }

  private runChangeHandler(): void {
    try {
      Promise.resolve(this.options.onChange()).catch((error: unknown) => {
        logger.warn('Project config change handler failed', error);
      });
    } catch (error) {
      logger.warn('Project config change handler failed', error);
    }
  }
}
