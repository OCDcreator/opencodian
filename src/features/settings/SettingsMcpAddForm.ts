/** Add-server form sub-component extracted from SettingsMcpSection. */

import { type ButtonComponent, Notice, Setting } from 'obsidian';

import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

function parseKvPairs(text: string): Array<[string, string]> {
  return text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) {
        return [line, ''];
      }
      return [line.substring(0, eqIndex).trim(), line.substring(eqIndex + 1)];
    });
}

function parseKvPairsToRecord(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of parseKvPairs(text)) {
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

export interface AddFormState {
  type: 'local' | 'remote';
  name: string;
  command: string;
  environment: string;
  enabled: boolean;
  timeout: string;
  url: string;
  headers: string;
  oauthMode: 'auto' | 'disabled' | 'configured';
  oauthClientId: string;
  oauthClientSecret: string;
  oauthScope: string;
  oauthRedirectUri: string;
}

export class SettingsMcpAddForm {
  private readonly plugin: OpenCodianPlugin;
  private addFormContainerEl: HTMLElement | null = null;
  private isAdding = false;
  private addSubmitButton: ButtonComponent | null = null;
  private addFormState: AddFormState = SettingsMcpAddForm.createDefaultAddFormState();

  constructor(plugin: OpenCodianPlugin) {
    this.plugin = plugin;
  }

  render(parent: HTMLElement): void {
    this.addFormContainerEl = parent;
    this.renderAddFormFields();
  }

  dispose(): void {
    this.addFormContainerEl = null;
    this.addSubmitButton = null;
  }

  private static createDefaultAddFormState(): AddFormState {
    return {
      type: 'local',
      name: '',
      command: '',
      environment: '',
      enabled: true,
      timeout: '',
      url: '',
      headers: '',
      oauthMode: 'auto',
      oauthClientId: '',
      oauthClientSecret: '',
      oauthScope: '',
      oauthRedirectUri: '',
    };
  }

  private renderAddFormFields(): void {
    if (!this.addFormContainerEl) {
      return;
    }

    this.addFormContainerEl.empty();
    this.addSubmitButton = null;

    const basicsGroup = this.createFormGroup(
      this.addFormContainerEl,
      t('settings.server.mcp.add.group.basics'),
    );

    new Setting(basicsGroup)
      .setName(t('settings.server.mcp.add.type'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('local', t('settings.server.mcp.add.typeLocal'))
          .addOption('remote', t('settings.server.mcp.add.typeRemote'))
          .setValue(this.addFormState.type)
          .onChange((value) => {
            this.addFormState.type = value === 'remote' ? 'remote' : 'local';
            this.renderAddFormFields();
          });
      });

    new Setting(basicsGroup)
      .setName(t('settings.server.mcp.add.name'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.server.mcp.add.namePlaceholder'))
          .setValue(this.addFormState.name)
          .onChange((value) => {
            this.addFormState.name = value;
          });
      });

    new Setting(basicsGroup)
      .setName(t('settings.server.mcp.add.enabled'))
      .addToggle((toggle) => {
        toggle.setValue(this.addFormState.enabled).onChange((value) => {
          this.addFormState.enabled = value;
        });
      });

    new Setting(basicsGroup)
      .setName(t('settings.server.mcp.add.timeout'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.server.mcp.add.timeoutPlaceholder'))
          .setValue(this.addFormState.timeout)
          .onChange((value) => {
            this.addFormState.timeout = value;
          });
      });

    const connectionGroup = this.createFormGroup(
      this.addFormContainerEl,
      t('settings.server.mcp.add.group.connection'),
    );

    if (this.addFormState.type === 'local') {
      this.renderLocalFields(connectionGroup);
    } else {
      this.renderRemoteFields(connectionGroup);
    }

    const actionRow = this.addFormContainerEl.createDiv({ cls: 'opencodian-mcp-form-actions' });
    new Setting(actionRow)
      .addButton((button) => {
        this.addSubmitButton = button;
        button.onClick(async () => {
          await this.handleAddServer();
        });
      });

    this.updateSubmitButton();
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
          .setValue(this.addFormState.command)
          .onChange((value) => {
            this.addFormState.command = value;
          });
      });

    new Setting(container)
      .setName(t('settings.server.mcp.add.environment'))
      .setDesc(t('settings.server.mcp.add.environmentDesc'))
      .addTextArea((text) => {
        text.inputEl.rows = 2;
        text
          .setPlaceholder(t('settings.server.mcp.add.environmentPlaceholder'))
          .setValue(this.addFormState.environment)
          .onChange((value) => {
            this.addFormState.environment = value;
          });
      });
  }

  private renderRemoteFields(container: HTMLElement): void {
    new Setting(container)
      .setName(t('settings.server.mcp.add.url'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.server.mcp.add.urlPlaceholder'))
          .setValue(this.addFormState.url)
          .onChange((value) => {
            this.addFormState.url = value;
          });
      });

    new Setting(container)
      .setName(t('settings.server.mcp.add.headers'))
      .setDesc(t('settings.server.mcp.add.headersDesc'))
      .addTextArea((text) => {
        text.inputEl.rows = 2;
        text
          .setPlaceholder(t('settings.server.mcp.add.headersPlaceholder'))
          .setValue(this.addFormState.headers)
          .onChange((value) => {
            this.addFormState.headers = value;
          });
      });

    const oauthGroup = this.createFormGroup(
      this.addFormContainerEl!,
      t('settings.server.mcp.add.group.oauth'),
    );
    this.renderOAuthDropdown(oauthGroup);

    if (this.addFormState.oauthMode === 'configured') {
      this.renderOAuthConfiguredFields(oauthGroup);
    }
  }

  private renderOAuthDropdown(container: HTMLElement): void {
    new Setting(container)
      .setName(t('settings.server.mcp.add.oauth'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('auto', t('settings.server.mcp.add.oauthAuto'))
          .addOption('disabled', t('settings.server.mcp.add.oauthDisabled'))
          .addOption('configured', t('settings.server.mcp.add.oauthConfigured'))
          .setValue(this.addFormState.oauthMode)
          .onChange((value) => {
            this.addFormState.oauthMode = value as AddFormState['oauthMode'];
            this.renderAddFormFields();
          });
      });
  }

  private renderOAuthConfiguredFields(container: HTMLElement): void {
    new Setting(container)
      .setName(t('settings.server.mcp.add.oauthClientId'))
      .addText((text) => {
        text.setValue(this.addFormState.oauthClientId).onChange((value) => {
          this.addFormState.oauthClientId = value;
        });
      });

    new Setting(container)
      .setName(t('settings.server.mcp.add.oauthClientSecret'))
      .addText((text) => {
        text.setValue(this.addFormState.oauthClientSecret).onChange((value) => {
          this.addFormState.oauthClientSecret = value;
        });
      });

    new Setting(container)
      .setName(t('settings.server.mcp.add.oauthScope'))
      .addText((text) => {
        text.setValue(this.addFormState.oauthScope).onChange((value) => {
          this.addFormState.oauthScope = value;
        });
      });

    new Setting(container)
      .setName(t('settings.server.mcp.add.oauthRedirectUri'))
      .addText((text) => {
        text.setValue(this.addFormState.oauthRedirectUri).onChange((value) => {
          this.addFormState.oauthRedirectUri = value;
        });
      });
  }

  private validateAddForm(): string | null {
    const name = this.addFormState.name.trim();
    if (!name) {
      return t('settings.server.mcp.validation.nameRequired');
    }

    const snapshot = this.plugin.openCodeService.getMcpServerSnapshot();
    if (name in snapshot.servers) {
      return t('settings.server.mcp.validation.nameDuplicate');
    }

    if (this.addFormState.type === 'local') {
      const commandLines = this.addFormState.command
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (commandLines.length === 0) {
        return t('settings.server.mcp.validation.commandRequired');
      }
      const envKeys = parseKvPairs(this.addFormState.environment);
      if (envKeys.some(([key]) => key.length === 0)) {
        return t('settings.server.mcp.validation.emptyKey', {
          field: t('settings.server.mcp.add.environment'),
        });
      }
    }

    if (this.addFormState.type === 'remote') {
      if (!this.addFormState.url.trim()) {
        return t('settings.server.mcp.validation.urlRequired');
      }
      try {
        // eslint-disable-next-line no-new
        new URL(this.addFormState.url.trim());
      } catch {
        return t('settings.server.mcp.validation.urlInvalid');
      }
      const headerKeys = parseKvPairs(this.addFormState.headers);
      if (headerKeys.some(([key]) => key.length === 0)) {
        return t('settings.server.mcp.validation.emptyKey', {
          field: t('settings.server.mcp.add.headers'),
        });
      }
    }

    if (this.addFormState.timeout !== '') {
      const timeout = parseInt(this.addFormState.timeout, 10);
      if (!Number.isInteger(timeout) || timeout <= 0) {
        return t('settings.server.mcp.validation.timeoutPositive');
      }
    }

    return null;
  }

  private async handleAddServer(): Promise<void> {
    const validationError = this.validateAddForm();
    if (validationError) {
      new Notice(validationError);
      return;
    }

    const name = this.addFormState.name.trim();
    const config: Record<string, unknown> = { type: this.addFormState.type };

    if (this.addFormState.type === 'local') {
      config.command = this.addFormState.command
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const environment = parseKvPairsToRecord(this.addFormState.environment);
      if (Object.keys(environment).length > 0) {
        config.environment = environment;
      }
    } else {
      config.url = this.addFormState.url.trim();
      const headers = parseKvPairsToRecord(this.addFormState.headers);
      if (Object.keys(headers).length > 0) {
        config.headers = headers;
      }
      if (this.addFormState.oauthMode === 'disabled') {
        config.oauth = false;
      } else if (this.addFormState.oauthMode === 'configured') {
        const oauth: Record<string, string> = {};
        if (this.addFormState.oauthClientId) {
          oauth.clientId = this.addFormState.oauthClientId;
        }
        if (this.addFormState.oauthClientSecret) {
          oauth.clientSecret = this.addFormState.oauthClientSecret;
        }
        if (this.addFormState.oauthScope) {
          oauth.scope = this.addFormState.oauthScope;
        }
        if (this.addFormState.oauthRedirectUri) {
          oauth.redirectUri = this.addFormState.oauthRedirectUri;
        }
        config.oauth = oauth;
      }
    }

    config.enabled = this.addFormState.enabled;
    if (this.addFormState.timeout) {
      const timeout = parseInt(this.addFormState.timeout, 10);
      if (Number.isInteger(timeout) && timeout > 0) {
        config.timeout = timeout;
      }
    }

    this.isAdding = true;
    this.updateSubmitButton();

    try {
      await this.plugin.openCodeService.addMcpServer(name, config);
      new Notice(t('settings.server.mcp.notice.added', { name }));
      this.resetAddForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.server.mcp.notice.addFailed', { error: message }));
    } finally {
      this.isAdding = false;
      this.updateSubmitButton();
    }
  }

  private resetAddForm(): void {
    this.addFormState = SettingsMcpAddForm.createDefaultAddFormState();
    this.renderAddFormFields();
  }

  private updateSubmitButton(): void {
    if (!this.addSubmitButton) {
      return;
    }
    this.addSubmitButton
      .setButtonText(
        this.isAdding
          ? t('settings.server.mcp.add.adding')
          : t('settings.server.mcp.add.submit'),
      )
      .setDisabled(this.isAdding);
  }
}
