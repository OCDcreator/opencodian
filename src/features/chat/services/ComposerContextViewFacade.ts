import type { Editor, MarkdownView } from 'obsidian';

import type { PromptContextItem } from '../../../core/types';
import type { TabId } from '../tabs';
import type { ComposerContextActionService } from './ComposerContextActionService';
import type { ComposerContextCoordinator } from './ComposerContextCoordinator';
import type { ComposerContextEventBridge } from './ComposerContextEventBridge';
import type { ComposerContextPickerActionService } from './ComposerContextPickerActionService';
import type { ComposerContextRuntimeStore } from './ComposerContextRuntimeStore';
import type { FocusContextPreviewCoordinator } from './FocusContextPreviewCoordinator';
import type { FocusContextRuntimeService } from './FocusContextRuntimeService';

type ComposerContextRuntimeStorePort = Pick<
  ComposerContextRuntimeStore,
  'getDraftContextItems' | 'clearDraftContextItems'
>;

type ComposerContextActionPort = Pick<
  ComposerContextActionService,
  'addCurrentNoteContextFromActiveEditor' | 'addSelectionContextFromActiveEditor'
>;

type ComposerContextPickerActionPort = Pick<
  ComposerContextPickerActionService,
  'addChosenFileContextToActiveTab'
>;

type ComposerContextCoordinatorPort = Pick<ComposerContextCoordinator, 'setContextRowElement'>;

type ComposerContextLifecyclePort = Pick<ComposerContextEventBridge, 'start' | 'dispose'>;

type FocusContextRuntimePort = Pick<FocusContextRuntimeService, 'getActiveMarkdownView'>;

type FocusContextPreviewPort = Pick<
  FocusContextPreviewCoordinator,
  'refreshActiveFocusContextPreview'
>;

export interface ComposerContextViewFacadeDependencies {
  runtimeStore: ComposerContextRuntimeStorePort;
  actionService: ComposerContextActionPort;
  pickerActionService: ComposerContextPickerActionPort;
  coordinator: ComposerContextCoordinatorPort;
  eventBridge: ComposerContextLifecyclePort;
  focusContextRuntimeService: FocusContextRuntimePort;
  focusContextPreviewCoordinator: FocusContextPreviewPort;
}

export class ComposerContextViewFacade {
  constructor(private readonly dependencies: ComposerContextViewFacadeDependencies) {}

  getDraftContextItems(tabId?: TabId | null): PromptContextItem[] {
    return this.dependencies.runtimeStore.getDraftContextItems(tabId);
  }

  clearDraftContextItems(tabId?: TabId | null): void {
    this.dependencies.runtimeStore.clearDraftContextItems(tabId);
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

  start(): void {
    this.dependencies.eventBridge.start();
  }

  dispose(): void {
    this.dependencies.eventBridge.dispose();
  }
}
