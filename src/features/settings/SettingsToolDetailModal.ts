import { Modal, Notice } from 'obsidian';

import { t } from '../../i18n';
import type { OpenCodianPlugin } from '../../main';
import { isOpenCodeSettingsBackendActive } from './settingsBackendGuards';

export type ToolFileSource = 'project' | 'global';

export interface ToolFileInfo {
  content?: string;
  name: string;
  path: string;
  source: ToolFileSource;
}

export interface VaultAdapterLike {
  basePath?: string;
  exists?: (path: string) => Promise<boolean>;
  list?: (path: string) => Promise<{ files: string[]; folders: string[] }>;
  mkdir?: (path: string) => Promise<void>;
  read?: (path: string) => Promise<string>;
  remove?: (path: string) => Promise<void>;
  write?: (path: string, data: string) => Promise<void>;
}

interface ToolDetailModalOptions {
  file: ToolFileInfo;
  plugin: OpenCodianPlugin;
  onSaved: () => Promise<void>;
}

const TOOL_NAME_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;

export class ToolDetailModal extends Modal {
  private readonly file: ToolFileInfo;
  private readonly plugin: OpenCodianPlugin;
  private readonly onSaved: ToolDetailModalOptions['onSaved'];
  private content = '';
  private validationEl: HTMLElement | null = null;
  private sourceTextArea: HTMLTextAreaElement | null = null;

  constructor(options: ToolDetailModalOptions) {
    super(options.plugin.app);
    this.file = options.file;
    this.plugin = options.plugin;
    this.onSaved = options.onSaved;
    this.content = options.file.content ?? '';
  }

  onOpen(): void {
    this.titleEl.setText(t('settings.tools.custom.modal.title').replace('{name}', this.file.name));
    this.modalEl.addClass('opencodian-tool-detail-modal');
    this.contentEl.empty();

    const shellEl = this.contentEl.createDiv({ cls: 'opencodian-skill-detail-shell opencodian-tool-detail-shell' });
    this.validationEl = shellEl.createDiv({ cls: 'opencodian-skill-validation opencodian-tool-validation' });
    shellEl.createDiv({ cls: 'opencodian-skill-preview-label', text: t('settings.tools.custom.modal.source') });
    this.sourceTextArea = shellEl.createEl('textarea', {
      cls: 'opencodian-skill-editor-textarea opencodian-tool-editor-textarea',
      attr: { spellcheck: 'false', wrap: 'soft' },
    }) as HTMLTextAreaElement;
    this.sourceTextArea.value = this.content;
    this.sourceTextArea.disabled = this.file.source !== 'project';
    this.sourceTextArea.addEventListener('input', () => {
      this.content = this.sourceTextArea?.value ?? '';
      this.renderValidation();
    });
    this.renderValidation();

    const actionsEl = this.contentEl.createDiv({ cls: 'opencodian-skill-detail-actions opencodian-tool-detail-actions' });
    if (this.file.source === 'project') {
      this.createFooterButton(actionsEl, t('settings.tools.custom.modal.save'), async () => {
        await this.save();
      }, { cta: true });
      this.createFooterButton(actionsEl, t('settings.tools.custom.delete'), async () => {
        await this.delete();
      });
    }
    this.createFooterButton(actionsEl, t('settings.tools.custom.modal.close'), () => {
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-tool-detail-modal');
  }

  private renderValidation(): void {
    if (!this.validationEl) {
      return;
    }
    this.validationEl.empty();
    const result = validateToolSource(this.content, this.file.name);
    this.validationEl.toggleClass('is-valid', result.valid);
    this.validationEl.toggleClass('is-invalid', !result.valid);
    this.validationEl.createDiv({
      cls: 'opencodian-skill-validation-title',
      text: result.valid ? t('settings.tools.custom.validation.valid') : t('settings.tools.custom.validation.invalid'),
    });
    for (const message of result.messages) {
      this.validationEl.createDiv({ cls: 'opencodian-skill-validation-message', text: message });
    }
  }

  private async save(): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    const result = validateToolSource(this.content, this.file.name);
    if (!result.valid) {
      new Notice(t('settings.tools.custom.validation.invalid'));
      this.renderValidation();
      return;
    }
    await ((this.plugin.app.vault.adapter as VaultAdapterLike).write?.(this.file.path, this.content));
    new Notice(t('settings.tools.custom.notice.saved').replace('{path}', this.file.path));
    await this.onSaved();
    this.close();
  }

  private async delete(): Promise<void> {
    if (!this.ensureOpenCodeActive()) {
      return;
    }
    if (!window.confirm(t('settings.tools.custom.delete.confirm').replace('{name}', this.file.name))) {
      return;
    }
    await ((this.plugin.app.vault.adapter as VaultAdapterLike).remove?.(this.file.path));
    new Notice(t('settings.tools.custom.notice.deleted').replace('{path}', this.file.path));
    await this.onSaved();
    this.close();
  }

  private createFooterButton(
    containerEl: HTMLElement,
    text: string,
    onClick: () => void | Promise<void>,
    options: { cta?: boolean } = {},
  ): HTMLButtonElement {
    const buttonEl = containerEl.createEl('button', { text });
    buttonEl.type = 'button';
    buttonEl.addClass('opencodian-skill-detail-action-button');
    if (options.cta) {
      buttonEl.addClass('mod-cta');
    }
    buttonEl.addEventListener('click', () => {
      void onClick();
    });
    return buttonEl;
  }

  private isOpenCodeActive(): boolean {
    return isOpenCodeSettingsBackendActive(this.plugin.settings);
  }

  private ensureOpenCodeActive(): boolean {
    if (this.isOpenCodeActive()) {
      return true;
    }
    new Notice(t('settings.tools.notice.openCodeOnly'));
    return false;
  }
}

function validateToolSource(content: string, fileToolName: string): { valid: boolean; messages: string[] } {
  const messages: string[] = [];
  if (!TOOL_NAME_PATTERN.test(fileToolName)) {
    messages.push(t('settings.tools.custom.validation.namePattern'));
  }
  if (!content.trim()) {
    messages.push(t('settings.tools.custom.validation.bodyRequired'));
  }
  if (!/\btool\s*\(/u.test(content) && !/\bexecute\s*[:(]/u.test(content)) {
    messages.push(t('settings.tools.custom.validation.executeRequired'));
  }
  return {
    valid: messages.length === 0,
    messages: messages.length > 0 ? messages : [t('settings.tools.custom.validation.ready')],
  };
}
