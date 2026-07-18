export interface ComposerPopoverFrameTexts {
  title: string;
  escapeKey: string;
  navigateHint: string;
  selectHint: string;
}

export interface ComposerPopoverFrameHandle {
  contentEl: HTMLElement;
  refresh(texts: ComposerPopoverFrameTexts): void;
}

export function mountComposerPopoverFrame(
  dropdownEl: HTMLElement,
  texts: ComposerPopoverFrameTexts,
): ComposerPopoverFrameHandle {
  const frameEl = dropdownEl.createDiv({ cls: 'opencodian-composer-popover-frame' });
  const headerEl = frameEl.createDiv({ cls: 'opencodian-composer-popover-header' });
  const titleEl = headerEl.createSpan({ cls: 'opencodian-composer-popover-title' });
  const escapeKeyEl = headerEl.createEl('kbd', { cls: 'opencodian-composer-popover-escape-key' });
  const contentEl = frameEl.createDiv({ cls: 'opencodian-composer-popover-content' });
  const footerEl = frameEl.createDiv({ cls: 'opencodian-composer-popover-footer' });
  const navigateEl = footerEl.createSpan({ cls: 'opencodian-composer-popover-footer-navigate' });
  const selectEl = footerEl.createSpan({ cls: 'opencodian-composer-popover-footer-select' });

  const refresh = (nextTexts: ComposerPopoverFrameTexts): void => {
    titleEl.textContent = nextTexts.title;
    escapeKeyEl.textContent = nextTexts.escapeKey;
    navigateEl.textContent = nextTexts.navigateHint;
    selectEl.textContent = nextTexts.selectHint;
  };

  refresh(texts);

  return { contentEl, refresh };
}
