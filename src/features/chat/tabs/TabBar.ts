import { setIcon } from 'obsidian';

import { t } from '../../../i18n';
import type { TabBarItem, TabId } from './types';

export interface TabBarCallbacks {
  onTabClick: (tabId: TabId) => void;
  onTabClose: (tabId: TabId) => void;
}

export class TabBar {
  constructor(
    private readonly containerEl: HTMLElement,
    private readonly callbacks: TabBarCallbacks,
  ) {
    this.containerEl.addClass('opencodian-tab-bar');
  }

  render(items: TabBarItem[]): void {
    this.containerEl.empty();

    for (const item of items) {
      const tabEl = this.containerEl.createEl('button', {
        cls: 'opencodian-tab-bar-item',
        attr: {
          type: 'button',
          'aria-label': item.title,
          title: `${item.title}${item.canClose ? ` · ${t('chat.tab.close')}` : ''}`,
        },
      });

      if (item.isActive) {
        tabEl.addClass('is-active');
      }
      if (item.isStreaming) {
        tabEl.addClass('is-streaming');
      }
      if (item.needsAttention) {
        tabEl.addClass('needs-attention');
      }

      const badgeEl = tabEl.createSpan({ cls: 'opencodian-tab-bar-badge', text: String(item.index) });
      badgeEl.setAttribute('aria-hidden', 'true');

      tabEl.createSpan({
        cls: 'opencodian-tab-bar-title',
        text: item.title,
      });

      const stateEl = tabEl.createSpan({ cls: 'opencodian-tab-bar-state' });
      if (item.isStreaming) {
        setIcon(stateEl, 'loader-circle');
      } else if (item.needsAttention) {
        setIcon(stateEl, 'bell-ring');
      }

      tabEl.addEventListener('click', () => {
        this.callbacks.onTabClick(item.id);
      });

      if (item.canClose) {
        tabEl.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this.callbacks.onTabClose(item.id);
        });
      }
    }

  }

  destroy(): void {
    this.containerEl.empty();
    this.containerEl.removeClass('opencodian-tab-bar');
  }
}
