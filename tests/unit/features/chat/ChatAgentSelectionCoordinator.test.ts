import type { AgentSelectionCandidate } from '../../../../src/features/chat/services/AgentMentionCandidateService';
import {
  ChatAgentSelectionCoordinator,
  type ChatAgentSelectionCoordinatorHost,
} from '../../../../src/features/chat/services/ChatAgentSelectionCoordinator';

class ResizeObserverMock {
  static readonly instances: ResizeObserverMock[] = [];

  readonly observe = jest.fn();
  readonly disconnect = jest.fn();

  constructor(_callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }
}

async function settleAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createFixture(candidates: AgentSelectionCandidate[] = [
  {
    id: 'build',
    displayName: 'Build',
    description: 'Builds changes',
    mode: 'primary',
  },
  {
    id: 'planner',
    displayName: 'Planner',
    description: 'Plans and executes',
    mode: 'all',
  },
]) {
  let candidateList = candidates;
  const host: jest.Mocked<ChatAgentSelectionCoordinatorHost> = {
    loadAgentSelectionCandidates: jest.fn(async () => candidateList),
    closePeerDropdowns: jest.fn(),
    restoreInputFocus: jest.fn(),
  };

  const container = document.createElement('div');
  document.body.appendChild(container);

  const coordinator = new ChatAgentSelectionCoordinator(host);
  coordinator.mount(container);

  return {
    container,
    coordinator,
    host,
    setCandidates: (nextCandidates: AgentSelectionCandidate[]) => {
      candidateList = nextCandidates;
    },
  };
}

