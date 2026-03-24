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

const logger = createLogger('OpencodeConfigModal');

export class OpencodeConfigModal extends Modal {
  private configManager: OpencodeConfigManager;
  private config: OpencodeConfig;
  private editorEl: HTMLTextAreaElement | null = null;

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
    
    // Show config file path
    contentEl.createEl('p', { 
      text: `${t('configEditor.path')}: ${this.configManager.getConfigPath()}`,
      cls: 'opencodian-config-path'
    });

    // Create editor container
    const editorContainer = contentEl.createDiv({ cls: 'opencodian-config-editor-container' });

    // Create textarea for editing
    this.editorEl = editorContainer.createEl('textarea', {
      cls: 'opencodian-config-editor',
      attr: { 
        spellcheck: 'false',
        placeholder: 'Loading configuration...'
      }
    });
    
    // Set initial value
    this.updateEditorValue();

    // Button container
    const buttonContainer = contentEl.createDiv({ cls: 'opencodian-config-buttons' });

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
    resetBtn.style.backgroundColor = 'var(--background-modifier-error)';
    resetBtn.addEventListener('click', () => this.resetToDefault());

    // Save button
    const saveBtn = buttonContainer.createEl('button', {
      text: t('configEditor.save'),
      cls: 'mod-cta'
    });
    saveBtn.style.backgroundColor = 'var(--interactive-accent)';
    saveBtn.addEventListener('click', () => this.saveConfig());

    // Close button
    const closeBtn = buttonContainer.createEl('button', {
      text: t('configEditor.close')
    });
    closeBtn.addEventListener('click', () => this.close());

    // Add help text
    const helpText = contentEl.createEl('div', { cls: 'opencodian-config-help' });
    helpText.innerHTML = this.getHelpContent();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private getHelpContent(): string {
    const yoloExample = JSON.stringify({ permission: "allow" }, null, 2);
    const safeExample = JSON.stringify({ permission: { "*": "ask" } }, null, 2);
    const readonlyExample = JSON.stringify({ 
      permission: { "*": "ask", "read": "allow", "edit": "deny", "write": "deny" } 
    }, null, 2);
    const customExample = JSON.stringify({ 
      permission: { "bash": { "*": "ask", "git *": "allow" } } 
    }, null, 2);

    return `
      <h4>${t('configEditor.help.title')}</h4>
      
      <div class="opencodian-help-section">
        <p class="opencodian-help-intro">${t('configEditor.help.intro')}</p>
        
        <div class="opencodian-help-mode">
          <strong>${t('configEditor.help.mode1.title')}</strong>
          <p>${t('configEditor.help.mode1.desc')}</p>
        </div>
        
        <div class="opencodian-help-mode">
          <strong>${t('configEditor.help.mode2.title')}</strong>
          <p>${t('configEditor.help.mode2.desc')}</p>
        </div>
        
        <div class="opencodian-help-mode">
          <strong>${t('configEditor.help.mode3.title')}</strong>
          <p>${t('configEditor.help.mode3.desc')}</p>
        </div>
      </div>

      <div class="opencodian-help-section">
        <h5>${t('configEditor.help.tools.title')}</h5>
        <ul class="opencodian-help-tools">
          <li><code>read</code> - ${t('configEditor.help.tools.read')}</li>
          <li><code>edit</code> - ${t('configEditor.help.tools.edit')}</li>
          <li><code>bash</code> - ${t('configEditor.help.tools.bash')}</li>
          <li><code>glob</code> - ${t('configEditor.help.tools.glob')}</li>
          <li><code>grep</code> - ${t('configEditor.help.tools.grep')}</li>
        </ul>
      </div>

      <div class="opencodian-help-section">
        <h5>${t('configEditor.help.examples.title')}</h5>
        
        <div class="opencodian-help-example">
          <p class="opencodian-help-example-title">${t('configEditor.help.examples.yolo')}</p>
          <pre><code>${this.escapeHtml(yoloExample)}</code></pre>
        </div>
        
        <div class="opencodian-help-example">
          <p class="opencodian-help-example-title">${t('configEditor.help.examples.safe')}</p>
          <pre><code>${this.escapeHtml(safeExample)}</code></pre>
        </div>
        
        <div class="opencodian-help-example">
          <p class="opencodian-help-example-title">${t('configEditor.help.examples.readonly')}</p>
          <pre><code>${this.escapeHtml(readonlyExample)}</code></pre>
        </div>
        
        <div class="opencodian-help-example">
          <p class="opencodian-help-example-title">${t('configEditor.help.examples.custom')}</p>
          <pre><code>${this.escapeHtml(customExample)}</code></pre>
        </div>
      </div>

      <div class="opencodian-help-section">
        <h5>${t('configEditor.help.tips.title')}</h5>
        <ul class="opencodian-help-tips">
          <li>${t('configEditor.help.tips.tip1')}</li>
          <li>${t('configEditor.help.tips.tip2')}</li>
          <li>${t('configEditor.help.tips.tip3')}</li>
        </ul>
      </div>

      <p class="opencodian-help-footer">${t('configEditor.help.actions')}</p>
    `;
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
        const plugin = (this.app as any).plugins?.plugins?.['opencodian'];
        if (plugin?.openCodeService) {
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
