import type { App, EventRef, MarkdownView } from 'obsidian';

import type { TabId } from '../tabs';
import { ComposerContextActionService } from './ComposerContextActionService';
import { ComposerContextChipActionService } from './ComposerContextChipActionService';
import { ComposerContextCoordinator } from './ComposerContextCoordinator';
import { ComposerContextEventBridge } from './ComposerContextEventBridge';
import { ComposerContextPickerActionService } from './ComposerContextPickerActionService';
import { ComposerContextViewFacade } from './ComposerContextViewFacade';
import { ContextFileCatalogEventBridge } from './ContextFileCatalogEventBridge';
import {
  ComposerContextRuntimeStore,
  type ComposerContextRuntimeState,
} from './ComposerContextRuntimeStore';
import { ComposerContextViewHostAdapter } from './ComposerContextViewHostAdapter';
import type { ContextAttachmentBuilder } from './ContextAttachmentBuilder';
import type { ContextFileCatalogService } from './ContextFileCatalogService';
import {
  createFocusContextServices,
  type FocusContextPreviewWritebackHost,
  type FocusContextRuntimeViewHost,
} from './FocusContextHostAdapter';
import { FocusContextEventBridge } from './FocusContextEventBridge';
import type { FocusContextPreviewCoordinator } from './FocusContextPreviewCoordinator';
import type { FocusContextRuntimeService } from './FocusContextRuntimeService';

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
}

export interface ComposerContextServices {
  viewFacade: ComposerContextViewFacade;
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
