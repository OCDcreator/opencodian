export interface CapabilityLabBackendTabState {
  readonly state: string;
  readonly label: string;
}

export interface CapabilityLabBackendTabRenderContext {
  refreshState(): void;
  isCurrent(): boolean;
}

export interface CapabilityLabBackendTabDescriptor {
  readonly id: string;
  readonly label: string;
  getState(): CapabilityLabBackendTabState;
  render(panelEl: HTMLElement, context: CapabilityLabBackendTabRenderContext): void;
}

export interface CapabilityLabBackendTabsOptions {
  readonly containerEl: HTMLElement;
  readonly descriptors: readonly CapabilityLabBackendTabDescriptor[];
  readonly initialId?: string;
  readonly persistedId?: string;
  readonly activeBackend?: string;
  readonly tablistLabel: string;
  readonly panelLoadError: string;
  readonly onPersist?: (id: string) => void | Promise<void>;
}

export interface CapabilityLabBackendTabsController {
  activate(id: string, options?: { readonly focus?: boolean; readonly persist?: boolean }): void;
  refreshState(id: string): void;
  getActiveId(): string;
  dispose(): void;
}

interface TabEntry {
  readonly descriptor: CapabilityLabBackendTabDescriptor;
  readonly tabEl: HTMLButtonElement;
  readonly stateEl: HTMLElement;
  readonly panelEl: HTMLElement;
  readonly onKeydown: (event: KeyboardEvent) => void;
  readonly onClick: () => void;
  mounted: boolean;
  generation: number;
}

const TAB_ROOT_ATTRIBUTE = 'data-capability-backend-tabs';

function toDomToken(value: string): string {
  const token = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
  return token.length > 0 ? token : 'backend';
}

function createStableId(prefix: string, descriptorId: string): string {
  return `${prefix}-${toDomToken(descriptorId)}`;
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return typeof value === 'object'
    && value !== null
    && 'then' in value
    && typeof value.then === 'function';
}

