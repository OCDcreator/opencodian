import { ContextPickerInteractionBridge } from '../../../../src/features/chat/services/ContextPickerInteractionBridge';

describe('ContextPickerInteractionBridge', () => {
  it('bridges picker begin and complete to retained-selection handoff and preview refresh', () => {
    const focusContextRuntimeService = {
      handleComposerPointerDown: jest.fn(),
    };
    const focusContextPreviewCoordinator = {
      scheduleFocusContextPreviewRefresh: jest.fn(),
    };
    const bridge = new ContextPickerInteractionBridge(
      focusContextRuntimeService,
      focusContextPreviewCoordinator,
    );

    bridge.beginContextPickerInteraction();
    bridge.completeContextPickerInteraction();

    expect(focusContextRuntimeService.handleComposerPointerDown).toHaveBeenCalledTimes(1);
    expect(focusContextPreviewCoordinator.scheduleFocusContextPreviewRefresh).toHaveBeenCalledTimes(1);
  });
});
