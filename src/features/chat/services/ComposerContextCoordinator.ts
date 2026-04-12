import type { PromptContextItem } from '../../../core/types';
import {
  buildComposerContextChipStates,
  getContextTargetKey,
  type ComposerContextChipState,
  type FocusContextPreview,
} from '../composerContext';
import type { ContextAttachmentBuilder } from './ContextAttachmentBuilder';

type ComposerContextAttachmentBuilderPort = Pick<
  ContextAttachmentBuilder,
  'buildFileContextItemFromPath' | 'buildSelectionContextItemFromPreview' | 'hasFileAtPath'
>;

export interface ComposerContextCoordinatorHost {
  getDraftContextItems(): PromptContextItem[];
  getFocusContextPreview(): FocusContextPreview | null;
  addDraftContextItem(item: PromptContextItem): void;
  removeDraftContextItemsForTarget(target: Pick<PromptContextItem, 'path' | 'lineRange'>): void;
  refreshActiveFocusContextPreview(): void;
}

export class ComposerContextCoordinator {
  private contextRowEl: HTMLElement | null = null;

  constructor(
    private readonly contextAttachmentBuilder: ComposerContextAttachmentBuilderPort,
    private readonly host: ComposerContextCoordinatorHost,
  ) {}

  setContextRowElement(contextRowEl: HTMLElement | null): void {
    this.contextRowEl = contextRowEl;
    this.render();
  }

  render(): void {
    if (!this.contextRowEl) {
      return;
    }

    const chipStates = buildComposerContextChipStates(
      this.host.getDraftContextItems(),
      this.host.getFocusContextPreview(),
    );

    this.contextRowEl.replaceChildren();
    this.contextRowEl.classList.toggle('is-empty', chipStates.length === 0);
    if (chipStates.length === 0) {
      return;
    }

    for (const chipState of chipStates) {
      const chipEl = document.createElement('button');
      chipEl.className = 'opencodian-composer-context-chip';
      chipEl.type = 'button';
      chipEl.textContent = chipState.label;
      chipEl.title = chipState.path;
      chipEl.setAttribute('aria-pressed', String(chipState.attached));

      chipEl.classList.toggle('is-preview', chipState.preview);
      chipEl.classList.toggle('is-attached', !chipState.preview);
      chipEl.classList.toggle('is-selection', Boolean(chipState.lineRange));
      chipEl.addEventListener('click', () => {
        void this.handleChipClick(chipState);
      });

      this.contextRowEl.appendChild(chipEl);
    }
  }

  private async handleChipClick(chipState: ComposerContextChipState): Promise<void> {
    if (chipState.attached) {
      this.host.removeDraftContextItemsForTarget(chipState);
      return;
    }

    const focusPreview = this.host.getFocusContextPreview();
    if (!focusPreview) {
      return;
    }

    if (getContextTargetKey(focusPreview.path, focusPreview.lineRange) !== chipState.key) {
      this.host.refreshActiveFocusContextPreview();
      return;
    }

    await this.attachFocusContextPreview(focusPreview);
  }

  private async attachFocusContextPreview(preview: FocusContextPreview): Promise<void> {
    if (preview.kind === 'selection') {
      const contextItem = this.contextAttachmentBuilder.buildSelectionContextItemFromPreview(preview);
      if (contextItem) {
        this.host.addDraftContextItem(contextItem);
      }
      return;
    }

    const contextItem = await this.contextAttachmentBuilder.buildFileContextItemFromPath(
      preview.path,
      'current_note',
    );
    if (contextItem) {
      this.host.addDraftContextItem(contextItem);
      return;
    }

    if (!this.contextAttachmentBuilder.hasFileAtPath(preview.path)) {
      this.host.refreshActiveFocusContextPreview();
    }
  }
}