export function createCapabilityLabBackendTabs(
  options: CapabilityLabBackendTabsOptions,
): CapabilityLabBackendTabsController {
  if (options.descriptors.length === 0) {
    throw new Error('Capability Lab tabs require at least one descriptor.');
  }

  const rootEl = document.createElement('div');
  rootEl.setAttribute(TAB_ROOT_ATTRIBUTE, 'true');
  options.containerEl.appendChild(rootEl);

  const tablistEl = document.createElement('div');
  tablistEl.setAttribute('role', 'tablist');
  tablistEl.setAttribute('aria-label', options.tablistLabel);
  tablistEl.dataset.capabilityBackendTablist = 'true';
  tablistEl.setAttribute('data-capability-backend-tablist', 'true');
  rootEl.appendChild(tablistEl);

  const entries: TabEntry[] = [];
  let activeId = resolveInitialId(options);
  let disposed = false;

  const findEntry = (id: string): TabEntry | undefined => entries.find((entry) => entry.descriptor.id === id);

  const updateTabState = (entry: TabEntry): void => {
    const state = entry.descriptor.getState();
    entry.tabEl.dataset.backendState = state.state;
    entry.tabEl.setAttribute('aria-label', `${entry.descriptor.label}: ${state.label}`);
    entry.stateEl.textContent = state.label;
  };

  const updateSelection = (): void => {
    for (const entry of entries) {
      const selected = entry.descriptor.id === activeId;
      entry.tabEl.setAttribute('aria-selected', String(selected));
      entry.tabEl.tabIndex = selected ? 0 : -1;
      entry.panelEl.hidden = !selected;
    }
  };

  const scrollTabIntoView = (tabEl: HTMLButtonElement): void => {
    if (typeof tabEl.scrollIntoView === 'function') {
      tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  const focusTab = (index: number): void => {
    const entry = entries[index];
    if (!entry) return;
    entry.tabEl.focus();
    scrollTabIntoView(entry.tabEl);
  };

  const mountEntry = (entry: TabEntry): void => {
    if (entry.mounted || disposed) return;
    entry.generation += 1;
    const renderGeneration = entry.generation;
    entry.panelEl.textContent = '';
    entry.panelEl.removeAttribute('data-capability-panel-error');
    const context: CapabilityLabBackendTabRenderContext = {
      refreshState: () => {
        if (!disposed
          && rootEl.isConnected
          && entry.panelEl.isConnected
          && entry.generation === renderGeneration) {
          updateTabState(entry);
        }
      },
      isCurrent: () => !disposed
        && entry.generation === renderGeneration
        && rootEl.isConnected
        && entry.panelEl.isConnected,
    };

    try {
      entry.descriptor.render(entry.panelEl, context);
      entry.mounted = true;
      entry.panelEl.dataset.capabilityPanelMounted = 'true';
    } catch {
      entry.panelEl.textContent = options.panelLoadError;
      entry.panelEl.dataset.capabilityPanelError = 'true';
    }
  };

  const persistSelection = (id: string): void => {
    const result = options.onPersist?.(id);
    if (!isPromiseLike(result)) return;
    void result.catch(() => undefined);
  };

  const activate = (
    id: string,
    activationOptions: { readonly focus?: boolean; readonly persist?: boolean } = {},
  ): void => {
    if (disposed) return;
    const entry = findEntry(id);
    if (!entry) return;
    activeId = id;
    updateSelection();
    updateTabState(entry);
    mountEntry(entry);
    if (activationOptions.focus) {
      entry.tabEl.focus();
      scrollTabIntoView(entry.tabEl);
    }
    if (activationOptions.persist !== false) {
      persistSelection(id);
    }
  };

  const handleKeydown = (entry: TabEntry, event: KeyboardEvent): void => {
    const currentIndex = entries.indexOf(entry);
    if (currentIndex < 0) return;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? entries.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + entries.length) % entries.length;
      focusTab(nextIndex);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(entry.descriptor.id, { focus: true, persist: true });
    }
  };

  for (const descriptor of options.descriptors) {
    const tabId = createStableId('opencodian-capability-lab-tab', descriptor.id);
    const panelId = createStableId('opencodian-capability-lab-panel', descriptor.id);
    const tabEl = document.createElement('button');
    tabEl.type = 'button';
    tabEl.id = tabId;
    tabEl.setAttribute('role', 'tab');
    tabEl.setAttribute('aria-controls', panelId);
    tabEl.dataset.capabilityBackendTab = descriptor.id;
    const labelEl = document.createElement('span');
    labelEl.textContent = descriptor.label;
    tabEl.appendChild(labelEl);
    const stateEl = document.createElement('span');
    stateEl.dataset.capabilityBackendTabState = 'true';
    tabEl.appendChild(stateEl);
    tablistEl.appendChild(tabEl);

    const panelEl = document.createElement('section');
    panelEl.id = panelId;
    panelEl.setAttribute('role', 'tabpanel');
    panelEl.setAttribute('aria-labelledby', tabId);
    panelEl.hidden = true;
    panelEl.dataset.capabilityBackendPanel = descriptor.id;
    rootEl.appendChild(panelEl);

    const entry: TabEntry = {
      descriptor,
      tabEl,
      stateEl,
      panelEl,
      onKeydown: (event) => handleKeydown(entry, event),
      onClick: () => activate(descriptor.id, { focus: true, persist: true }),
      mounted: false,
      generation: 0,
    };
    entries.push(entry);
    tabEl.addEventListener('keydown', entry.onKeydown);
    tabEl.addEventListener('click', entry.onClick);
    updateTabState(entry);
  }

  const initialEntry = findEntry(activeId) ?? entries[0];
  activeId = initialEntry.descriptor.id;
  updateSelection();
  mountEntry(initialEntry);

  return {
    activate,
    refreshState: (id: string): void => {
      if (disposed || !rootEl.isConnected) return;
      const entry = findEntry(id);
      if (entry?.panelEl.isConnected) updateTabState(entry);
    },
    getActiveId: (): string => activeId,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      for (const entry of entries) {
        entry.tabEl.removeEventListener('keydown', entry.onKeydown);
        entry.tabEl.removeEventListener('click', entry.onClick);
      }
      rootEl.remove();
    },
  };
}

function resolveInitialId(options: CapabilityLabBackendTabsOptions): string {
  const validIds = new Set(options.descriptors.map((descriptor) => descriptor.id));
  const candidates = [options.initialId, options.persistedId, options.activeBackend];
  const selected = candidates.find((candidate): candidate is string => candidate !== undefined && validIds.has(candidate));
  return selected ?? options.descriptors[0].id;
}
