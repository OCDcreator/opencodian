import type { AgentSelectionCandidate } from '../../../../src/features/chat/services/AgentMentionCandidateService';
import {
  ChatAgentSelectionCoordinator,
  type ChatAgentSelectionCoordinatorHost,
} from '../../../../src/features/chat/services/ChatAgentSelectionCoordinator';

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
  afterEach(() => {
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

  it('renders the dropdown as an accessible compact agent list without row detail toggles', async () => {
    const fixture = createFixture();
    const trigger = fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger');

    expect(trigger?.getAttribute('role')).toBe('button');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    trigger?.click();
    await settleAsyncWork();

    const dropdown = fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown');
    const heading = fixture.container.querySelector<HTMLElement>('.opencodian-agent-dropdown-heading');
    const defaultOption = fixture.container.querySelector<HTMLElement>('[data-agent-id=""]');
    const buildOption = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');

    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(dropdown?.getAttribute('role')).toBe('listbox');
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
});
