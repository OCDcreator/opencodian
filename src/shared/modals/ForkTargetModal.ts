import { App, Modal } from 'obsidian';

import { t } from '../../i18n';

export type ForkTarget = 'new-tab' | 'current-tab';

export function chooseForkTarget(app: App): Promise<ForkTarget | null> {
  return new Promise((resolve) => {
    new ForkTargetModal(app, resolve).open();
  });
}

class ForkTargetModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly resolveChoice: (choice: ForkTarget | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(t('chat.fork.chooseTarget'));

    const listEl = this.contentEl.createDiv({ cls: 'opencodian-fork-target-list' });
    this.createOption(listEl, 'current-tab', t('chat.fork.targetCurrentTab'));
    this.createOption(listEl, 'new-tab', t('chat.fork.targetNewTab'));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolveChoice(null);
    }
  }

  private createOption(containerEl: HTMLElement, target: ForkTarget, label: string): void {
    const optionEl = containerEl.createDiv({
      cls: 'opencodian-fork-target-option',
      text: label,
    });

    optionEl.addEventListener('click', () => {
      this.resolved = true;
      this.resolveChoice(target);
      this.close();
    });
  }
}
