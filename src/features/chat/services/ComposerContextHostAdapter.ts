import type { App, EventRef, MarkdownView } from 'obsidian';

import type { TabId } from '../tabs';
import { ComposerContextActionService } from './ComposerContextActionService';
import { ComposerContextChipActionService } from './ComposerContextChipActionService';
import { ComposerContextCoordinator } from './ComposerContextCoordinator';
import { ComposerContextEventBridge } from './ComposerContextEventBridge';
import {
  ComposerContextRuntimeStore,
  type ComposerContextRuntimeState,
} from './ComposerContextRuntimeStore';
import { ComposerContextViewHostAdapter } from './ComposerContextViewHostAdapter';
import type { ContextAttachmentBuilder } from './ContextAttachmentBuilder';
import type { ContextFileCatalogService } from './ContextFileCatalogService';
import { FocusContextPreviewCoordinator } from './FocusContextPreviewCoordinator';
import { FocusContextRuntimeService } from './FocusContextRuntimeService';

type ComposerContextAttachmentBuilderPort = Pick<
  ContextAttachmentBuilder,
  | 'buildCurrentNoteContextItem'
  | 'buildSelectionContextItem'
  | 'buildFileContextItem'
  | 'buildFileContextItemFromPath'
  | 'buildSelectionContextItemFromPreview'
  | 'hasFileAtPath'
>;

type ComposerContextFileCatalogPort = Pick<
  ContextFileCatalogService,
  'getCatalog' | 'handleCreate' | 'handleDelete' | 'handleRename'
>;

export interface ComposerContextViewHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): ComposerContextRuntimeState | null;
  getCurrentConversationNotePath(): string | null;
  setCurrentConversationNotePath(path: string | null): void;
  getActiveMarkdownView(): MarkdownView | null;
  isComposerInteractionFocused(): boolean;
  getInputContainer(): HTMLElement | null;
  registerEvent(eventRef: EventRef): void;
  registerDomEvent(
    target: Window | Document | HTMLElement,
    type: string,
    callback: (event: Event) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

export interface ComposerContextServiceDependencies {
  app: App;
  contextAttachmentBuilder: ComposerContextAttachmentBuilderPort;
  contextFileCatalogService: ComposerContextFileCatalogPort;
  viewHost: ComposerContextViewHost;
}

export interface ComposerContextServices {
  runtimeStore: ComposerContextRuntimeStore;
  actionService: ComposerContextActionService;
  chipActionService: ComposerContextChipActionService;
  coordinator: ComposerContextCoordinator;
  eventBridge: ComposerContextEventBridge;
  focusContextPreviewCoordinator: FocusContextPreviewCoordinator;
  focusContextRuntimeService: FocusContextRuntimeService;
}

export function createComposerContextServices(
  dependencies: ComposerContextServiceDependencies,
): ComposerContextServices {
  let coordinator!: ComposerContextCoordinator;

  const runtimeStore = new ComposerContextRuntimeStore({
    getActiveTabId: () => dependencies.viewHost.getActiveTabId(),
    getTabRuntimeState: (tabId) => dependencies.viewHost.getTabRuntimeState(tabId),
    renderComposerContext: () => {
      coordinator.render();
    },
  });
  const viewHostAdapter = new ComposerContextViewHostAdapter(runtimeStore);
  const actionService = new ComposerContextActionService(
    dependencies.app,
    dependencies.contextAttachmentBuilder,
    dependencies.contextFileCatalogService,
    viewHostAdapter.createActionServiceHost({
      getActiveMarkdownView: () => dependencies.viewHost.getActiveMarkdownView(),
    }),
  );
  const focusContextRuntimeService = new FocusContextRuntimeService(
    dependencies.app,
    viewHostAdapter.createFocusContextRuntimeServiceHost({
      getCurrentConversationNotePath: () => dependencies.viewHost.getCurrentConversationNotePath(),
      isComposerInteractionFocused: () => dependencies.viewHost.isComposerInteractionFocused(),
    }),
  );
  const focusContextPreviewCoordinator = new FocusContextPreviewCoordinator(
    {
      setCurrentConversationNotePath: (path) => {
        dependencies.viewHost.setCurrentConversationNotePath(path);
      },
    },
    focusContextRuntimeService,
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
  const eventBridge = new ComposerContextEventBridge(
    dependencies.app,
    focusContextRuntimeService,
    focusContextPreviewCoordinator,
    dependencies.contextFileCatalogService,
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

  return {
    runtimeStore,
    actionService,
    chipActionService,
    coordinator,
    eventBridge,
    focusContextPreviewCoordinator,
    focusContextRuntimeService,
  };
}
