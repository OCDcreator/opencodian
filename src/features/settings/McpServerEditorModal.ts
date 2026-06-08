import { type App, Modal, Notice, Setting } from 'obsidian';

import type { McpConfigService } from '../../core/config/McpConfigService';
import type { OpencodeMcpEntryConfig } from '../../core/types';
import { t } from '../../i18n';
import { redactMcpSensitiveText } from './McpServerStatusModal';
import {
  enhanceSettingsDropdowns,
  type SettingsDropdownsEnhancerHandle,
} from './SettingsDropdownControl';
import {
  type AddFormState,
  buildMcpConfigFromFormState,
  createDefaultMcpFormState,
  mcpEntryToFormState,
  validateMcpFormState,
} from './SettingsMcpAddForm';
import { TextareaSizeMemory } from './TextareaSizeMemory';

export interface McpServerEditorModalOptions {
  mode: 'add' | 'edit';
  serverName?: string;
  existingEntry?: OpencodeMcpEntryConfig;
  existingNames: string[];
  configService: McpConfigService;
  onSaved: (payload: {
    mode: 'add' | 'edit';
    name: string;
    config: OpencodeMcpEntryConfig;
  }) => void | Promise<void>;
}

export class McpServerEditorModal extends Modal {
  private formState: AddFormState;
  private submitButton: HTMLButtonElement | null = null;
  private dropdownsEnhancer: SettingsDropdownsEnhancerHandle | null = null;
  private textareaSizeMemories: TextareaSizeMemory[] = [];
  private isSaving = false;

  constructor(
    app: App,
    private readonly options: McpServerEditorModalOptions,
  ) {
    super(app);
    this.formState = options.mode === 'edit' && options.serverName && options.existingEntry
      ? mcpEntryToFormState(options.serverName, options.existingEntry)
      : createDefaultMcpFormState();
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass('opencodian-mcp-editor-modal');
    this.titleEl.setText(
      this.options.mode === 'edit'
        ? t('settings.server.mcp.editor.titleEdit')
        : t('settings.server.mcp.editor.titleAdd'),
    );
    this.renderForm();
  }

  onClose(): void {
    this.dropdownsEnhancer?.destroy();
    this.dropdownsEnhancer = null;
    this.destroyTextareaSizeMemories();
    this.contentEl.empty();
  }

  private renderForm(): void {
    this.dropdownsEnhancer?.destroy();
    this.dropdownsEnhancer = null;
    this.destroyTextareaSizeMemories();
    this.contentEl.empty();
    this.submitButton = null;

    const shell = this.contentEl.createDiv({ cls: 'opencodian-mcp-add-form-layout' });
    const basicsGroup = this.createFormGroup(shell, t('settings.server.mcp.add.group.basics'));

    new Setting(basicsGroup)
      .setName(t('settings.server.mcp.add.type'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('local', t('settings.server.mcp.add.typeLocal'))
          .addOption('remote', t('settings.server.mcp.add.typeRemote'))
          .setValue(this.formState.type)
          .onChange((value) => {
            this.formState.type = value === 'remote' ? 'remote' : 'local';
            this.renderForm();
          });
      });

    new Setting(basicsGroup)
      .setName(t('settings.server.mcp.add.name'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.server.mcp.add.namePlaceholder'))
          .setValue(this.formState.name)
          .onChange((value) => {
            this.formState.name = value;
          });
        text.inputEl.disabled = this.options.mode === 'edit';
      });

    new Setting(basicsGroup)
      .setName(t('settings.server.mcp.add.enabled'))
      .addToggle((toggle) => {
        toggle.setValue(this.formState.enabled).onChange((value) => {
          this.formState.enabled = value;
        });
      });

    new Setting(basicsGroup)
      .setName(t('settings.server.mcp.add.timeout'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.server.mcp.add.timeoutPlaceholder'))
          .setValue(this.formState.timeout)
          .onChange((value) => {
            this.formState.timeout = value;
          });
      });

    const connectionGroup = this.createFormGroup(shell, t('settings.server.mcp.add.group.connection'));
    if (this.formState.type === 'local') {
      this.renderLocalFields(connectionGroup);
    } else {
      this.renderRemoteFields(connectionGroup, shell);
    }

    const actionRow = shell.createDiv({ cls: 'opencodian-mcp-form-actions' });
    this.submitButton = actionRow.createEl('button', {
      cls: 'mod-cta',
      text: this.options.mode === 'edit'
        ? t('settings.server.mcp.editor.save')
        : t('settings.server.mcp.add.submit'),
    });
    this.submitButton.type = 'button';
    this.submitButton.addEventListener('click', () => {
      void this.handleSave();
    });
    this.updateSubmitButton();
    this.dropdownsEnhancer = enhanceSettingsDropdowns(this.contentEl);
  }

  private createFormGroup(parent: HTMLElement, title: string): HTMLElement {
    const groupEl = parent.createDiv({ cls: 'opencodian-mcp-form-group' });
    groupEl.createDiv({ cls: 'opencodian-mcp-form-group-title', text: title });
    return groupEl.createDiv({ cls: 'opencodian-mcp-form-group-body' });
  }

