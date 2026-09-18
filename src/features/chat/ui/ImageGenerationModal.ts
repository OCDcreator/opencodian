/**
 * ImageGenerationModal — the chat entry's generation card (R-C2, design
 * §3.5): prompt + model, then the generated image with explicit insert /
 * copy / regenerate actions.
 *
 * The card never writes anything by itself. The only path into the vault is
 * the explicit insert button, which delegates to
 * `ImageGenerationChatController.insertIntoActiveNote` (W-asset → register →
 * W-ref). Closing the card without inserting leaves nothing on disk — that
 * is the chat-path answer to the §4.6 orphan policy: W-asset is deferred to
 * the insert click, so a discarded card cannot orphan a file, and the
 * `imageGenerationAssetCleanup` setting governs assets only after a save
 * actually happened.
 */

import { Modal, Setting } from 'obsidian';

import { t } from '../../../i18n';
import type {
  ChatImageGenerationOutcome,
  GeneratedImageCandidate,
  ImageGenerationChatController,
} from '../services/ImageGenerationChatController';

type InsertForm = 'line' | 'inline';

export class ImageGenerationModal extends Modal {
  private prompt = '';
  private modelId: string | null = null;
  private candidate: GeneratedImageCandidate | null = null;
  private errorText = '';
  private generating = false;
  private lastInsertForm: InsertForm = 'line';
  private objectUrl: string | null = null;

  constructor(
    app: import('obsidian').App,
    private readonly controller: ImageGenerationChatController,
    prefill = '',
  ) {
    super(app);
    this.prompt = prefill;
    this.modelId = controller.listModels()[0]?.id ?? null;
  }

  onOpen(): void {
    this.modalEl.addClass('opencodian-imagegen-modal');
    this.titleEl.setText(t('chat.imageGen.modal.title'));
    this.render();
  }

  onClose(): void {
    this.revokeObjectUrl();
    this.contentEl.empty();
  }

  private render(): void {
    const content = this.contentEl;
    content.empty();
    this.revokeObjectUrl();

    if (this.candidate) {
      this.renderResult(content);
      return;
    }

    // Prompt row (pre-filled by `/image <prompt>` and the composer button).
    new Setting(content)
      .setName(t('chat.imageGen.prompt.name'))
      .setDesc(t('chat.imageGen.prompt.desc'))
      .addTextArea((area) => {
        area
          .setPlaceholder(t('chat.imageGen.prompt.placeholder'))
          .setValue(this.prompt)
          .onChange((value) => { this.prompt = value; });
        area.inputEl.rows = 3;
      });

    const models = this.controller.listModels();
    if (models.length > 0) {
      new Setting(content)
        .setName(t('chat.imageGen.model.name'))
        .addDropdown((dropdown) => {
          for (const model of models) {
            dropdown.addOption(model.id, model.displayName);
          }
          dropdown.setValue(this.modelId ?? models[0]!.id).onChange((value) => {
            this.modelId = value;
          });
        });
    }

    if (this.errorText) {
      content.createDiv({ cls: 'opencodian-imagegen-error', text: this.errorText });
    }
    if (models.length === 0) {
      // No configured model: say so instead of a dead Generate button.
      content.createDiv({
        cls: 'opencodian-imagegen-error',
        text: t('chat.imageGen.error.noModels'),
      });
    }

    new Setting(content).addButton((button) => button
      .setButtonText(this.generating ? t('chat.imageGen.generating') : t('chat.imageGen.generate'))
      .setCta()
      .setDisabled(this.generating || !this.prompt.trim())
      .onClick(() => { void this.generate(); }));
  }

  private renderResult(content: HTMLElement): void {
    const candidate = this.candidate;
    if (!candidate) return;
    this.objectUrl = URL.createObjectURL(new Blob([candidate.bytes], { type: candidate.mimeType }));

    const figure = content.createDiv({ cls: 'opencodian-imagegen-result' });
    const image = figure.createEl('img', {
      cls: 'opencodian-imagegen-result-image',
      attr: { src: this.objectUrl, alt: candidate.prompt },
    });
    image.style.maxWidth = '100%';
    figure.createDiv({
      cls: 'opencodian-imagegen-result-meta',
      text: t('chat.imageGen.result.meta', {
        model: candidate.model.displayName,
        seconds: (candidate.durationMs / 1000).toFixed(1),
      }),
    });

    if (this.errorText) {
      content.createDiv({ cls: 'opencodian-imagegen-error', text: this.errorText });
    }

    // Insertion form (R-C2 acceptance 2) chosen at insert time; the insert
    // button hands it to the controller's explicit W-asset → W-ref flow.
    new Setting(content)
      .setName(t('chat.imageGen.form.name'))
      .addDropdown((dropdown) => {
        dropdown.addOption('line', t('chat.imageGen.form.line'));
        dropdown.addOption('inline', t('chat.imageGen.form.inline'));
        dropdown.setValue(this.lastInsertForm).onChange((value) => {
          this.lastInsertForm = value === 'inline' ? 'inline' : 'line';
        });
      });

    new Setting(content)
      .addButton((button) => button
        .setButtonText(t('chat.imageGen.insert.button'))
        .setCta()
        .onClick(() => { void this.insert(this.lastInsertForm); }))
      .addButton((button) => button
        .setButtonText(t('chat.imageGen.copy'))
        .onClick(() => { void this.copyImage(); }))
      .addButton((button) => button
        .setButtonText(t('chat.imageGen.regenerate'))
        .onClick(() => {
          this.candidate = null;
          this.errorText = '';
          this.render();
        }));
  }

  private async generate(): Promise<void> {
    const prompt = this.prompt.trim();
    if (!prompt || this.generating) return;
    const model = this.controller.listModels().find((entry) => entry.id === this.modelId);
    this.generating = true;
    this.errorText = '';
    this.render();
    const outcome: ChatImageGenerationOutcome = await this.controller.generate(prompt, model);
    this.generating = false;
    if (outcome.ok) {
      this.candidate = outcome.candidate;
    } else {
      this.errorText = outcome.error;
    }
    this.render();
  }

  private async insert(form: InsertForm): Promise<void> {
    if (!this.candidate) return;
    const inserted = await this.controller.insertIntoActiveNote(this.candidate, form);
    if (inserted) this.close();
  }

  private async copyImage(): Promise<void> {
    if (!this.candidate) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [this.candidate.mimeType]: new Blob([this.candidate.bytes], { type: this.candidate.mimeType }),
        }),
      ]);
    } catch {
      this.errorText = t('chat.imageGen.copy.failed');
      this.render();
    }
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
