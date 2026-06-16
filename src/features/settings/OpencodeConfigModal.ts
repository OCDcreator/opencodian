/**
 * OpenCode Configuration Editor Modal
 * 
 * Displays and allows editing of the .opencode/opencode.json configuration file
 */

import { App, Modal, Notice } from 'obsidian';

import { OpencodeConfigManager } from '../../core/config';
import type { OpencodeConfig } from '../../core/types';
import { t } from '../../i18n';
import { createLogger } from '../../shared';
import { TextareaSizeMemory } from './TextareaSizeMemory';

const logger = createLogger('OpencodeConfigModal');

interface AppWithPluginRegistry extends App {
  plugins?: {
    plugins?: Record<string, {
      openCodeService?: {
        checkHealth(): Promise<boolean>;
        stop(): Promise<void>;
        start(): Promise<void>;
      };
      settings?: {
        server?: {
          mode?: string;
        };
      };
    }>;
  };
}

export class OpencodeConfigModal extends Modal {
  private configManager: OpencodeConfigManager;
  private config: OpencodeConfig;
  private editorEl: HTMLTextAreaElement | null = null;
  private editorSizeMemory: TextareaSizeMemory | null = null;

  constructor(app: App, configManager: OpencodeConfigManager) {
    super(app);
    this.configManager = configManager;
    this.config = {};
  }

  async onOpen() {
    const { contentEl } = this;
    
    // Load config
    try {
      this.config = await this.configManager.read();
    } catch (error) {
      logger.error('Failed to load config:', error);
      this.config = {};
    }

    // Modal title
    contentEl.createEl('h2', { text: t('configEditor.title') });

    const shell = contentEl.createDiv({ cls: 'opencodian-modal-shell' });

    // Path + editor section
    const editorSection = shell.createDiv({ cls: 'opencodian-modal-section' });

    // Show config file path
    editorSection.createEl('p', {
      text: `${t('configEditor.path')}: ${this.configManager.getConfigPath()}`,
      cls: 'opencodian-config-path',
    });

    // Create editor container
    const editorContainer = editorSection.createDiv({ cls: 'opencodian-config-editor-container' });

    // Create textarea for editing
    this.editorEl = editorContainer.createEl('textarea', {
      cls: 'opencodian-config-editor',
      attr: { 
        spellcheck: 'false',
        placeholder: 'Loading configuration...'
      }
    });
    this.editorSizeMemory = TextareaSizeMemory.attach(this.editorEl, 'opencode-config-editor');
    
    // Set initial value
    this.updateEditorValue();

    // Help content
    this.renderHelpContent(shell);

    // Button container
    const buttonContainer = shell.createDiv({
      cls: 'opencodian-config-buttons opencodian-modal-actions',
    });

    // Format button
    const formatBtn = buttonContainer.createEl('button', {
      text: t('configEditor.format'),
      cls: 'mod-cta'
    });
    formatBtn.addEventListener('click', () => this.formatJson());

    // Reset button
    const resetBtn = buttonContainer.createEl('button', {
      text: t('configEditor.reset')
    });
    resetBtn.addEventListener('click', () => this.resetToDefault());

    // Save button
    const saveBtn = buttonContainer.createEl('button', {
      text: t('configEditor.save'),
      cls: 'mod-cta'
    });
    saveBtn.addEventListener('click', () => this.saveConfig());

    // Close button
    const closeBtn = buttonContainer.createEl('button', {
      text: t('configEditor.close')
    });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    this.editorSizeMemory?.destroy();
    this.editorSizeMemory = null;
    const { contentEl } = this;
    contentEl.empty();
  }

