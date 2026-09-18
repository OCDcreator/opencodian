import type { App, Editor, EventRef, MarkdownView } from 'obsidian';

import type { PromptContextItem } from '../../../core/types';
import type { ServerMode } from '../../../core/types/settings';
import type { TabId } from '../tabs';
import { ComposerContextActionService } from './ComposerContextActionService';
import { ComposerContextChipActionService } from './ComposerContextChipActionService';
import { ComposerContextCoordinator } from './ComposerContextCoordinator';
import { ComposerContextEventBridge } from './ComposerContextEventBridge';
import { type ComposerContextGroupsPort, ComposerContextPickerActionService, type ComposerContextPickerServerContextPort } from './ComposerContextPickerActionService';
import {
  type ComposerContextRuntimeState,
  ComposerContextRuntimeStore,
} from './ComposerContextRuntimeStore';
import { ComposerContextViewHostAdapter } from './ComposerContextViewHostAdapter';
import { ContextAttachmentBuilder } from './ContextAttachmentBuilder';
import { ContextFileCatalogEventBridge } from './ContextFileCatalogEventBridge';
import { ContextFileCatalogService } from './ContextFileCatalogService';
import { FocusContextEventBridge } from './FocusContextEventBridge';
import {
  createFocusContextServices,
  type FocusContextPreviewWritebackHost,
  type FocusContextRuntimeViewHost,
} from './FocusContextHostAdapter';
import type { FocusContextPreviewCoordinator } from './FocusContextPreviewCoordinator';
import type { FocusContextRuntimeService } from './FocusContextRuntimeService';

type ComposerContextAttachmentBuilderPort = Pick<
  ContextAttachmentBuilder,
  | 'buildCurrentNoteContextItem'
  | 'buildSelectionContextItem'
  | 'buildFileContextItem'
  | 'buildFileContextItemFromPath'
  | 'buildPersistentFileContextItems'
  | 'buildSelectionContextItemFromPreview'
  | 'buildEntryContextItem'
  | 'hasFileAtPath'
>;

type ComposerContextFileCatalogPort = Pick<
  ContextFileCatalogService,
  'getCatalog' | 'handleCreate' | 'handleDelete' | 'handleRename'
>;

type ComposerContextRuntimeStorePort = Pick<
  ComposerContextRuntimeStore,
  'getDraftContextItems' | 'clearDraftContextItems' | 'mergeVaultRetrievalDraftItems'
>;

type ComposerContextActionPort = Pick<
  ComposerContextActionService,
  'addCurrentNoteContextFromActiveEditor' | 'addSelectionContextFromActiveEditor' | 'attachBuiltContextItem'
>;

type ComposerContextPickerActionPort = Pick<
  ComposerContextPickerActionService,
  'addChosenFileContextToActiveTab' | 'addVaultPathContextFromDrop'
>;

type ComposerContextCoordinatorPort = Pick<ComposerContextCoordinator, 'setContextRowElement'>;

type ComposerContextLifecyclePort = Pick<ComposerContextEventBridge, 'start' | 'dispose'>;

type FocusContextRuntimePort = Pick<FocusContextRuntimeService, 'getActiveMarkdownView'>;

type FocusContextPreviewPort = Pick<
  FocusContextPreviewCoordinator,
  'refreshActiveFocusContextPreview'
>;