describe('ChatAgentSelectionCoordinator', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    ResizeObserverMock.instances.length = 0;
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('loads primary-agent candidates, selects one, and restores composer focus', async () => {
    const fixture = createFixture();
    const trigger = fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger');

    expect(trigger?.textContent).toBe('Agent');
    expect(trigger?.querySelector('.opencodian-agent-trigger-chevron')).not.toBeNull();

    trigger?.click();

    expect(fixture.coordinator.isOpen()).toBe(true);
    expect(fixture.host.closePeerDropdowns).toHaveBeenCalledTimes(1);
    expect(
      fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown-state')?.textContent,
    ).toBe('Loading agents...');

    await settleAsyncWork();

    const option = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');
    option?.click();

    expect(fixture.coordinator.getSelectedAgentId()).toBe('build');
    expect(fixture.coordinator.isOpen()).toBe(false);
    expect(trigger?.textContent).toBe('Build');
    expect(trigger?.hasClass('is-selected')).toBe(true);
    expect(fixture.host.restoreInputFocus).toHaveBeenCalledTimes(1);
  });

  it('clamps the agent dropdown to the chat boundary when it opens', () => {
    const boundary = document.createElement('div');
    boundary.className = 'opencodian-container';
    document.body.appendChild(boundary);
    const fixture = createFixture();
    boundary.appendChild(fixture.container);

    jest.spyOn(boundary, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 320, top: 0, bottom: 800, width: 220, height: 800, x: 100, y: 0, toJSON: () => ({}),
    });
    jest.spyOn(fixture.container, 'getBoundingClientRect').mockReturnValue({
      left: 120, right: 180, top: 700, bottom: 730, width: 60, height: 30, x: 120, y: 700, toJSON: () => ({}),
    });

    fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();

    const dropdown = fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown');
    expect(dropdown?.style.left).toBe('-12px');
    expect(dropdown?.style.width).toBe('204px');
    expect(dropdown?.style.minWidth).toBe('204px');
  });

  it('disconnects the previous boundary observer when remounted', () => {
    const boundary = document.createElement('div');
    boundary.className = 'opencodian-container';
    document.body.appendChild(boundary);
    const fixture = createFixture();
    boundary.appendChild(fixture.container);
    fixture.coordinator.mount(fixture.container);
    const firstObserver = ResizeObserverMock.instances[0];

    const nextContainer = document.createElement('div');
    boundary.appendChild(nextContainer);
    fixture.coordinator.mount(nextContainer);

    expect(firstObserver?.disconnect).toHaveBeenCalledTimes(1);
    expect(ResizeObserverMock.instances).toHaveLength(2);
    fixture.coordinator.destroy();
    expect(ResizeObserverMock.instances[1]?.disconnect).toHaveBeenCalledTimes(1);
  });

  it('renders the dropdown as an accessible compact agent list without row detail toggles', async () => {
    const fixture = createFixture();
    const trigger = fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger');

    expect(trigger?.getAttribute('role')).toBe('button');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    trigger?.click();
    await settleAsyncWork();

    const dropdown = fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown');
    const frame = fixture.container.querySelector<HTMLElement>('.opencodian-composer-popover-frame');
    const heading = fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown-heading');
    const defaultOption = fixture.container.querySelector<HTMLElement>('[data-agent-id=""]');
    const buildOption = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');

    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(dropdown?.getAttribute('role')).toBe('listbox');
    expect(fixture.container.querySelectorAll('.opencodian-composer-popover-frame')).toHaveLength(1);
    expect(frame?.querySelector('.opencodian-composer-popover-title')?.textContent).toBe('Choose primary agent');
    expect(frame?.querySelector('kbd')?.textContent).toBe('Esc');
    expect(frame?.querySelector('.opencodian-composer-popover-footer')?.textContent).toContain('Navigate');
    expect(frame?.querySelector('.opencodian-composer-popover-footer')?.textContent).toContain('Select');
    expect(heading?.textContent).toBe('Choose primary agent');
    expect(heading?.getAttribute('role')).toBe('presentation');
    expect(defaultOption?.getAttribute('role')).toBe('option');
    expect(defaultOption?.hasClass('is-default')).toBe(true);
    expect(defaultOption?.getAttribute('aria-selected')).toBe('true');
    expect(defaultOption?.querySelector<HTMLElement>('.opencodian-agent-option-mode.is-default-mode')?.textContent).toBe(
      'Project default',
    );
    expect(defaultOption?.querySelector<HTMLElement>('.opencodian-agent-option-desc')?.textContent).toBe(
      'Let OpenCode choose the project default primary agent.',
    );
    expect(buildOption?.getAttribute('role')).toBe('option');
    expect(buildOption?.hasClass('opencodian-composer-popover-option')).toBe(true);
    expect(buildOption?.getAttribute('aria-selected')).toBe('false');
    expect(buildOption?.querySelector('.opencodian-agent-option-main')).not.toBeNull();
    expect(buildOption?.querySelector('.opencodian-agent-option-meta')).not.toBeNull();
    expect(buildOption?.querySelector('.opencodian-agent-option-detail-toggle')).toBeNull();
    expect(buildOption?.querySelector<HTMLElement>('.opencodian-agent-option-desc')?.textContent).toBe(
      'Builds changes',
    );

    buildOption?.click();

    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]')?.getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('keeps the OpenCode default option selected when choosing the default row', async () => {
    const fixture = createFixture();

    fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    await settleAsyncWork();
    fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]')?.click();
    expect(fixture.coordinator.getSelectedAgentId()).toBe('build');

    fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    fixture.container.querySelector<HTMLElement>('[data-agent-id=""]')?.click();

    expect(fixture.coordinator.getSelectedAgentId()).toBeNull();
    expect(fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.textContent).toBe('Agent');
  });

  it('clears a stale selection when the catalog no longer contains that agent', async () => {
    const fixture = createFixture();

    fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    await settleAsyncWork();
    fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]')?.click();

    fixture.setCandidates([]);
    await fixture.coordinator.reloadCatalog();

    expect(fixture.coordinator.getSelectedAgentId()).toBeNull();
    expect(fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.textContent).toBe('Agent');
  });

  it('keeps agent descriptions inline without transient expanded state', async () => {
    const fixture = createFixture();

    fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    await settleAsyncWork();

    let buildOption = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');
    expect(buildOption?.textContent).toContain('Build');
    expect(buildOption?.textContent).toContain('Builds changes');
    expect(buildOption?.querySelector('.opencodian-agent-option-detail-toggle')).toBeNull();
    expect(buildOption?.querySelector<HTMLElement>('.opencodian-agent-option-desc')?.textContent).toBe('Builds changes');

    fixture.coordinator.closeDropdown();
    fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    buildOption = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');

    expect(buildOption?.hasClass('is-details-open')).toBe(false);
    expect(buildOption?.textContent).toContain('Builds changes');
    expect(buildOption?.querySelector<HTMLElement>('.opencodian-agent-option-desc')?.textContent).toBe('Builds changes');

    fixture.coordinator.destroy();
    const nextContainer = document.createElement('div');
    document.body.appendChild(nextContainer);
    const nextCoordinator = new ChatAgentSelectionCoordinator(fixture.host);
    nextCoordinator.mount(nextContainer);
    nextContainer.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    await settleAsyncWork();

    const nextBuildOption = nextContainer.querySelector<HTMLElement>('[data-agent-id="build"]');
    expect(nextBuildOption?.textContent).toContain('Build');
    expect(nextBuildOption?.textContent).toContain('Builds changes');
    expect(nextBuildOption?.querySelector('.opencodian-agent-option-detail-toggle')).toBeNull();
  });

  describeKeyboardNavigationTests();
});