  private renderHelpContent(parent: HTMLElement): void {
    const yoloExample = JSON.stringify({ permission: 'allow' }, null, 2);
    const safeExample = JSON.stringify({ permission: { '*': 'ask' } }, null, 2);
    const readonlyExample = JSON.stringify({
      permission: { '*': 'ask', read: 'allow', edit: 'deny', write: 'deny' },
    }, null, 2);
    const customExample = JSON.stringify({
      permission: { bash: { '*': 'ask', 'git *': 'allow' } },
    }, null, 2);

    const helpShell = parent.createDiv({ cls: 'opencodian-help-modal-shell' });
    helpShell.createEl('h4', { text: t('configEditor.help.title') });

    const modesSection = helpShell.createDiv({ cls: 'opencodian-help-modal-section' });
    modesSection.createEl('p', { text: t('configEditor.help.intro') });

    const modes = [
      { titleKey: 'configEditor.help.mode1.title', descKey: 'configEditor.help.mode1.desc' },
      { titleKey: 'configEditor.help.mode2.title', descKey: 'configEditor.help.mode2.desc' },
      { titleKey: 'configEditor.help.mode3.title', descKey: 'configEditor.help.mode3.desc' },
    ] as const;
    for (const mode of modes) {
      const modeCard = modesSection.createDiv({ cls: 'opencodian-help-modal-card' });
      modeCard.createEl('strong', { text: t(mode.titleKey) });
      modeCard.createEl('p', { text: t(mode.descKey) });
    }

    const toolsSection = helpShell.createDiv({ cls: 'opencodian-help-modal-section' });
    toolsSection.createEl('h5', { text: t('configEditor.help.tools.title') });
    const toolsList = toolsSection.createEl('ul', { cls: 'opencodian-help-modal-list' });
    const tools = [
      { name: 'read', descKey: 'configEditor.help.tools.read' },
      { name: 'edit', descKey: 'configEditor.help.tools.edit' },
      { name: 'bash', descKey: 'configEditor.help.tools.bash' },
      { name: 'glob', descKey: 'configEditor.help.tools.glob' },
      { name: 'grep', descKey: 'configEditor.help.tools.grep' },
    ] as const;
    for (const tool of tools) {
      const item = toolsList.createEl('li');
      item.createEl('code', { cls: 'opencodian-help-modal-code', text: tool.name });
      item.appendText(` - ${t(tool.descKey)}`);
    }

    const examplesSection = helpShell.createDiv({ cls: 'opencodian-help-modal-section' });
    examplesSection.createEl('h5', { text: t('configEditor.help.examples.title') });
    const examples: ReadonlyArray<{ label: string; json: string }> = [
      { label: t('configEditor.help.examples.yolo'), json: yoloExample },
      { label: t('configEditor.help.examples.safe'), json: safeExample },
      { label: t('configEditor.help.examples.readonly'), json: readonlyExample },
      { label: t('configEditor.help.examples.custom'), json: customExample },
    ];
    for (const example of examples) {
      examplesSection.createEl('p', { text: example.label });
      const pre = examplesSection.createEl('pre', { cls: 'opencodian-help-modal-pre' });
      const codeEl = pre.createEl('code');
      codeEl.innerHTML = this.escapeHtml(example.json);
    }

    const tipsSection = helpShell.createDiv({ cls: 'opencodian-help-modal-section' });
    tipsSection.createEl('h5', { text: t('configEditor.help.tips.title') });
    const tipsList = tipsSection.createEl('ul', { cls: 'opencodian-help-modal-list' });
    const tipKeys = [
      'configEditor.help.tips.tip1',
      'configEditor.help.tips.tip2',
      'configEditor.help.tips.tip3',
    ] as const;
    for (const tipKey of tipKeys) {
      tipsList.createEl('li', { text: t(tipKey) });
    }

    const footer = helpShell.createDiv({ cls: 'opencodian-help-modal-actions' });
    footer.createEl('span', { text: t('configEditor.help.actions') });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private updateEditorValue() {
    if (this.editorEl) {
      this.editorEl.value = JSON.stringify(this.config, null, 2);
    }
  }

  private formatJson() {
    if (!this.editorEl) return;
    
    try {
      const current = JSON.parse(this.editorEl.value);
      this.editorEl.value = JSON.stringify(current, null, 2);
      new Notice(t('configEditor.notice.formatSuccess'));
    } catch (error) {
      new Notice(t('configEditor.error.invalidJson') + ': ' + (error as Error).message);
    }
  }

  private async resetToDefault() {
    const confirmed = confirm(t('configEditor.notice.resetConfirm'));
    
    if (!confirmed) return;

    this.config = {
      $schema: 'https://opencode.ai/config.json',
      permission: { '*': 'ask' }
    };
    
    this.updateEditorValue();
    new Notice(t('configEditor.notice.resetSuccess'));
  }

  private async saveConfig() {
    if (!this.editorEl) return;

    try {
      // Parse JSON
      const newConfig = JSON.parse(this.editorEl.value) as OpencodeConfig;
      
      // Validate basic structure
      if (newConfig.permission === undefined) {
        new Notice('Warning: No "permission" field found in config');
      }

      // Save to file
      await this.configManager.write(newConfig);
      
      new Notice(t('configEditor.notice.saveSuccess'));
      
      // Restart service
      try {
        // Access the plugin's OpenCode service
        const plugin = (this.app as AppWithPluginRegistry).plugins?.plugins?.opencodian;
        if (plugin?.openCodeService) {
          if (plugin.settings?.server?.mode !== 'local') {
            new Notice(t('settings.server.remoteManageUnavailable'));
            this.close();
            return;
          }

          const isRunning = await plugin.openCodeService.checkHealth();
          if (isRunning) {
            await plugin.openCodeService.stop();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await plugin.openCodeService.start();
            new Notice(t('configEditor.notice.serviceRestarted'));
          } else {
            new Notice(t('configEditor.notice.serviceNotRunning'));
          }
        }
      } catch (error) {
        logger.error('Failed to restart service:', error);
        new Notice(t('configEditor.notice.saveError') + ': ' + (error as Error).message);
      }

      this.close();
    } catch (error) {
      logger.error('Failed to save config:', error);
      new Notice(t('configEditor.notice.saveError') + ': ' + (error as Error).message);
    }
  }
}
