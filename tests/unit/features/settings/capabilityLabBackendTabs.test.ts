/* eslint-disable max-lines-per-function -- focused controller contract coverage stays in one suite. */

import {
  type CapabilityLabBackendTabDescriptor,
  type CapabilityLabBackendTabsController,
  createCapabilityLabBackendTabs,
} from '../../../../src/features/settings/capabilityLabBackendTabs';

interface TestDescriptorOptions {
  readonly id: string;
  readonly label?: string;
  readonly state?: string;
  readonly stateLabel?: string;
  readonly render?: (panelEl: HTMLElement, context: { refreshState(): void; isCurrent(): boolean }) => void;
}

function createDescriptor(options: TestDescriptorOptions): CapabilityLabBackendTabDescriptor {
  return {
    id: options.id,
    label: options.label ?? options.id,
    getState: () => ({
      state: options.state ?? 'available',
      label: options.stateLabel ?? 'Available',
    }),
    render: options.render ?? (() => undefined),
  };
}

interface TestControllerOptions {
  readonly descriptors?: readonly CapabilityLabBackendTabDescriptor[];
  readonly persistedId?: string;
  readonly activeBackend?: string;
  readonly initialId?: string;
  readonly onPersist?: jest.Mock<void, [string]>;
  readonly panelLoadError?: string;
}

function createController(options: TestControllerOptions = {}): {
  readonly controller: CapabilityLabBackendTabsController;
  readonly rootEl: HTMLElement;
  readonly onPersist: jest.Mock<void, [string]>;
} {
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const onPersist = options.onPersist ?? jest.fn<void, [string]>();
  const descriptors = options.descriptors ?? [
    createDescriptor({ id: 'claude-code', label: 'Claude Code' }),
    createDescriptor({ id: 'opencode', label: 'OpenCode' }),
    createDescriptor({ id: 'codex', label: 'Codex' }),
  ];
  const controller = createCapabilityLabBackendTabs({
    containerEl: rootEl,
    descriptors,
    initialId: options.initialId,
    persistedId: options.persistedId,
    activeBackend: options.activeBackend,
    tablistLabel: 'Capability Lab backends',
    panelLoadError: options.panelLoadError ?? 'This panel could not be loaded.',
    onPersist,
  });
  return { controller, rootEl, onPersist };
}

function getTab(rootEl: HTMLElement, id: string): HTMLButtonElement {
  const tab = rootEl.querySelector<HTMLButtonElement>(`[data-capability-backend-tab="${id}"]`);
  expect(tab).not.toBeNull();
  return tab as HTMLButtonElement;
}

function getPanel(rootEl: HTMLElement, id: string): HTMLElement {
  const panel = rootEl.querySelector<HTMLElement>(`[data-capability-backend-panel="${id}"]`);
  expect(panel).not.toBeNull();
  return panel as HTMLElement;
}

