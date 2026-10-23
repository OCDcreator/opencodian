export type CapabilityLabBackendId = string;

export type CapabilityLabBackendState = 'available' | 'empty' | 'unconfigured' | 'unknown';

interface CapabilityLabBackendWorkspaceOptions {
  readonly containerEl: HTMLElement;
  readonly backend: CapabilityLabBackendId;
  readonly sectionBlock: string;
  readonly title: string;
  readonly description: string;
  readonly state: CapabilityLabBackendState;
  readonly stateLabel: string;
}

export interface CapabilityLabBackendWorkspace {
  readonly rootEl: HTMLElement;
  readonly contentEl: HTMLElement;
}

export function createCapabilityLabBackendWorkspace(
  options: CapabilityLabBackendWorkspaceOptions,
): CapabilityLabBackendWorkspace {
  const backendIdFragment = options.backend
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'backend';
  const titleId = `opencodian-capability-lab-${backendIdFragment}-title`;
  const rootEl = options.containerEl.createEl('section', {
    cls: 'opencodian-capability-lab-backend-workspace',
    attr: {
      'aria-labelledby': titleId,
      'data-capability-backend': options.backend,
      'data-backend-state': options.state,
      'data-section-block': options.sectionBlock,
    },
  });
  const headerEl = rootEl.createDiv({ cls: 'opencodian-capability-lab-backend-header' });
  const copyEl = headerEl.createDiv({ cls: 'opencodian-capability-lab-backend-copy' });
  copyEl.createEl('h4', {
    text: options.title,
    attr: { id: titleId },
  });
  copyEl.createEl('p', {
    cls: 'opencodian-capability-lab-description',
    text: options.description,
  });
  headerEl.createSpan({
    cls: 'opencodian-capability-lab-backend-status',
    text: options.stateLabel,
    attr: { 'data-backend-status': options.state },
  });

  return {
    rootEl,
    contentEl: rootEl.createDiv({ cls: 'opencodian-capability-lab-backend-content' }),
  };
}

export function updateCapabilityLabBackendState(
  workspaceEl: HTMLElement,
  state: CapabilityLabBackendState,
  stateLabel: string,
): void {
  workspaceEl.dataset.backendState = state;
  const statusEl = workspaceEl.querySelector<HTMLElement>('[data-backend-status]');
  if (!statusEl) return;
  statusEl.dataset.backendStatus = state;
  statusEl.setText(stateLabel);
}
