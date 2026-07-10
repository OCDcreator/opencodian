import { Modal } from 'obsidian';

import type {
  OpenCodeExperimentalActionRequest,
  OpenCodeExperimentalActionResult,
} from '../../../core/opencode/OpenCodeSdkExperimentalActionCoordinator';
import { t } from '../../../i18n';

type ExperimentalActionId = OpenCodeExperimentalActionRequest['action'];

interface OpenCodeExperimentalActionModalOptions {
  readonly sessionId: string;
  readonly defaultDirectory: string;
  readonly projectId?: string | null;
  readonly availableActions: ReadonlySet<string>;
  readonly runAction: (request: OpenCodeExperimentalActionRequest) => Promise<OpenCodeExperimentalActionResult>;
  readonly onBackgroundActionCompleted?: () => void;
}

export class OpenCodeExperimentalActionModal extends Modal {
  private statusEl: HTMLElement | null = null;
  private activePtyId: string | null = null;
  private isOpen = false;

  constructor(app: ConstructorParameters<typeof Modal>[0], private readonly options: OpenCodeExperimentalActionModalOptions) {
    super(app);
  }

  onOpen(): void {
    this.isOpen = true;
    this.modalEl.addClass('opencodian-experimental-action-modal');
    this.contentEl.empty();
    this.titleEl.setText(t('chat.experimentalActions.title'));
    this.contentEl.createDiv({
      cls: 'opencodian-experimental-action-notice',
      text: t('chat.experimentalActions.notice'),
    });
    this.statusEl = this.contentEl.createDiv({
      cls: 'opencodian-experimental-action-status',
      attr: { 'data-experimental-status': 'idle' },
    });

    this.renderPtyAction();
    this.renderBackgroundAction();
    this.renderControlPlaneAction();
    this.renderProjectCopyAction();
  }

  onClose(): void {
    this.isOpen = false;
    const ptyId = this.activePtyId;
    if (ptyId) {
      void this.removeCreatedPty(ptyId);
    }
    this.contentEl.empty();
    this.statusEl = null;
    this.activePtyId = null;
    this.modalEl.removeClass('opencodian-experimental-action-modal');
  }

  private renderPtyAction(): void {
    if (!this.options.availableActions.has('pty.create')) {
      return;
    }

    const sectionEl = this.createSection('pty.create', 'chat.experimentalActions.pty.title', 'chat.experimentalActions.pty.desc');
    sectionEl.createDiv({
      cls: 'opencodian-experimental-action-scope',
      text: t('chat.experimentalActions.pty.scope', { directory: this.options.defaultDirectory }),
      attr: { 'data-experimental-scope': 'pty' },
    });
    const commandInput = sectionEl.createEl('input', {
      cls: 'opencodian-experimental-action-input',
      attr: {
        type: 'text',
        placeholder: t('chat.experimentalActions.pty.placeholder'),
        'data-experimental-input': 'pty-command',
      },
    });
    const buttonEl = this.createActionButton(sectionEl, 'pty.create', 'chat.experimentalActions.pty.run');
    buttonEl.addEventListener('click', () => {
      const command = commandInput.value.trim();
      if (!command) {
        this.setStatus('invalid');
        return;
      }
      void this.runAction(buttonEl, {
        action: 'pty.create',
        capabilityId: 'v2.pty.create',
        confirmation: {
          confirmed: true,
          scope: this.options.defaultDirectory,
          target: command,
          cleanup: 'remove-created-pty',
        },
        input: { command, cwd: this.options.defaultDirectory },
      });
    });
    this.renderPtyRemoveAction(sectionEl);
  }

  private renderPtyRemoveAction(containerEl: HTMLElement): void {
    const existing = containerEl.querySelector('[data-action="pty.remove"]');
    existing?.remove();
    if (!this.activePtyId) {
      return;
    }
    const buttonEl = this.createActionButton(containerEl, 'pty.remove', 'chat.experimentalActions.pty.remove');
    buttonEl.addEventListener('click', () => {
      void this.runAction(buttonEl, {
        action: 'pty.remove',
        capabilityId: 'v2.pty.create',
        confirmation: {
          confirmed: true,
          scope: this.options.defaultDirectory,
          target: this.activePtyId ?? '',
          cleanup: 'not-required',
        },
        input: { ptyID: this.activePtyId },
      });
    });
  }