function describeKeyboardNavigationTests(): void {
  describe('keyboard navigation', () => {
    it('focuses the selected default agent after keyboard opening settles', async () => {
      const fixture = createFixture();
      const trigger = fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger');

      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settleAsyncWork();

      const defaultOption = fixture.container.querySelector<HTMLElement>('[data-agent-id=""]');
      const options = fixture.container.querySelectorAll<HTMLElement>('.opencodian-agent-option');
      expect(document.activeElement).toBe(defaultOption);
      expect(defaultOption?.tabIndex).toBe(0);
      expect(Array.from(options).filter((option) => option.tabIndex === 0)).toHaveLength(1);
    });

    it('wraps roving agent focus in both directions', async () => {
      const fixture = createFixture();
      const trigger = fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger');

      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settleAsyncWork();
      const dropdown = fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown');

      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(fixture.container.querySelector('[data-agent-id="planner"]'));

      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const defaultOption = fixture.container.querySelector<HTMLElement>('[data-agent-id=""]');
      const options = fixture.container.querySelectorAll<HTMLElement>('.opencodian-agent-option');
      expect(document.activeElement).toBe(defaultOption);
      expect(Array.from(options).filter((option) => option.tabIndex === 0)).toHaveLength(1);
    });

    it('selects the focused agent with Enter and restores composer focus once', async () => {
      const fixture = createFixture();
      const trigger = fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger');

      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settleAsyncWork();
      const dropdown = fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown');
      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(fixture.coordinator.getSelectedAgentId()).toBe('build');
      expect(fixture.coordinator.isOpen()).toBe(false);
      expect(fixture.host.restoreInputFocus).toHaveBeenCalledTimes(1);
    });

    it('closes from list Escape and returns focus to the trigger', async () => {
      const fixture = createFixture();
      const trigger = fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger');

      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settleAsyncWork();
      const dropdown = fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown');
      dropdown?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(fixture.coordinator.isOpen()).toBe(false);
      expect(document.activeElement).toBe(trigger);
      expect(
        Array.from(fixture.container.querySelectorAll<HTMLElement>('.opencodian-agent-option'))
          .filter((option) => option.tabIndex === 0),
      ).toHaveLength(0);
    });

    it.each([
      ['empty', async (): Promise<AgentSelectionCandidate[]> => []],
      ['failed', async (): Promise<AgentSelectionCandidate[]> => Promise.reject(new Error('catalog unavailable'))],
    ])('keeps the %s async catalog state open without focusing its state line', async (_name, loadCandidates) => {
      const fixture = createFixture();
      fixture.host.loadAgentSelectionCandidates.mockImplementation(loadCandidates);
      const trigger = fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger');

      trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settleAsyncWork();

      const stateEl = fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown-state');
      expect(fixture.coordinator.isOpen()).toBe(true);
      expect(document.activeElement).not.toBe(stateEl);
      expect(stateEl?.tabIndex).toBe(-1);
      fixture.coordinator.closeDropdown();
      expect(fixture.coordinator.isOpen()).toBe(false);
    });
  });
}
