import type { FocusContextPreviewCoordinator } from './FocusContextPreviewCoordinator';
import type { FocusContextRuntimeService } from './FocusContextRuntimeService';

type ContextPickerFocusRuntimePort = Pick<
  FocusContextRuntimeService,
  'handleComposerPointerDown'
>;

type ContextPickerFocusPreviewPort = Pick<
  FocusContextPreviewCoordinator,
  'scheduleFocusContextPreviewRefresh'
>;

export class ContextPickerInteractionBridge {
  constructor(
    private readonly focusContextRuntimeService: ContextPickerFocusRuntimePort,
    private readonly focusContextPreviewCoordinator: ContextPickerFocusPreviewPort,
  ) {}

  beginContextPickerInteraction(): void {
    this.focusContextRuntimeService.handleComposerPointerDown();
  }

  completeContextPickerInteraction(): void {
    this.focusContextPreviewCoordinator.scheduleFocusContextPreviewRefresh();
  }
}