describe('createCapabilityLabBackendTabs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses descriptor order and supports a synthetic future descriptor', () => {
    const { rootEl, controller } = createController({
      descriptors: [
        createDescriptor({ id: 'first', label: 'First' }),
        createDescriptor({ id: 'second', label: 'Second' }),
        createDescriptor({ id: 'future', label: 'Future backend' }),
      ],
      initialId: 'future',
    });

    expect(Array.from(rootEl.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent?.trim())).toEqual([
      'FirstAvailable',
      'SecondAvailable',
      'Future backendAvailable',
    ]);
    expect(controller.getActiveId()).toBe('future');
  });

  it('resolves a valid persisted id, then active backend, then the first descriptor', () => {
    const descriptors = [
      createDescriptor({ id: 'first', label: 'First' }),
      createDescriptor({ id: 'second', label: 'Second' }),
    ];

    expect(createController({ descriptors, persistedId: 'second', activeBackend: 'first' }).controller.getActiveId())
      .toBe('second');
    expect(createController({ descriptors, persistedId: 'stale', activeBackend: 'second' }).controller.getActiveId())
      .toBe('second');
    expect(createController({ descriptors, persistedId: 'stale', activeBackend: 'also-stale' }).controller.getActiveId())
      .toBe('first');
  });

  it('creates complete ARIA relationships and roving tabindex state', () => {
    const { rootEl, controller } = createController({ persistedId: 'opencode' });
    const tablist = rootEl.querySelector('[role="tablist"]');
    const tabs = Array.from(rootEl.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(rootEl.querySelectorAll<HTMLElement>('[role="tabpanel"]'));

    expect(tablist).not.toBeNull();
    expect(tablist?.getAttribute('aria-label')).toBe('Capability Lab backends');
    expect(tabs).toHaveLength(3);
    expect(panels).toHaveLength(3);
    expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.capabilityBackendTab)
      .toBe('opencode');
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    expect(tabs.find((tab) => tab.tabIndex === 0)?.dataset.capabilityBackendTab).toBe('opencode');

    for (const tab of tabs) {
      const controls = tab.getAttribute('aria-controls');
      expect(controls).not.toBeNull();
      const panel = controls ? rootEl.querySelector<HTMLElement>(`#${controls}`) : null;
      expect(panel?.getAttribute('role')).toBe('tabpanel');
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
    }
    for (const panel of panels) {
      expect(panel.id).toBeTruthy();
      expect(panel.getAttribute('aria-labelledby')).toBeTruthy();
      expect(panel.hidden).toBe(panel.dataset.capabilityBackendPanel !== 'opencode');
    }
    expect(controller.getActiveId()).toBe('opencode');
  });

  it('moves focus with wrapping arrows and Home/End without activating panels', () => {
    const renderFirst = jest.fn();
    const renderSecond = jest.fn();
    const renderThird = jest.fn();
    const { rootEl, controller } = createController({
      descriptors: [
        createDescriptor({ id: 'first', render: renderFirst }),
        createDescriptor({ id: 'second', render: renderSecond }),
        createDescriptor({ id: 'third', render: renderThird }),
      ],
      initialId: 'second',
    });
    const secondTab = getTab(rootEl, 'second');
    const firstTab = getTab(rootEl, 'first');
    const thirdTab = getTab(rootEl, 'third');

    secondTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(firstTab);
    expect(controller.getActiveId()).toBe('second');
    expect(renderFirst).not.toHaveBeenCalled();

    firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(thirdTab);
    thirdTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(firstTab);

    firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(thirdTab);
    thirdTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(firstTab);
    expect(renderThird).not.toHaveBeenCalled();
  });

  it('activates with Enter, Space, and pointer input while keeping focus on the tab', () => {
    const renderSecond = jest.fn();
    const { rootEl, controller, onPersist } = createController({
      descriptors: [
        createDescriptor({ id: 'first' }),
        createDescriptor({ id: 'second', render: renderSecond }),
      ],
      initialId: 'first',
    });
    const secondTab = getTab(rootEl, 'second');

    secondTab.focus();
    secondTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(controller.getActiveId()).toBe('second');
    expect(document.activeElement).toBe(secondTab);
    expect(renderSecond).toHaveBeenCalledTimes(1);
    expect(onPersist).toHaveBeenCalledWith('second');

    controller.activate('first', { focus: false, persist: false });
    secondTab.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(controller.getActiveId()).toBe('second');
    expect(renderSecond).toHaveBeenCalledTimes(1);

    const firstTab = getTab(rootEl, 'first');
    firstTab.click();
    expect(controller.getActiveId()).toBe('first');
    expect(document.activeElement).toBe(firstTab);
    expect(onPersist).toHaveBeenLastCalledWith('first');
  });

  it('lazy mounts the initial panel and caches each panel after first activation', () => {
    const renderFirst = jest.fn();
    const renderSecond = jest.fn();
    const renderThird = jest.fn();
    const { rootEl, controller } = createController({
      descriptors: [
        createDescriptor({ id: 'first', render: renderFirst }),
        createDescriptor({ id: 'second', render: renderSecond }),
        createDescriptor({ id: 'third', render: renderThird }),
      ],
      initialId: 'second',
    });

    expect(renderFirst).not.toHaveBeenCalled();
    expect(renderSecond).toHaveBeenCalledTimes(1);
    expect(renderThird).not.toHaveBeenCalled();
    expect(getPanel(rootEl, 'second').dataset.capabilityPanelMounted).toBe('true');

    const secondTab = getTab(rootEl, 'second');
    secondTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(renderFirst).not.toHaveBeenCalled();
    getTab(rootEl, 'first').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(renderFirst).toHaveBeenCalledTimes(1);
    controller.activate('second', { focus: false, persist: false });
    controller.activate('first', { focus: false, persist: false });
    expect(renderFirst).toHaveBeenCalledTimes(1);
    expect(renderSecond).toHaveBeenCalledTimes(1);
  });

  it('passes a current render context and refreshes state for the owning tab', () => {
    let context: { refreshState(): void; isCurrent(): boolean } | undefined;
    const getState = jest.fn(() => ({ state: 'available', label: 'Available' }));
    const descriptor: CapabilityLabBackendTabDescriptor = {
      id: 'first',
      label: 'First',
      getState,
      render: (_panelEl, renderContext) => {
        context = renderContext;
      },
    };
    const { rootEl, controller } = createController({
      descriptors: [descriptor, createDescriptor({ id: 'second', label: 'Second' })],
    });
    const tab = getTab(rootEl, 'first');

    expect(context?.isCurrent()).toBe(true);
    expect(getState).toHaveBeenCalled();
    getState.mockReturnValue({ state: 'empty', label: 'Empty' });
    context?.refreshState();
    expect(tab.dataset.backendState).toBe('empty');
    expect(tab.getAttribute('aria-label')).toBe('First: Empty');
    expect(controller.getActiveId()).toBe('first');

    controller.activate('second', { focus: false, persist: false });
    expect(context?.isCurrent()).toBe(true);
    getState.mockReturnValue({ state: 'unknown', label: 'Unknown' });
    context?.refreshState();
    expect(tab.dataset.backendState).toBe('unknown');
    expect(tab.getAttribute('aria-label')).toBe('First: Unknown');
  });

  it('does not refresh a disposed render context', () => {
    let context: { refreshState(): void; isCurrent(): boolean } | undefined;
    const getState = jest.fn(() => ({ state: 'available', label: 'Available' }));
    const descriptor: CapabilityLabBackendTabDescriptor = {
      id: 'first',
      label: 'First',
      getState,
      render: (_panelEl, renderContext) => {
        context = renderContext;
      },
    };
    const { controller } = createController({ descriptors: [descriptor] });
    expect(getState).toHaveBeenCalledTimes(1);
    controller.dispose();
    getState.mockReturnValue({ state: 'empty', label: 'Empty' });
    controller.refreshState('first');
    context?.refreshState();

    expect(context?.isCurrent()).toBe(false);
    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('rejects context and controller state refresh when the root or panel is detached', () => {
    let context: { refreshState(): void; isCurrent(): boolean } | undefined;
    const getState = jest.fn(() => ({ state: 'available', label: 'Available' }));
    const descriptor: CapabilityLabBackendTabDescriptor = {
      id: 'first',
      label: 'First',
      getState,
      render: (_panelEl, renderContext) => {
        context = renderContext;
      },
    };
    const { rootEl, controller } = createController({
      descriptors: [descriptor, createDescriptor({ id: 'second', label: 'Second' })],
    });
    const tab = getTab(rootEl, 'first');
    const panel = getPanel(rootEl, 'first');

    expect(getState).toHaveBeenCalledTimes(1);
    getState.mockReturnValue({ state: 'empty', label: 'Empty' });
    panel.remove();
    controller.refreshState('first');
    context?.refreshState();

    expect(context?.isCurrent()).toBe(false);
    expect(getState).toHaveBeenCalledTimes(1);
    expect(tab.dataset.backendState).toBe('available');

    rootEl.remove();
    getState.mockReturnValue({ state: 'unknown', label: 'Unknown' });
    controller.refreshState('first');
    context?.refreshState();
    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('renders the supplied sanitized error when a panel renderer fails', () => {
    const render = jest.fn(() => {
      throw new Error('raw backend payload');
    });
    const { rootEl, controller } = createController({
      descriptors: [createDescriptor({ id: 'first', render })],
      panelLoadError: 'Unable to load this capability panel.',
    });
    const panel = getPanel(rootEl, 'first');

    expect(controller.getActiveId()).toBe('first');
    expect(panel.textContent).toBe('Unable to load this capability panel.');
    expect(panel.textContent).not.toContain('raw backend payload');
    expect(panel.dataset.capabilityPanelMounted).toBeUndefined();
  });

  it('calls scrollIntoView only when the focused tab provides it', () => {
    const { rootEl } = createController();
    const tab = getTab(rootEl, 'claude-code');
    const scrollIntoView = jest.fn();
    Object.defineProperty(tab, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(scrollIntoView).not.toHaveBeenCalled();
    const opencodeTab = getTab(rootEl, 'opencode');
    const codexTab = getTab(rootEl, 'codex');
    Object.defineProperty(codexTab, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    opencodeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });
});
