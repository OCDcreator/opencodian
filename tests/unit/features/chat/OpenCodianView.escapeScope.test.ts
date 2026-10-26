import { Scope, WorkspaceLeaf } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { EffortSelector } from '../../../../src/features/chat/ui/EffortSelector';

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
  it('closes effort through the host scope when Escape never reaches document listeners', () => {
    const view = createView() as unknown as {
      effortSelector: EffortSelector;
      scope: Scope;
      wireEventHandlers(): void;
      isActiveTabStreaming(): boolean;
      cancelStreaming(): void;
    };
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const onVariantChange = jest.fn(async () => {});
    const selector = new EffortSelector(parent, {
      getVariants: () => ['low', 'high'], getVariant: () => 'high',
      getCurrentModel: () => 'provider/model', onVariantChange,
    });
    view.effortSelector = selector;
    const cancelStreaming = jest.spyOn(view, 'cancelStreaming').mockImplementation(() => {});
    jest.spyOn(view, 'isActiveTabStreaming').mockReturnValue(true);
    view.wireEventHandlers();
    const trigger = parent.querySelector<HTMLElement>('.opencodian-effort-current')!;
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const escapeHandler = view.scope.registeredHandlers.find((handler) => handler.key === 'Escape');

    // Obsidian consumes this key at window capture, before document handlers.
    escapeHandler?.func(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(onVariantChange).not.toHaveBeenCalled();
    expect(cancelStreaming).not.toHaveBeenCalled();
    selector.destroy();
    parent.remove();
  });

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
