import { App, Modal } from 'obsidian';

import { t } from '../../i18n';

/**
 * Help content for a single Claude Code setting. Strings are resolved by the
 * caller from existing `settings.claudeCode.{settingKey}.{boundaryNotice|
 * lifecycleNotice}` and `settings.claudeCode.proofStatus.{id}` locale keys,
 * so notice text stays single-sourced instead of being duplicated into a
 * parallel help namespace.
 */
export interface ClaudeCodeHelpContent {
  title: string;
  boundary?: string;
  lifecycle?: string;
  proofNote?: string;
}

const BOUNDARY_LABEL_KEY = 'settings.claudeCode.help.boundaryLabel';
const LIFECYCLE_LABEL_KEY = 'settings.claudeCode.help.lifecycleLabel';
const PROOF_LABEL_KEY = 'settings.claudeCode.help.proofLabel';

/**
 * Help modal for a single Claude Code setting. Reuses the shared
 * `opencodian-help-modal-shell` chrome already styled by config-editor-modal.css.
 */
export class ClaudeCodeHelpModal extends Modal {
  constructor(
    app: App,
    private readonly content: ClaudeCodeHelpContent,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const shellEl = contentEl.createDiv({ cls: 'opencodian-help-modal-shell' });
    shellEl.createEl('h2', { text: this.content.title });

    this.appendSection(shellEl, t(BOUNDARY_LABEL_KEY), this.content.boundary);
    this.appendSection(shellEl, t(LIFECYCLE_LABEL_KEY), this.content.lifecycle);
    this.appendSection(shellEl, t(PROOF_LABEL_KEY), this.content.proofNote);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private appendSection(shellEl: HTMLElement, heading: string, body: string | undefined): void {
    if (!body) {
      return;
    }
    const sectionEl = shellEl.createDiv({ cls: 'opencodian-help-modal-section' });
    sectionEl.createEl('h5', { text: heading });
    const cardEl = sectionEl.createDiv({ cls: 'opencodian-help-modal-card' });
    cardEl.createEl('p', { text: body });
  }
}