  private renderLocalFields(container: HTMLElement): void {
    new Setting(container)
      .setName(t('settings.server.mcp.add.command'))
      .setDesc(t('settings.server.mcp.add.commandDesc'))
      .addTextArea((text) => {
        text.inputEl.rows = 3;
        text
          .setPlaceholder(t('settings.server.mcp.add.commandPlaceholder'))
          .setValue(this.formState.command)
          .onChange((value) => {
            this.formState.command = value;
          });
        this.textareaSizeMemories.push(TextareaSizeMemory.attach(text.inputEl, 'mcp-local-command'));
      });

    new Setting(container)
      .setName(t('settings.server.mcp.add.environment'))
      .setDesc(t('settings.server.mcp.add.environmentDesc'))
      .addTextArea((text) => {
        text.inputEl.rows = 2;
        text
          .setPlaceholder(t('settings.server.mcp.add.environmentPlaceholder'))
          .setValue(this.formState.environment)
          .onChange((value) => {
            this.formState.environment = value;
          });
        this.textareaSizeMemories.push(
          TextareaSizeMemory.attach(text.inputEl, 'mcp-local-environment'),
        );
      });
  }

  private renderRemoteFields(container: HTMLElement, shell: HTMLElement): void {
    new Setting(container)
      .setName(t('settings.server.mcp.add.url'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.server.mcp.add.urlPlaceholder'))
          .setValue(this.formState.url)
          .onChange((value) => {
            this.formState.url = value;
          });
      });

    new Setting(container)
      .setName(t('settings.server.mcp.add.headers'))
      .setDesc(t('settings.server.mcp.add.headersDesc'))
      .addTextArea((text) => {
        text.inputEl.rows = 2;
        text
          .setPlaceholder(t('settings.server.mcp.add.headersPlaceholder'))
          .setValue(this.formState.headers)
          .onChange((value) => {
            this.formState.headers = value;
          });
        this.textareaSizeMemories.push(TextareaSizeMemory.attach(text.inputEl, 'mcp-remote-headers'));
      });

    const oauthGroup = this.createFormGroup(shell, t('settings.server.mcp.add.group.oauth'));
    new Setting(oauthGroup)
      .setName(t('settings.server.mcp.add.oauth'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('auto', t('settings.server.mcp.add.oauthAuto'))
          .addOption('disabled', t('settings.server.mcp.add.oauthDisabled'))
          .addOption('configured', t('settings.server.mcp.add.oauthConfigured'))
          .setValue(this.formState.oauthMode)
          .onChange((value) => {
            this.formState.oauthMode = value as AddFormState['oauthMode'];
            this.renderForm();
          });
      });

    if (this.formState.oauthMode !== 'configured') {
      return;
    }

    for (const [labelKey, stateKey] of [
      ['settings.server.mcp.add.oauthClientId', 'oauthClientId'],
      ['settings.server.mcp.add.oauthClientSecret', 'oauthClientSecret'],
      ['settings.server.mcp.add.oauthScope', 'oauthScope'],
      ['settings.server.mcp.add.oauthRedirectUri', 'oauthRedirectUri'],
    ] as const) {
      new Setting(oauthGroup)
        .setName(t(labelKey))
        .addText((text) => {
          text.setValue(this.formState[stateKey]).onChange((value) => {
            this.formState[stateKey] = value;
          });
        });
    }
  }

  private async handleSave(): Promise<void> {
    const validationError = validateMcpFormState(this.formState, {
      existingNames: this.options.existingNames,
      originalName: this.options.mode === 'edit' ? this.options.serverName : undefined,
    });
    if (validationError) {
      new Notice(validationError);
      return;
    }

    const name = this.formState.name.trim();
    const config = buildMcpConfigFromFormState(this.formState);
    this.isSaving = true;
    this.updateSubmitButton();
    try {
      await this.options.configService.upsertServer(name, config);
      try {
        await this.options.onSaved({
          mode: this.options.mode,
          name,
          config,
        });
      } catch (runtimeError) {
        const message = runtimeError instanceof Error ? runtimeError.message : String(runtimeError);
        new Notice(t('settings.server.mcp.notice.savedRuntimeFailed', {
          name,
          error: redactMcpSensitiveText(message),
        }));
        this.close();
        return;
      }
      new Notice(
        this.options.mode === 'edit'
          ? t('settings.server.mcp.notice.updated', { name })
          : t('settings.server.mcp.notice.added', { name }),
      );
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.server.mcp.notice.addFailed', { error: redactMcpSensitiveText(message) }));
    } finally {
      this.isSaving = false;
      this.updateSubmitButton();
    }
  }

  private updateSubmitButton(): void {
    if (!this.submitButton) {
      return;
    }
    this.submitButton.textContent = this.isSaving
      ? t('settings.server.mcp.editor.saving')
      : this.options.mode === 'edit'
        ? t('settings.server.mcp.editor.save')
        : t('settings.server.mcp.add.submit');
    this.submitButton.disabled = this.isSaving;
  }

  private destroyTextareaSizeMemories(): void {
    for (const memory of this.textareaSizeMemories) {
      memory.destroy();
    }
    this.textareaSizeMemories = [];
  }
}
