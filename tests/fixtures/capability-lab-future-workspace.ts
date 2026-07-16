import { createCapabilityLabBackendTabs } from '../../src/features/settings/capabilityLabBackendTabs';
import { createCapabilityLabBackendWorkspace } from '../../src/features/settings/capabilityLabBackendWorkspace';

declare const containerEl: HTMLElement;

createCapabilityLabBackendTabs({
  containerEl,
  persistedId: 'copilot',
  descriptors: [{
    id: 'copilot',
    label: 'Copilot',
    getState: () => ({ state: 'available', label: 'Available' }),
    render: (panelEl) => {
      createCapabilityLabBackendWorkspace({
        containerEl: panelEl,
        backend: 'copilot',
        sectionBlock: 'backend-copilot',
        title: 'Copilot capabilities',
        description: 'Future backend evidence.',
        state: 'available',
        stateLabel: 'Available',
      });
    },
  }],
  activeBackend: 'opencode',
  tablistLabel: 'Capability Lab backends',
  panelLoadError: 'Panel failed.',
});
