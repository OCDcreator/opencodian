import type { App, Editor, MarkdownView } from 'obsidian';
import { normalizePath, Notice, TFile, TFolder } from 'obsidian';

import type { PdfTextEngine } from '../../../core/pdf';
import {
  assessTextLayer,
  checkAttachLimits,
  isPasswordFailure,
  PDF_ATTACH_MAX_PAGES,
  PdfEngineError,
} from '../../../core/pdf';
import type {
  PdfContextMeta,
  PromptContextItem,
  PromptContextKind,
  PromptContextLineRange,
} from '../../../core/types';
import type { ServerMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import {
  buildPdfSelectionRange,
  createLogger,
  formatContextLabel,
  isTextLikeMime,
  resolveContextMimeFromPath,
  resolveTextMimeFromPath,
} from '../../../shared';
import type { FocusContextPreview } from '../composerContext';

const logger = createLogger('ContextAttachmentBuilder');

export const REMOTE_CONTEXT_TEXT_LIMIT_BYTES = 64 * 1024;

type FileContextKind = Extract<PromptContextKind, 'current_note' | 'file'>;

export interface ContextAttachmentBuilderOptions {
  getServerMode(): ServerMode;
  /**
   * R-C4: lazily resolved PDF engine port. Absent when the plugin could not
   * compose one — PDF attach then fails closed with the honest notice.
   */
  loadPdfEngine?: () => Promise<PdfTextEngine>;
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

  /**
   * Build one context item from a picker/drop entry (R-A7): files keep the
   * existing file path, folders become path-only directory references that
   * never carry a text snapshot. R-C4: PDF files route to the extraction
   * path so a picker attach carries the real text layer.
   */
  async buildEntryContextItem(entry: TFile | TFolder): Promise<PromptContextItem | null> {
    if (entry instanceof TFolder) {
      return this.buildFolderContextItem(entry);
    }
    if (entry.extension.toLowerCase() === 'pdf') {
      return this.buildPdfDocumentContextItem(entry);
    }
    return this.buildFileContextItem(entry, 'file');
  }

  /**
   * Directory context item (R-A7): the path is the reference — the model
   * reads the notes under it with its tools. No text snapshot is ever taken,
   * so the remote-mode size/binary checks do not apply.
   */
  buildFolderContextItem(folder: TFolder): PromptContextItem | null {
    return {
      id: this.createPromptContextId(),
      kind: 'folder',
      path: folder.path,
      label: formatContextLabel(folder.path),
      mime: 'application/x-directory',
    };
  }

  /**
   * PDF document context item (R-C4 phase 1): extracts the text layer via
   * the lazily loaded engine and carries it on the structured `pdfPages`
   * field — `textSnapshot` stays note-text-only. Fail-closed throughout
   * (design §4): an encrypted, unreadable, textless or over-limit PDF is
   * refused with an actionable notice and produces no item.
   */
  async buildPdfDocumentContextItem(file: TFile): Promise<PromptContextItem | null> {
    if (!this.options.loadPdfEngine) {
      new Notice(t('chat.context.notice.pdfEngineUnavailable'));
      return null;
    }
    let binary: ArrayBuffer;
    try {
      binary = await this.app.vault.readBinary(file);
    } catch (error) {
      new Notice(t('chat.context.notice.pdfUnreadable', { label: file.path }));
      logger.debug('pdf readBinary failed', { path: file.path, error });
      return null;
    }

    let engine: PdfTextEngine;
    try {
      engine = await this.options.loadPdfEngine();
    } catch (error) {
      new Notice(error instanceof PdfEngineError
        ? t('chat.context.notice.pdfEngineUnavailable')
        : t('chat.context.notice.pdfUnreadable', { label: file.path }));
      logger.debug('pdf engine load failed', { path: file.path, error });
      return null;
    }

    let extracted: Awaited<ReturnType<PdfTextEngine['extractPages']>>;
    try {
      extracted = await engine.extractPages(binary, { maxPages: PDF_ATTACH_MAX_PAGES + 1 });
    } catch (error) {
      new Notice(isPasswordFailure(error)
        ? t('chat.context.notice.pdfEncrypted', { label: file.path })
        : t('chat.context.notice.pdfUnreadable', { label: file.path }));
      logger.debug('pdf extraction failed', { path: file.path, error });
      return null;
    }

    const assessment = assessTextLayer(extracted.pages.map((page) => page.text));
    if (!assessment.textLayerPresent) {
      // Scanned PDF: no text layer exists; OCR is out of scope (design §1.2).
      new Notice(t('chat.context.notice.pdfNoTextLayer', { label: file.path }));
      return null;
    }
    const charCount = assessment.extractedChars;
    const rejection = checkAttachLimits({ pageCount: extracted.pageCount, charCount });
    if (rejection) {
      new Notice(rejection.reason === 'too-many-pages'
        ? t('chat.context.notice.pdfTooManyPages', {
            label: file.path,
            pages: rejection.pageCount,
            maxPages: rejection.maxPages,
          })
        : t('chat.context.notice.pdfTooManyChars', {
            label: file.path,
            chars: rejection.charCount,
            maxChars: rejection.maxChars,
          }));
      return null;
    }

    const pdf: PdfContextMeta = {
      textLayerPresent: true,
      pageCount: extracted.pageCount,
      extractedChars: charCount,
      extraction: 'embedded',
    };
    return {
      id: this.createPromptContextId(),
      kind: 'pdf_document',
      path: file.path,
      label: formatContextLabel(file.path),
      mime: resolveContextMimeFromPath(file.path),
      pdf,
      pdfPages: extracted.pages,
    };
  }

  /**
   * PDF in-document selection context item (R-C4 phase 3). The selection
   * text is the payload; `pdfSelection` locates it inside the document so
   * annotation back links can return to it. No engine round trip: the text
   * comes from the viewer's own selection.
   */
  buildPdfSelectionContextItem(input: {
    pdfPath: string;
    page: number;
    text: string;
    rangeStr?: string;
    pageCount?: number;
  }): PromptContextItem | null {
    const trimmed = input.text.trim();
    if (!trimmed) {
      new Notice(t('chat.context.notice.pdfNoSelection'));
      return null;
    }
    const file = this.resolveFileByPath(input.pdfPath);
    if (!file) {
      new Notice(t('chat.context.notice.pdfUnreadable', { label: input.pdfPath }));
      return null;
    }
    return {
      id: this.createPromptContextId(),
      kind: 'pdf_selection',
      path: file.path,
      label: formatContextLabel(file.path),
      mime: resolveContextMimeFromPath(file.path),
      pdf: {
        textLayerPresent: true,
        pageCount: input.pageCount ?? 0,
        extractedChars: trimmed.length,
        extraction: 'embedded',
      },
      pdfSelection: buildPdfSelectionRange(input.page, trimmed, input.rangeStr),
    };
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

  async buildPersistentFileContextItems(
    paths: readonly string[] | undefined,
  ): Promise<PromptContextItem[]> {
    if (!paths?.length) {
      return [];
    }

    const items: PromptContextItem[] = [];
    const seenPaths = new Set<string>();

    for (const rawPath of paths) {
      if (typeof rawPath !== 'string') {
        continue;
      }

      const normalizedPath = normalizePath(rawPath.trim());
      if (!normalizedPath || seenPaths.has(normalizedPath)) {
        continue;
      }
      seenPaths.add(normalizedPath);

      const file = this.resolveFileByPath(normalizedPath);
      if (!file) {
        continue;
      }

      const item = await this.buildFileContextItem(file, 'file');
      if (item) {
        items.push(item);
      }
    }

    return items;
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