  private renderBackgroundAction(): void {
    if (!this.options.availableActions.has('session.background')) {
      return;
    }

    const sectionEl = this.createSection('session.background', 'chat.experimentalActions.background.title', 'chat.experimentalActions.background.desc');
    const buttonEl = this.createActionButton(sectionEl, 'session.background', 'chat.experimentalActions.background.run');
    buttonEl.addEventListener('click', () => {
      void this.runAction(buttonEl, {
        action: 'session.background',
        capabilityId: 'experimental.session.background',
        confirmation: {
          confirmed: true,
          scope: this.options.defaultDirectory,
          target: this.options.sessionId,
          cleanup: 'not-required',
        },
        input: { sessionID: this.options.sessionId, directory: this.options.defaultDirectory },
      });
    });
  }

  private renderControlPlaneAction(): void {
    if (!this.options.availableActions.has('control-plane.move-session')) {
      return;
    }

    const sectionEl = this.createSection('control-plane.move-session', 'chat.experimentalActions.controlPlane.title', 'chat.experimentalActions.controlPlane.desc');
    const destinationInput = sectionEl.createEl('input', {
      cls: 'opencodian-experimental-action-input',
      attr: {
        type: 'text',
        placeholder: t('chat.experimentalActions.controlPlane.placeholder'),
        'data-experimental-input': 'control-plane-destination',
      },
    });
    const buttonEl = this.createActionButton(sectionEl, 'control-plane.move-session', 'chat.experimentalActions.controlPlane.run');
    buttonEl.addEventListener('click', () => {
      const destination = destinationInput.value.trim();
      if (!destination) {
        this.setStatus('invalid');
        return;
      }
      void this.runAction(buttonEl, {
        action: 'control-plane.move-session',
        capabilityId: 'experimental.controlPlane.moveSession',
        confirmation: {
          confirmed: true,
          scope: this.options.defaultDirectory,
          target: destination,
          cleanup: 'not-required',
        },
        input: {
          sessionID: this.options.sessionId,
          destination: { directory: destination },
          moveChanges: false,
        },
      });
    });
  }

  private renderProjectCopyAction(): void {
    if (!this.options.availableActions.has('project-copy.create') || !this.options.projectId) {
      return;
    }

    const sectionEl = this.createSection(
      'project-copy.create',
      'chat.experimentalActions.projectCopy.title',
      'chat.experimentalActions.projectCopy.desc',
    );
    const previewEl = sectionEl.createDiv({
      cls: 'opencodian-experimental-action-preview',
      attr: { 'data-experimental-preview': 'project-copy' },
    });
    const directoryInput = sectionEl.createEl('input', {
      cls: 'opencodian-experimental-action-input',
      attr: {
        type: 'text',
        placeholder: t('chat.experimentalActions.projectCopy.directoryPlaceholder'),
        'data-experimental-input': 'project-copy-directory',
      },
    });
    const nameInput = sectionEl.createEl('input', {
      cls: 'opencodian-experimental-action-input',
      attr: {
        type: 'text',
        placeholder: t('chat.experimentalActions.projectCopy.namePlaceholder'),
        'data-experimental-input': 'project-copy-name',
      },
    });
    const projectIdInput = sectionEl.createEl('input', {
      attr: {
        type: 'hidden',
        value: this.options.projectId,
        'data-experimental-input': 'project-copy-project-id',
      },
    });
    const updatePreview = () => {
      const directory = directoryInput.value.trim();
      const name = nameInput.value.trim();
      previewEl.setText(t('chat.experimentalActions.projectCopy.preview', {
        source: this.options.defaultDirectory,
        target: directory && name ? `${directory}/${name}` : t('chat.experimentalActions.projectCopy.pendingTarget'),
      }));
    };
    directoryInput.addEventListener('input', updatePreview);
    nameInput.addEventListener('input', updatePreview);
    updatePreview();

    const buttonEl = this.createActionButton(
      sectionEl,
      'project-copy.create',
      'chat.experimentalActions.projectCopy.run',
    );
    buttonEl.addEventListener('click', () => {
      const projectID = projectIdInput.value.trim();
      const directory = directoryInput.value.trim();
      const name = nameInput.value.trim();
      if (!projectID || !directory || !name) {
        this.setStatus('invalid');
        return;
      }
      void this.runAction(buttonEl, {
        action: 'project-copy.create',
        capabilityId: 'v2.projectCopy.create',
        confirmation: {
          confirmed: true,
          scope: this.options.defaultDirectory,
          target: `${directory}/${name}`,
          cleanup: 'not-required',
        },
        input: {
          projectID,
          location: { directory: this.options.defaultDirectory },
          strategy: 'git_worktree',
          directory,
          name,
        },
      });
    });
  }

