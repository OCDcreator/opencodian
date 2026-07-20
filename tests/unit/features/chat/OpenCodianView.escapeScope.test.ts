import { Scope, WorkspaceLeaf } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

function createView(): OpenCodianView {
  return new OpenCodianView(new WorkspaceLeaf(), {
    settings: {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode'],
      activeBackend: 'opencode',
    },
    openCodeService: {},
    storage: {},
  } as never);
}

describe('OpenCodianView Escape scope', () => {
  it('closes a registered popover before considering streaming cancellation', () => {
    const view = createView() as unknown as {
      escapeHandlers: Array<() => boolean>;
      scope: Scope;
      wireEventHandlers(): void;
      isActiveTabStreaming(): boolean;
      cancelStreaming(): void;
    };
    const closePopover = jest.fn(() => true);
    const cancelStreaming = jest.spyOn(view, 'cancelStreaming').mockImplementation(() => {});
    jest.spyOn(view, 'isActiveTabStreaming').mockReturnValue(true);
    view.escapeHandlers.push(closePopover);

    view.wireEventHandlers();
    const escapeHandler = view.scope.registeredHandlers.find((handler) => handler.key === 'Escape');
    escapeHandler?.func(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closePopover).toHaveBeenCalledTimes(1);
    expect(cancelStreaming).not.toHaveBeenCalled();
  });

  it('cancels streaming when no registered popover consumes Escape', () => {
    const view = createView() as unknown as {
      scope: Scope;
      wireEventHandlers(): void;
      isActiveTabStreaming(): boolean;
      cancelStreaming(): void;
    };
    const cancelStreaming = jest.spyOn(view, 'cancelStreaming').mockImplementation(() => {});
    jest.spyOn(view, 'isActiveTabStreaming').mockReturnValue(true);

    view.wireEventHandlers();
    const escapeHandler = view.scope.registeredHandlers.find((handler) => handler.key === 'Escape');
    escapeHandler?.func(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cancelStreaming).toHaveBeenCalledTimes(1);
  });
});
