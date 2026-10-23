import type { App, EventRef } from 'obsidian';

import type { ContextFileCatalogService } from './ContextFileCatalogService';

type ContextFileCatalogEventPort = Pick<
  ContextFileCatalogService,
  'handleCreate' | 'handleDelete' | 'handleRename'
>;

export interface ContextFileCatalogEventBridgeHost {
  registerEvent(eventRef: EventRef): void;
}

export class ContextFileCatalogEventBridge {
  constructor(
    private readonly app: App,
    private readonly contextFileCatalogService: ContextFileCatalogEventPort,
    private readonly host: ContextFileCatalogEventBridgeHost,
  ) {}

  start(): void {
    this.host.registerEvent(
      this.app.vault.on('create', (file) => {
        this.contextFileCatalogService.handleCreate(file);
      }),
    );
    this.host.registerEvent(
      this.app.vault.on('delete', (file) => {
        this.contextFileCatalogService.handleDelete(file);
      }),
    );
    this.host.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.contextFileCatalogService.handleRename(file, oldPath);
      }),
    );
  }

  dispose(): void {}
}