export interface ComposerContextViewHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): ComposerContextRuntimeState | null;
  getActiveMarkdownView(): MarkdownView | null;
  getInputContainer(): HTMLElement | null;
  registerEvent(eventRef: EventRef): void;
  registerDomEvent(
    target: Window | Document | HTMLElement,
    type: string,
    callback: (event: Event) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

export type {
  FocusContextPreviewWritebackHost,
  FocusContextRuntimeViewHost,
} from './FocusContextHostAdapter';

export interface ComposerContextServiceDependencies {
  app: App;
  contextAttachmentBuilder: ComposerContextAttachmentBuilderPort;
  contextFileCatalogService: ComposerContextFileCatalogPort;
  viewHost: ComposerContextViewHost;
  focusRuntimeViewHost: FocusContextRuntimeViewHost;
  focusPreviewWritebackHost: FocusContextPreviewWritebackHost;
  /** Optional read-only server-side context capability port (v2 fs/reference). */
  serverContext?: ComposerContextPickerServerContextPort;
  /** Persisted context groups for the picker's "attach topic" rows (R-B2). */
  contextGroups?: ComposerContextGroupsPort;
}

export interface ComposerContextViewFacadeCreateOptions {
  app: App;
  getServerMode(): ServerMode;
  viewHost: ComposerContextViewHost;
  focusRuntimeViewHost: FocusContextRuntimeViewHost;
  focusPreviewWritebackHost: FocusContextPreviewWritebackHost;
  /** Optional read-only server-side context capability port (v2 fs/reference). */
  serverContext?: ComposerContextPickerServerContextPort;
  /** Persisted context groups for the picker's "attach topic" rows (R-B2). */
  contextGroups?: ComposerContextGroupsPort;
  /** R-C4: lazily resolved PDF engine for one-shot PDF text attach. */
  loadPdfEngine?: () => Promise<import('../../../core/pdf').PdfTextEngine>;
}

export interface ComposerSendContextPort {
  getDraftContextItems(tabId?: TabId | null): PromptContextItem[];
  resolvePersistentContextItems(paths?: readonly string[]): Promise<PromptContextItem[]>;
  clearDraftContextItems(tabId?: TabId | null): void;
  /**
   * R-C1: atomically replace the vault-retrieval draft items with the given
   * list (manual attachments untouched). Empty list clears the managed set.
   */
  mergeVaultRetrievalDraftItems(items: PromptContextItem[], tabId?: TabId | null): void;
}

export interface ComposerContextServices {
  viewFacade: ComposerContextViewFacade;
  focusContextPreviewCoordinator: FocusContextPreviewCoordinator;
  focusContextRuntimeService: FocusContextRuntimeService;
}

export interface ComposerContextViewFacadeDependencies {
  contextAttachmentBuilder: Pick<ComposerContextAttachmentBuilderPort, 'buildPersistentFileContextItems'>;
  runtimeStore: ComposerContextRuntimeStorePort;
  actionService: ComposerContextActionPort;
  pickerActionService: ComposerContextPickerActionPort;
  coordinator: ComposerContextCoordinatorPort;
  eventBridge: ComposerContextLifecyclePort;
  focusContextRuntimeService: FocusContextRuntimePort;
  focusContextPreviewCoordinator: FocusContextPreviewPort;
}

export class ComposerContextViewFacade {
  readonly sendContext: ComposerSendContextPort;

  static create(options: ComposerContextViewFacadeCreateOptions): ComposerContextViewFacade {
    const contextAttachmentBuilder = new ContextAttachmentBuilder(options.app, {
      getServerMode: () => options.getServerMode(),
      ...(options.loadPdfEngine ? { loadPdfEngine: options.loadPdfEngine } : {}),
    });
    const contextFileCatalogService = new ContextFileCatalogService(options.app);

    return createComposerContextServices({
      app: options.app,
      contextAttachmentBuilder,
      contextFileCatalogService,
      viewHost: options.viewHost,
      focusRuntimeViewHost: options.focusRuntimeViewHost,
      focusPreviewWritebackHost: options.focusPreviewWritebackHost,
      serverContext: options.serverContext,
      contextGroups: options.contextGroups,
    }).viewFacade;
  }

  constructor(private readonly dependencies: ComposerContextViewFacadeDependencies) {
    this.sendContext = {
      getDraftContextItems: (tabId?: TabId | null) =>
        this.dependencies.runtimeStore.getDraftContextItems(tabId),
      resolvePersistentContextItems: (paths?: readonly string[]) =>
        this.dependencies.contextAttachmentBuilder.buildPersistentFileContextItems(paths),
      clearDraftContextItems: (tabId?: TabId | null) => {
        this.dependencies.runtimeStore.clearDraftContextItems(tabId);
      },
      mergeVaultRetrievalDraftItems: (items: PromptContextItem[], tabId?: TabId | null) => {
        this.dependencies.runtimeStore.mergeVaultRetrievalDraftItems(items, tabId);
      },
    };
  }

  getActiveMarkdownView(): MarkdownView | null {
    return this.dependencies.focusContextRuntimeService.getActiveMarkdownView();
  }

  refreshActiveFocusContextPreview(): void {
    this.dependencies.focusContextPreviewCoordinator.refreshActiveFocusContextPreview();
  }

  setContextRowElement(contextRowEl: HTMLElement | null): void {
    this.dependencies.coordinator.setContextRowElement(contextRowEl);
  }

  async addChosenFileContextToActiveTab(): Promise<boolean> {
    return this.dependencies.pickerActionService.addChosenFileContextToActiveTab();
  }

  /**
   * Vault drop entry point (R-A7). Synchronous claim: returns whether the
   * payload resolved to a vault text file or folder and an attach was
   * started; the actual item build is async.
   */
  addVaultPathContextFromDrop(rawPath: string): boolean {
    return this.dependencies.pickerActionService.addVaultPathContextFromDrop(rawPath);
  }

  async addCurrentNoteContextFromActiveEditor(
    view?: MarkdownView | null,
  ): Promise<boolean> {
    return this.dependencies.actionService.addCurrentNoteContextFromActiveEditor(view);
  }

  async addSelectionContextFromActiveEditor(
    editor?: Editor | null,
    view?: MarkdownView | null,
  ): Promise<boolean> {
    return this.dependencies.actionService.addSelectionContextFromActiveEditor(editor, view);
  }

  /**
   * R-C4: attach an already-built context item (e.g. the PDF selection the
   * viewer integration captured) to the active tab's draft context.
   */
  attachBuiltContextItem(item: PromptContextItem): boolean {
    return this.dependencies.actionService.attachBuiltContextItem(item);
  }

  start(): void {
    this.dependencies.eventBridge.start();
  }

  dispose(): void {
    this.dependencies.eventBridge.dispose();
  }
}

export function createComposerContextServices(
  dependencies: ComposerContextServiceDependencies,
): ComposerContextServices {
  let coordinator: ComposerContextCoordinator | null = null;

  const runtimeStore = new ComposerContextRuntimeStore({
    getActiveTabId: () => dependencies.viewHost.getActiveTabId(),
    getTabRuntimeState: (tabId) => dependencies.viewHost.getTabRuntimeState(tabId),
    renderComposerContext: () => {
      if (!coordinator) {
        throw new Error('Composer context coordinator not initialized');
      }
      coordinator.render();
    },
  });
  const viewHostAdapter = new ComposerContextViewHostAdapter(runtimeStore);
  const actionService = new ComposerContextActionService(
    dependencies.contextAttachmentBuilder,
    viewHostAdapter.createActionServiceHost({
      getActiveMarkdownView: () => dependencies.viewHost.getActiveMarkdownView(),
    }),
  );
  const {
    focusContextPreviewCoordinator,
    focusContextRuntimeService,
    contextPickerInteractionBridge,
  } = createFocusContextServices({
    app: dependencies.app,
    runtimeStore,
    focusRuntimeViewHost: dependencies.focusRuntimeViewHost,
    focusPreviewWritebackHost: dependencies.focusPreviewWritebackHost,
  });
  const pickerActionService = new ComposerContextPickerActionService(
    dependencies.app,
    dependencies.contextAttachmentBuilder,
    dependencies.contextFileCatalogService,
    viewHostAdapter.createPickerActionServiceHost(contextPickerInteractionBridge),
    { serverContext: dependencies.serverContext, contextGroups: dependencies.contextGroups },
  );
  const chipActionService = new ComposerContextChipActionService(
    dependencies.contextAttachmentBuilder,
    viewHostAdapter.createChipActionServiceHost({
      refreshActiveFocusContextPreview: () => {
        focusContextPreviewCoordinator.refreshActiveFocusContextPreview();
      },
    }),
  );
  coordinator = new ComposerContextCoordinator(
    viewHostAdapter.createCoordinatorHost(),
    chipActionService,
  );
  const focusContextEventBridge = new FocusContextEventBridge(
    dependencies.app,
    focusContextRuntimeService,
    focusContextPreviewCoordinator,
    {
      getInputContainer: () => dependencies.viewHost.getInputContainer(),
      registerEvent: (eventRef) => {
        dependencies.viewHost.registerEvent(eventRef);
      },
      registerDomEvent: (target, type, callback, options) => {
        dependencies.viewHost.registerDomEvent(target, type, callback, options);
      },
    },
  );
  const contextFileCatalogEventBridge = new ContextFileCatalogEventBridge(
    dependencies.app,
    dependencies.contextFileCatalogService,
    {
      registerEvent: (eventRef) => {
        dependencies.viewHost.registerEvent(eventRef);
      },
    },
  );
  const eventBridge = new ComposerContextEventBridge(
    focusContextEventBridge,
    contextFileCatalogEventBridge,
  );
  const viewFacade = new ComposerContextViewFacade({
    contextAttachmentBuilder: dependencies.contextAttachmentBuilder,
    runtimeStore,
    actionService,
    pickerActionService,
    coordinator,
    eventBridge,
    focusContextPreviewCoordinator,
    focusContextRuntimeService,
  });

  return {
    viewFacade,
    focusContextPreviewCoordinator,
    focusContextRuntimeService,
  };
}
