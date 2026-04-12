import type { ComposerContextRuntimeStore } from './ComposerContextRuntimeStore';
import type { FocusContextPreviewCoordinatorHost } from './FocusContextPreviewCoordinator';
import type { FocusContextRuntimeServiceHost } from './FocusContextRuntimeService';

export interface FocusContextRuntimeHostOptions {
  getCurrentConversationNotePath(): string | null;
  isComposerInteractionFocused(): boolean;
}

export interface FocusContextPreviewCoordinatorHostOptions {
  setCurrentConversationNotePath(path: string | null): void;
}

export class FocusContextViewHostAdapter {
  constructor(
    private readonly runtimeStore: ComposerContextRuntimeStore,
  ) {}

  createFocusContextRuntimeServiceHost(
    options: FocusContextRuntimeHostOptions,
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

  createFocusContextPreviewCoordinatorHost(
    options: FocusContextPreviewCoordinatorHostOptions,
  ): FocusContextPreviewCoordinatorHost {
    return {
      setCurrentConversationNotePath: (path) => {
        options.setCurrentConversationNotePath(path);
      },
    };
  }
}
