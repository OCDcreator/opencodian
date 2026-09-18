/**
 * Confirmation dialog for high-impact Obsidian CLI requests (R-B4).
 *
 * Shown by the coordinator when the gate wrapper files a request. The user
 * sees the exact subcommand + argv that would run; "Allow once" writes an
 * `allow` decision for THAT argv, everything else (Deny, Esc, closing the
 * modal) writes `deny` — fail-closed, the wrapper executes nothing.
 */

import type { App } from 'obsidian';
import { Modal } from 'obsidian';

import type { ObsidianToolingRequest } from '../../core/obsidianTooling';
import { t } from '../../i18n';

export type ObsidianToolingApprovalChoice = 'allow' | 'deny';

export class ObsidianToolingApprovalModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly request: ObsidianToolingRequest,
    private readonly onDecide: (choice: ObsidianToolingApprovalChoice) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl('h3', { text: t('settings.obsidianTooling.confirm.title') });

    const descEl = this.contentEl.createDiv({ cls: 'opencodian-tooling-confirm-desc' });
    descEl.createEl('p', { text: t('settings.obsidianTooling.confirm.desc') });

    const cmdEl = descEl.createDiv({ cls: 'opencodian-tooling-confirm-command' });
    cmdEl.createEl('strong', { text: this.request.subcommand });
    if (this.request.argv.length > 1) {
      cmdEl.createEl('div', {
        cls: 'opencodian-tooling-confirm-argv',
        text: this.request.argv.slice(1).join(' '),
      });
    }

    const buttonsEl = this.contentEl.createDiv({ cls: 'opencodian-tooling-confirm-buttons' });
    const allowBtn = buttonsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.obsidianTooling.confirm.allow'),
    });
    const denyBtn = buttonsEl.createEl('button', {
      text: t('settings.obsidianTooling.confirm.deny'),
    });
    allowBtn.addEventListener('click', () => this.resolve('allow'));
    denyBtn.addEventListener('click', () => this.resolve('deny'));
  }

  onClose(): void {
    // Esc / closing the modal must never leave the wrapper waiting: treat as
    // an explicit deny (fail closed).
    this.resolve('deny');
    this.contentEl.empty();
  }

  private resolve(choice: ObsidianToolingApprovalChoice): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onDecide(choice);
    this.close();
  }
}
