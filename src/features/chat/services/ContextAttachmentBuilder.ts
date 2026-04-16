import type { App, Editor, MarkdownView } from 'obsidian';
import { Notice, TFile } from 'obsidian';

import type {
  PromptContextItem,
  PromptContextKind,
  PromptContextLineRange,
} from '../../../core/types';
import type { ServerMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import {
  formatContextLabel,
  isTextLikeMime,
  resolveContextMimeFromPath,
  resolveTextMimeFromPath,
} from '../../../shared';
import type { FocusContextPreview } from '../composerContext';

export const REMOTE_CONTEXT_TEXT_LIMIT_BYTES = 64 * 1024;

type FileContextKind = Extract<PromptContextKind, 'current_note' | 'file'>;

export interface ContextAttachmentBuilderOptions {
  getServerMode(): ServerMode;
}

export class ContextAttachmentBuilder {
  constructor(
    private readonly app: App,
    private readonly options: ContextAttachmentBuilderOptions,
  ) {}

  async buildCurrentNoteContextItem(view: MarkdownView | null): Promise<PromptContextItem | null> {
    const file = view?.file ?? null;
    if (!file) {
      new Notice(t('chat.context.notice.noActiveNote'));
      return null;
    }

    return this.buildFileContextItem(file, 'current_note');
  }

  async buildSelectionContextItem(
    editor: Editor | null,
    view: MarkdownView | null,
  ): Promise<PromptContextItem | null> {
    const file = view?.file ?? null;
    if (!editor || !file) {
      new Notice(t('chat.context.notice.noActiveNote'));
      return null;
    }

    const selectedText = editor.getSelection();
    if (!selectedText.trim()) {
      new Notice(t('chat.context.notice.noSelection'));
      return null;
    }

    const from = editor.getCursor('from');
    const to = editor.getCursor('to');
    return this.createSelectionContextItem(file.path, {
      startLine: from.line + 1,
      endLine: to.line + 1,
    }, selectedText);
  }

  buildSelectionContextItemFromPreview(preview: FocusContextPreview): PromptContextItem | null {
    if (
      preview.kind !== 'selection'
      || !preview.lineRange
      || !preview.textSnapshot?.trim()
    ) {
      new Notice(t('chat.context.notice.noSelection'));
      return null;
    }

    const targetFile = this.resolveFileByPath(preview.path);
    if (!targetFile) {
      new Notice(t('chat.context.notice.noActiveNote'));
      return null;
    }

    return this.createSelectionContextItem(targetFile.path, preview.lineRange, preview.textSnapshot);
  }

  async buildFileContextItem(
    file: TFile,
    kind: FileContextKind,
  ): Promise<PromptContextItem | null> {
    const mime = resolveContextMimeFromPath(file.path);
    if (this.isRemoteContextMode() && !isTextLikeMime(mime)) {
      new Notice(t('chat.context.notice.binaryUnsupportedRemote'));
      return null;
    }

    let textSnapshot: string | undefined;
    if (this.isRemoteContextMode()) {
      const fileText = await this.app.vault.read(file);
      const validatedText = this.validateRemoteContextText(fileText, file.path);
      if (validatedText === null) {
        return null;
      }
      textSnapshot = validatedText;
    }

    return {
      id: this.createPromptContextId(),
      kind,
      path: file.path,
      label: formatContextLabel(file.path),
      mime,
      textSnapshot,
    };
  }

  async buildFileContextItemFromPath(
    path: string,
    kind: FileContextKind,
  ): Promise<PromptContextItem | null> {
    const file = this.resolveFileByPath(path);
    if (!file) {
      new Notice(t('chat.context.notice.noActiveNote'));
      return null;
    }

    return this.buildFileContextItem(file, kind);
  }

  hasFileAtPath(path: string): boolean {
    return this.resolveFileByPath(path) !== null;
  }

  private createSelectionContextItem(
    path: string,
    lineRange: PromptContextLineRange,
    selectedText: string,
  ): PromptContextItem | null {
    const mime = resolveTextMimeFromPath(path);
    if (!isTextLikeMime(mime)) {
      new Notice(t('chat.context.notice.binaryUnsupported'));
      return null;
    }

    const textSnapshot = this.validateRemoteContextText(selectedText, path);
    if (this.isRemoteContextMode() && textSnapshot === null) {
      return null;
    }

    return {
      id: this.createPromptContextId(),
      kind: 'selection',
      path,
      label: formatContextLabel(path, lineRange),
      mime,
      lineRange,
      textSnapshot: textSnapshot ?? undefined,
    };
  }

  private resolveFileByPath(path: string): TFile | null {
    const targetFile = this.app.vault.getAbstractFileByPath(path);
    return targetFile instanceof TFile ? targetFile : null;
  }

  private isRemoteContextMode(): boolean {
    return this.options.getServerMode() === 'remote';
  }

  private validateRemoteContextText(text: string, label: string): string | null {
    if (!this.isRemoteContextMode()) {
      return text;
    }

    const byteLength = new TextEncoder().encode(text).length;
    if (byteLength > REMOTE_CONTEXT_TEXT_LIMIT_BYTES) {
      new Notice(t('chat.context.notice.tooLarge', { label }));
      return null;
    }

    return text;
  }

  private createPromptContextId(): string {
    return `context-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
