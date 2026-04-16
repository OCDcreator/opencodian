interface ComposerContextLifecycleBridge {
  start(): void;
  dispose(): void;
}

export class ComposerContextEventBridge {
  constructor(
    private readonly focusContextEventBridge: ComposerContextLifecycleBridge,
    private readonly contextFileCatalogEventBridge: ComposerContextLifecycleBridge,
  ) {}

  start(): void {
    this.focusContextEventBridge.start();
    this.contextFileCatalogEventBridge.start();
  }

  dispose(): void {
    this.contextFileCatalogEventBridge.dispose();
    this.focusContextEventBridge.dispose();
  }
}
