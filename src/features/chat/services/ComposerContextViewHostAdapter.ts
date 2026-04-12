import type { MarkdownView } from 'obsidian';

import type { ComposerContextRuntimeStore } from './ComposerContextRuntimeStore';
import type { ComposerContextActionServiceHost } from './ComposerContextActionService';
import type { ComposerContextChipActionServiceHost } from './ComposerContextChipActionService';
import type { ComposerContextCoordinatorHost } from './ComposerContextCoordinator';
import type { FocusContextRuntimeServiceHost } from './FocusContextRuntimeService';
export type { ComposerContextRuntimeState } from './ComposerContextRuntimeStore';

export interface ComposerContextChipActionHostOptions {
  refreshActiveFocusContextPreview(): void;
}

export interface ComposerContextActionHostOptions {
  getActiveMarkdownView(): MarkdownView | null;
}

export interface ComposerContextFocusRuntimeHostOptions {
  getCurrentConversationNotePath(): string | null;
  isComposerInteractionFocused(): boolean;
}

export class ComposerContextViewHostAdapter {
  constructor(
    private readonly runtimeStore: ComposerContextRuntimeStore,
  ) {}

  createCoordinatorHost(): ComposerContextCoordinatorHost {
    return {
      getDraftContextItems: () => this.runtimeStore.getDraftContextItems(),
      getFocusContextPreview: () => this.runtimeStore.getFocusContextPreview(),
    };
  }

  createChipActionServiceHost(
    options: ComposerContextChipActionHostOptions,
  ): ComposerContextChipActionServiceHost {
    return {
      getFocusContextPreview: () => this.runtimeStore.getFocusContextPreview(),
      addDraftContextItem: (item) => {
        this.runtimeStore.addDraftContextItem(item);
      },
      removeDraftContextItemsForTarget: (target) => {
        this.runtimeStore.removeDraftContextItemsForTarget(target);
      },
      refreshActiveFocusContextPreview: () => {
        options.refreshActiveFocusContextPreview();
      },
    };
  }

  createActionServiceHost(
    options: ComposerContextActionHostOptions,
  ): ComposerContextActionServiceHost {
    return {
      getActiveMarkdownView: () => options.getActiveMarkdownView(),
      addDraftContextItem: (item) => {
        this.runtimeStore.addDraftContextItem(item);
      },
    };
  }

  createFocusContextRuntimeServiceHost(
    options: ComposerContextFocusRuntimeHostOptions,
  ): FocusContextRuntimeServiceHost {
    return {
      getCurrentConversationNotePath: () => options.getCurrentConversationNotePath(),
      getFocusContextPreview: () => this.runtimeStore.getFocusContextPreview(),
      setFocusContextPreview: (preview) => {
        this.runtimeStore.setFocusContextPreview(preview);
      },
      isComposerInteractionFocused: () => options.isComposerInteractionFocused(),
    };
  }
}