  private createSection(action: ExperimentalActionId, titleKey: Parameters<typeof t>[0], descriptionKey: Parameters<typeof t>[0]): HTMLElement {
    const sectionEl = this.contentEl.createDiv({
      cls: 'opencodian-experimental-action-section',
      attr: { 'data-experimental-action': action },
    });
    sectionEl.createEl('h3', { text: t(titleKey) });
    sectionEl.createDiv({
      cls: 'opencodian-experimental-action-description',
      text: t(descriptionKey),
    });
    return sectionEl;
  }

  private createActionButton(
    containerEl: HTMLElement,
    action: ExperimentalActionId,
    labelKey: Parameters<typeof t>[0],
  ): HTMLButtonElement {
    return containerEl.createEl('button', {
      cls: 'mod-cta opencodian-experimental-action-run',
      text: t(labelKey),
      attr: { type: 'button', 'data-action': action },
    });
  }

  private async runAction(buttonEl: HTMLButtonElement, request: OpenCodeExperimentalActionRequest): Promise<void> {
    if (!window.confirm(t('chat.experimentalActions.confirm', { target: request.confirmation?.target ?? '' }))) {
      this.setStatus('cancelled');
      return;
    }

    buttonEl.disabled = true;
    try {
      const result = await this.options.runAction(request);
      if (request.action === 'pty.create' && result.kind === 'completed' && result.ptyId) {
        if (!this.isOpen) {
          void this.removeCreatedPty(result.ptyId);
          return;
        }
        this.activePtyId = result.ptyId;
        const ptySection = this.contentEl.querySelector<HTMLElement>('[data-experimental-action="pty.create"]');
        if (ptySection) {
          this.renderPtyRemoveAction(ptySection);
        }
      }
      if (request.action === 'pty.remove' && result.kind === 'completed') {
        this.activePtyId = null;
        const ptySection = this.contentEl.querySelector<HTMLElement>('[data-experimental-action="pty.create"]');
        if (ptySection) {
          this.renderPtyRemoveAction(ptySection);
        }
        const createButton = this.contentEl.querySelector<HTMLButtonElement>('[data-action="pty.create"]');
        if (createButton) {
          createButton.disabled = false;
        }
      }
      if (request.action === 'session.background' && result.kind === 'completed') {
        this.options.onBackgroundActionCompleted?.();
      }
      this.setStatus(result.kind);
    } finally {
      buttonEl.disabled = request.action === 'pty.create' && this.activePtyId !== null;
    }
  }

  private async removeCreatedPty(ptyId: string): Promise<void> {
    await this.options.runAction({
      action: 'pty.remove',
      capabilityId: 'v2.pty.create',
      confirmation: {
        confirmed: true,
        scope: this.options.defaultDirectory,
        target: ptyId,
        cleanup: 'not-required',
      },
      input: { ptyID: ptyId },
    });
  }

  private setStatus(status: 'completed' | 'cancelled' | 'unsupported' | 'failed' | 'invalid'): void {
    if (!this.statusEl) {
      return;
    }
    this.statusEl.setText(t(`chat.experimentalActions.status.${status}`));
    this.statusEl.dataset.experimentalStatus = status;
  }
}
