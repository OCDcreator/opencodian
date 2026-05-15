import { App, Modal } from 'obsidian';

import { t } from '../../i18n';

export type ForkTarget = 'new-tab' | 'current-tab';

export interface ForkTargetModalOptions {
  allowNewTab?: boolean;
}

export function chooseForkTarget(
  app: App,
  options: ForkTargetModalOptions = {},
): Promise<ForkTarget | null> {
  return new Promise((resolve) => {
    new ForkTargetModal(app, resolve, options).open();
  });
}

export class ForkTargetModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly resolveChoice: (choice: ForkTarget | null) => void,
    private readonly options: ForkTargetModalOptions = {},
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(t('chat.fork.chooseTarget'));

    const listEl = this.contentEl.createDiv({ cls: 'opencodian-fork-target-list' });
    this.createOption(listEl, 'current-tab', t('chat.fork.targetCurrentTab'));
    if (this.options.allowNewTab !== false) {
      this.createOption(listEl, 'new-tab', t('chat.fork.targetNewTab'));
    } else {
      this.contentEl.createDiv({
        cls: 'opencodian-fork-target-note',
        text: t('chat.fork.newTabDisabled'),
      });
    }
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
