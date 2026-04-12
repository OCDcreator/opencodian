import type { App, EventRef, MarkdownView } from 'obsidian';

import type { TabId } from '../tabs';
import { ComposerContextActionService } from './ComposerContextActionService';
import { ComposerContextChipActionService } from './ComposerContextChipActionService';
import { ComposerContextCoordinator } from './ComposerContextCoordinator';
import { ComposerContextEventBridge } from './ComposerContextEventBridge';
import { ComposerContextPickerActionService } from './ComposerContextPickerActionService';
import {
  ComposerContextRuntimeStore,
  type ComposerContextRuntimeState,
} from './ComposerContextRuntimeStore';
import { ComposerContextViewHostAdapter } from './ComposerContextViewHostAdapter';
import type { ContextAttachmentBuilder } from './ContextAttachmentBuilder';
import type { ContextFileCatalogService } from './ContextFileCatalogService';
import { FocusContextPreviewCoordinator } from './FocusContextPreviewCoordinator';
import { FocusContextRuntimeService } from './FocusContextRuntimeService';
import { FocusContextViewHostAdapter } from './FocusContextViewHostAdapter';

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

export interface FocusContextViewHost {
  getCurrentConversationNotePath(): string | null;
  setCurrentConversationNotePath(path: string | null): void;
  isComposerInteractionFocused(): boolean;
}

export interface ComposerContextServiceDependencies {
  app: App;
  contextAttachmentBuilder: ComposerContextAttachmentBuilderPort;
  contextFileCatalogService: ComposerContextFileCatalogPort;
  viewHost: ComposerContextViewHost;
  focusViewHost: FocusContextViewHost;
}

export interface ComposerContextServices {
  runtimeStore: ComposerContextRuntimeStore;
  actionService: ComposerContextActionService;
  pickerActionService: ComposerContextPickerActionService;
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
  const focusViewHostAdapter = new FocusContextViewHostAdapter(runtimeStore);
  const actionService = new ComposerContextActionService(
    dependencies.contextAttachmentBuilder,
    viewHostAdapter.createActionServiceHost({
      getActiveMarkdownView: () => dependencies.viewHost.getActiveMarkdownView(),
    }),
  );
  const focusContextRuntimeService = new FocusContextRuntimeService(
    dependencies.app,
    focusViewHostAdapter.createFocusContextRuntimeServiceHost({
      getCurrentConversationNotePath: () => dependencies.focusViewHost.getCurrentConversationNotePath(),
      isComposerInteractionFocused: () => dependencies.focusViewHost.isComposerInteractionFocused(),
    }),
  );
  const focusContextPreviewCoordinator = new FocusContextPreviewCoordinator(
    focusViewHostAdapter.createFocusContextPreviewCoordinatorHost({
      setCurrentConversationNotePath: (path) => {
        dependencies.focusViewHost.setCurrentConversationNotePath(path);
      },
    }),
    focusContextRuntimeService,
  );
  const pickerActionService = new ComposerContextPickerActionService(
    dependencies.app,
    dependencies.contextAttachmentBuilder,
    dependencies.contextFileCatalogService,
    viewHostAdapter.createPickerActionServiceHost({
      beginContextPickerInteraction: () => {
        focusContextRuntimeService.handleComposerPointerDown();
      },
      completeContextPickerInteraction: () => {
        focusContextPreviewCoordinator.scheduleFocusContextPreviewRefresh();
      },
    }),
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
    pickerActionService,
    chipActionService,
    coordinator,
    eventBridge,
    focusContextPreviewCoordinator,
    focusContextRuntimeService,
  };
}
