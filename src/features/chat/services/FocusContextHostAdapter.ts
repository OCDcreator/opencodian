import type { App } from 'obsidian';

import type { ComposerContextRuntimeStore } from './ComposerContextRuntimeStore';
import { ContextPickerInteractionBridge } from './ContextPickerInteractionBridge';
import { FocusContextPreviewCoordinator } from './FocusContextPreviewCoordinator';
import { FocusContextRuntimeService } from './FocusContextRuntimeService';
import { FocusContextViewHostAdapter } from './FocusContextViewHostAdapter';

export interface FocusContextRuntimeViewHost {
  getCurrentConversationNotePath(): string | null;
  isComposerInteractionFocused(): boolean;
}

export interface FocusContextPreviewWritebackHost {
  setCurrentConversationNotePath(path: string | null): void;
}

export interface FocusContextHostAdapterDependencies {
  app: App;
  runtimeStore: ComposerContextRuntimeStore;
  focusRuntimeViewHost: FocusContextRuntimeViewHost;
  focusPreviewWritebackHost: FocusContextPreviewWritebackHost;
}

export interface FocusContextServices {
  focusContextPreviewCoordinator: FocusContextPreviewCoordinator;
  focusContextRuntimeService: FocusContextRuntimeService;
  contextPickerInteractionBridge: ContextPickerInteractionBridge;
}

export function createFocusContextServices(
  dependencies: FocusContextHostAdapterDependencies,
): FocusContextServices {
  const focusViewHostAdapter = new FocusContextViewHostAdapter(dependencies.runtimeStore);
  const focusContextRuntimeService = new FocusContextRuntimeService(
    dependencies.app,
    focusViewHostAdapter.createFocusContextRuntimeServiceHost({
      getCurrentConversationNotePath: () =>
        dependencies.focusRuntimeViewHost.getCurrentConversationNotePath(),
      isComposerInteractionFocused: () =>
        dependencies.focusRuntimeViewHost.isComposerInteractionFocused(),
    }),
  );
  const focusContextPreviewCoordinator = new FocusContextPreviewCoordinator(
    focusViewHostAdapter.createFocusContextPreviewCoordinatorHost({
      setCurrentConversationNotePath: (path) => {
        dependencies.focusPreviewWritebackHost.setCurrentConversationNotePath(path);
      },
    }),
    focusContextRuntimeService,
  );
  const contextPickerInteractionBridge = new ContextPickerInteractionBridge(
    focusContextRuntimeService,
    focusContextPreviewCoordinator,
  );

  return {
    focusContextPreviewCoordinator,
    focusContextRuntimeService,
    contextPickerInteractionBridge,
  };
}
