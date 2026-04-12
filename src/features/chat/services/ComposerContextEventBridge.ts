import type { App, EventRef } from 'obsidian';
import { MarkdownView } from 'obsidian';

import type { ContextFileCatalogService } from './ContextFileCatalogService';
import type { FocusContextPreviewCoordinator } from './FocusContextPreviewCoordinator';
import type { FocusContextRuntimeService } from './FocusContextRuntimeService';

type ComposerContextEventFocusRuntimePort = Pick<
  FocusContextRuntimeService,
  | 'dispose'
  | 'handleComposerFocusIn'
  | 'handleComposerFocusOut'
  | 'handleComposerPointerDown'
  | 'startRetainedSelectionPolling'
>;

type ComposerContextEventPreviewPort = Pick<
  FocusContextPreviewCoordinator,
  | 'handleFileOpen'
  | 'refreshActiveFocusContextPreview'
  | 'scheduleFocusContextPreviewRefresh'
>;

type ComposerContextEventCatalogPort = Pick<
  ContextFileCatalogService,
  'handleCreate' | 'handleDelete' | 'handleRename'
>;

export interface ComposerContextEventBridgeHost {
  getInputContainer(): HTMLElement | null;
  registerEvent(eventRef: EventRef): void;
  registerDomEvent(
    target: Window | Document | HTMLElement,
    type: string,
    callback: (event: Event) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

export class ComposerContextEventBridge {
  constructor(
    private readonly app: App,
    private readonly focusContextRuntimeService: ComposerContextEventFocusRuntimePort,
    private readonly focusContextPreviewCoordinator: ComposerContextEventPreviewPort,
    private readonly contextFileCatalogService: ComposerContextEventCatalogPort,
    private readonly host: ComposerContextEventBridgeHost,
  ) {}

  start(): void {
    const scheduleFocusPreviewRefresh = () => {
      this.focusContextPreviewCoordinator.scheduleFocusContextPreviewRefresh();
    };

    this.host.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        this.focusContextPreviewCoordinator.handleFileOpen(file?.path ?? null);
      }),
    );
    this.host.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        scheduleFocusPreviewRefresh();
      }),
    );
    this.host.registerEvent(
      this.app.workspace.on('editor-change', (editor, info) => {
        this.focusContextPreviewCoordinator.refreshActiveFocusContextPreview(
          info instanceof MarkdownView ? info : undefined,
          editor,
        );
      }),
    );

    const inputContainer = this.host.getInputContainer();
    if (inputContainer) {
      this.host.registerDomEvent(inputContainer, 'pointerdown', () => {
        this.focusContextRuntimeService.handleComposerPointerDown();
      });
      this.host.registerDomEvent(inputContainer, 'focusin', () => {
        this.focusContextRuntimeService.handleComposerFocusIn();
      });
      this.host.registerDomEvent(inputContainer, 'focusout', () => {
        this.focusContextRuntimeService.handleComposerFocusOut();
      });
    }

    this.host.registerDomEvent(document, 'selectionchange', scheduleFocusPreviewRefresh);
    this.host.registerDomEvent(document, 'mouseup', scheduleFocusPreviewRefresh);
    this.host.registerDomEvent(document, 'keyup', scheduleFocusPreviewRefresh);

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

    this.focusContextRuntimeService.startRetainedSelectionPolling();
  }

  dispose(): void {
    this.focusContextRuntimeService.dispose();
  }
}
