import { setIcon } from 'obsidian';

import { t } from '../../../i18n';

export interface ImagePreviewOverlayOptions {
  src: string;
  alt: string;
}

let activeImagePreviewClose: (() => void) | null = null;

/**
 * Opens a single lightweight, keyboard-dismissable image preview above the
 * chat surface. The overlay deliberately uses the document body so composer
 * and persisted-message thumbnails share one presentation without clipping.
 */
export function openImagePreview(options: ImagePreviewOverlayOptions): void {
  activeImagePreviewClose?.();

  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const backdropEl = document.body.createDiv({
    cls: 'opencodian-image-preview-backdrop',
    attr: { role: 'presentation' },
  });
  const dialogEl = backdropEl.createDiv({
    cls: 'opencodian-image-preview-dialog',
    attr: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': options.alt,
    },
  });
  const closeButton = dialogEl.createEl('button', {
    cls: 'opencodian-image-preview-close',
    attr: {
      type: 'button',
      'aria-label': t('chat.image.closePreview'),
    },
  });
  setIcon(closeButton, 'x');
  dialogEl.createEl('img', {
    cls: 'opencodian-image-preview-image',
    attr: { src: options.src, alt: options.alt },
  });

  const close = (): void => {
    window.removeEventListener('keydown', onKeydown, true);
    backdropEl.remove();
    if (activeImagePreviewClose === close) {
      activeImagePreviewClose = null;
    }
    previouslyFocused?.focus();
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  closeButton.addEventListener('click', close);
  backdropEl.addEventListener('click', (event) => {
    if (event.target === backdropEl) {
      close();
    }
  });
  // Obsidian's global key handling runs on window and can stop Escape before
  // document capture. Register on that same capture target while the preview
  // owns focus, then remove the matching listener on close.
  window.addEventListener('keydown', onKeydown, true);
  activeImagePreviewClose = close;
  closeButton.focus();
}
