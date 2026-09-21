/**
 * ContextWindowOverrideModal — R-F8 (advantage-parity): the user-declared
 * context-window cap editor.
 *
 * For catalog models that lack authoritative metadata (typical for custom
 * OpenAI-compatible entries): the user declares `provider/model -> tokens`
 * caps; they fill the catalog at the boundary (never masking real values)
 * and ContextRing percentages / compaction thresholds consume them through
 * the existing contextWindow flow. The modal lists current overrides with
 * removal, validates ref shape (`provider/model`) and a positive-integer
 * window, and persists through the normal settings save path.
 */

import type { App } from 'obsidian';
import { Modal, Notice, Setting } from 'obsidian';

import { t } from '../../i18n';

/** Narrow feature-level port: the settings shell passes the plugin shape; no app-layer import. */
export interface ContextWindowOverrideModalHost {
  app: App;
  settings: { modelContextWindowOverrides: Record<string, number> };
  saveSettings(): Promise<unknown>;
}

export class ContextWindowOverrideModal extends Modal {
  private listEl: HTMLElement | null = null;

  constructor(private readonly plugin: ContextWindowOverrideModalHost) {
    super(plugin.app);
  }

  onOpen(): void {
    this.titleEl.setText(t('settings.contextWindowOverride.modalTitle'));
    this.modalEl.addClass('opencodian-context-window-override-modal');
    this.renderAddForm();
    this.listEl = this.contentEl.createDiv({ cls: 'opencodian-context-window-override-list' });
    this.renderList();
  }

  private renderAddForm(): void {
    let provider = '';
    let model = '';
    let windowValue = '';
    const form = new Setting(this.contentEl)
      .setName(t('settings.contextWindowOverride.addName'))
      .setDesc(t('settings.contextWindowOverride.addDesc'));
    const inputsEl = this.contentEl.createDiv({ cls: 'opencodian-context-window-override-form' });
    const providerInput = inputsEl.createEl('input', {
      attr: { type: 'text', placeholder: 'openai-compatible' },
    });
    providerInput.addEventListener('change', () => {
      provider = providerInput.value;
    });
    const modelInput = inputsEl.createEl('input', {
      attr: { type: 'text', placeholder: 'my-model' },
    });
    modelInput.addEventListener('change', () => {
      model = modelInput.value;
    });
    const windowInput = inputsEl.createEl('input', {
      attr: { type: 'number', min: '1000', step: '1000', placeholder: '128000' },
    });
    windowInput.addEventListener('change', () => {
      windowValue = windowInput.value;
    });
    inputsEl.createEl('button', {
      text: t('settings.contextWindowOverride.addButton'),
      attr: { type: 'button' },
    }).addEventListener('click', async () => {
      const ref = `${provider.trim()}/${model.trim()}`;
      const parsed = Number(windowValue);
      if (!provider.trim() || !model.trim() || !ref.includes('/') || ref.length <= 1) {
        new Notice(t('settings.contextWindowOverride.invalidRef'));
        return;
      }
      if (!Number.isInteger(parsed) || parsed <= 0) {
        new Notice(t('settings.contextWindowOverride.invalidWindow'));
        return;
      }
      this.plugin.settings.modelContextWindowOverrides = {
        ...this.plugin.settings.modelContextWindowOverrides,
        [ref]: parsed,
      };
      await this.plugin.saveSettings();
      providerInput.value = '';
      modelInput.value = '';
      windowInput.value = '';
      provider = '';
      model = '';
      windowValue = '';
      this.renderList();
    });
    void form;
  }

  private renderList(): void {
    if (!this.listEl) {
      return;
    }
    this.listEl.empty();
    const entries = Object.entries(this.plugin.settings.modelContextWindowOverrides)
      .sort((left, right) => left[0].localeCompare(right[0]));
    if (entries.length === 0) {
      this.listEl.createDiv({
        cls: 'opencodian-context-window-override-empty',
        text: t('settings.contextWindowOverride.empty'),
      });
      return;
    }
    for (const [ref, window] of entries) {
      const rowEl = this.listEl.createDiv({ cls: 'opencodian-context-window-override-row' });
      rowEl.createSpan({ cls: 'opencodian-context-window-override-ref', text: ref });
      rowEl.createSpan({
        cls: 'opencodian-context-window-override-window',
        text: window.toLocaleString(),
      });
      rowEl.createEl('button', {
        text: t('settings.contextWindowOverride.removeButton'),
        attr: { type: 'button' },
      }).addEventListener('click', async () => {
        const next = { ...this.plugin.settings.modelContextWindowOverrides };
        delete next[ref];
        this.plugin.settings.modelContextWindowOverrides = next;
        await this.plugin.saveSettings();
        this.renderList();
      });
    }
  }
}
