import { createCapabilityLabBackendWorkspace } from '../../../../src/features/settings/capabilityLabBackendWorkspace';

describe('createCapabilityLabBackendWorkspace', () => {
  it('accepts a future descriptor id and keeps raw identity out of generated DOM ids', () => {
    const containerEl = document.body.createDiv();

    const workspace = createCapabilityLabBackendWorkspace({
      containerEl,
      backend: 'copilot/preview',
      sectionBlock: 'backend-copilot',
      title: 'Copilot capabilities',
      description: 'Future backend evidence.',
      state: 'available',
      stateLabel: 'Available',
    });

    expect(workspace.rootEl.dataset.capabilityBackend).toBe('copilot/preview');
    expect(workspace.rootEl.getAttribute('aria-labelledby')).toBe('opencodian-capability-lab-copilot-preview-title');
    expect(document.getElementById('opencodian-capability-lab-copilot-preview-title')).not.toBeNull();
  });
});
