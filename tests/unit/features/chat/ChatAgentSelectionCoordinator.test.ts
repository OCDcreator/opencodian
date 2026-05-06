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

  it('keeps agent descriptions collapsed unless the transient detail toggle is opened', async () => {
    const fixture = createFixture();

    fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    await settleAsyncWork();

    let buildOption = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');
    expect(buildOption?.textContent).toContain('Build');
    expect(buildOption?.textContent).not.toContain('Builds changes');
    expect(buildOption?.querySelector('.opencodian-agent-option-desc')).toBeNull();

    buildOption?.querySelector<HTMLElement>('.opencodian-agent-option-detail-toggle')?.click();
    buildOption = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');

    expect(buildOption?.hasClass('is-details-open')).toBe(true);
    expect(buildOption?.querySelector<HTMLElement>('.opencodian-agent-option-desc')?.textContent).toBe('Builds changes');

    fixture.coordinator.closeDropdown();
    fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    buildOption = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');

    expect(buildOption?.hasClass('is-details-open')).toBe(false);
    expect(buildOption?.textContent).not.toContain('Builds changes');
    expect(buildOption?.querySelector('.opencodian-agent-option-desc')).toBeNull();

    buildOption?.querySelector<HTMLElement>('.opencodian-agent-option-detail-toggle')?.click();
    buildOption = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');

    expect(buildOption?.hasClass('is-details-open')).toBe(true);
    expect(buildOption?.querySelector<HTMLElement>('.opencodian-agent-option-desc')?.textContent).toBe('Builds changes');

    buildOption?.querySelector<HTMLElement>('.opencodian-agent-option-detail-toggle')?.click();
    buildOption = fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]');

    expect(buildOption?.hasClass('is-details-open')).toBe(false);
    expect(buildOption?.querySelector('.opencodian-agent-option-desc')).toBeNull();

    fixture.coordinator.destroy();
    const nextContainer = document.createElement('div');
    document.body.appendChild(nextContainer);
    const nextCoordinator = new ChatAgentSelectionCoordinator(fixture.host);
    nextCoordinator.mount(nextContainer);
    nextContainer.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    await settleAsyncWork();

    const nextBuildOption = nextContainer.querySelector<HTMLElement>('[data-agent-id="build"]');
    expect(nextBuildOption?.textContent).toContain('Build');
    expect(nextBuildOption?.textContent).not.toContain('Builds changes');
    expect(nextBuildOption?.querySelector('.opencodian-agent-option-desc')).toBeNull();
  });
});
