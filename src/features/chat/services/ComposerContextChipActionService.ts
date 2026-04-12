import type { PromptContextItem } from '../../../core/types';
import {
  getContextTargetKey,
  type ComposerContextChipState,
  type FocusContextPreview,
} from '../composerContext';
import type { ContextAttachmentBuilder } from './ContextAttachmentBuilder';

type ComposerContextChipActionAttachmentBuilderPort = Pick<
  ContextAttachmentBuilder,
  'buildFileContextItemFromPath' | 'buildSelectionContextItemFromPreview' | 'hasFileAtPath'
>;

export interface ComposerContextChipActionServiceHost {
  getFocusContextPreview(): FocusContextPreview | null;
  addDraftContextItem(item: PromptContextItem): void;
  removeDraftContextItemsForTarget(target: Pick<PromptContextItem, 'path' | 'lineRange'>): void;
  refreshActiveFocusContextPreview(): void;
}

export class ComposerContextChipActionService {
  constructor(
    private readonly contextAttachmentBuilder: ComposerContextChipActionAttachmentBuilderPort,
    private readonly host: ComposerContextChipActionServiceHost,
  ) {}

  async handleChipClick(chipState: ComposerContextChipState): Promise<void> {
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
