/**
 * ACP settings section for managing external agent configurations.
 */

import { Setting } from 'obsidian';

import type { AcpAgentConfig } from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

interface SettingsAcpSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
}

const ACP_PRESETS: Array<Omit<AcpAgentConfig, 'id'>> = [
  { name: 'OpenCode', command: 'opencode', args: ['acp'], env: {}, enabled: true },
  { name: 'Codex', command: 'codex', args: ['acp'], env: {}, enabled: true },
  { name: 'Claude Code', command: 'claude', args: ['acp'], env: {}, enabled: true },
];

export class SettingsAcpSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsAcpSectionOptions['createSectionHeading'];
  private bodyEl: HTMLElement | null = null;

  constructor(options: SettingsAcpSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const heading = this.createSectionHeading(containerEl, t('settings.acp.title'));
    this.render(containerEl);
    return heading;
  }

  attachTabbed(containerEl: HTMLElement, _secondaryTabId: string): void {
    this.render(containerEl);
  }

  private render(containerEl: HTMLElement): void {
    const blockEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    this.bodyEl = blockEl.createDiv({ cls: 'opencodian-settings-block-body' });
    this.renderAddButtons(this.bodyEl);
    this.renderAgentList(this.bodyEl);
  }

  private rerender(): void {
    if (!this.bodyEl) {
      return;
    }

    this.bodyEl.empty();
    this.renderAddButtons(this.bodyEl);
    this.renderAgentList(this.bodyEl);
  }

  private renderAddButtons(containerEl: HTMLElement): void {
    const presetBarEl = containerEl.createDiv({ cls: 'opencodian-acp-preset-bar' });

    new Setting(presetBarEl)
      .setName(t('settings.acp.addAgent'))
      .addButton((button) => {
        button
          .setButtonText('+')
          .onClick(() => {
            void this.addAgent({
              id: this.createAgentId(),
              name: 'New Agent',
              command: '',
              args: [],
              env: {},
              enabled: true,
            });
          });
      });

    for (const preset of ACP_PRESETS) {
      new Setting(presetBarEl)
        .addButton((button) => {
          button
            .setButtonText(`+ ${preset.name}`)
            .onClick(() => {
              void this.addAgent({ id: this.createAgentId(), ...preset });
            });
        });
    }
  }

  private renderAgentList(containerEl: HTMLElement): void {
    const agents = this.plugin.settings.acpAgents;
    if (agents.length === 0) {
      containerEl.createEl('p', { text: t('settings.acp.empty') });
      return;
    }

    for (const agent of agents) {
      this.renderAgentCard(containerEl, agent);
    }
  }

  private renderAgentCard(containerEl: HTMLElement, agent: AcpAgentConfig): void {
    const cardEl = containerEl.createDiv({ cls: 'opencodian-acp-agent-card' });

    // Header row: name, description, toggle, remove
    new Setting(cardEl)
      .setName(agent.name || t('settings.acp.agentName'))
      .setDesc(`${agent.command} ${agent.args.join(' ')}`.trim())
      .addToggle((toggle) => {
        toggle.setValue(agent.enabled).onChange(async (value) => {
          agent.enabled = value;
          await this.saveSettings();
        });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.acp.removeAgent'))
          .onClick(async () => {
            this.plugin.settings.acpAgents = this.plugin.settings.acpAgents.filter(
              (candidate) => candidate.id !== agent.id,
            );
            await this.saveSettings();
            this.rerender();
          });
      });

    // Stacked form fields: label above input, full width
    const fieldsEl = cardEl.createDiv({ cls: 'opencodian-acp-agent-fields' });

    this.renderStackedField(fieldsEl, t('settings.acp.agentName'), agent.name, async (value) => {
      agent.name = value;
      await this.saveSettings();
    });

    this.renderStackedField(fieldsEl, t('settings.acp.agentCommand'), agent.command, async (value) => {
      agent.command = value;
      await this.saveSettings();
    });

    this.renderStackedField(fieldsEl, t('settings.acp.agentArgs'), agent.args.join(' '), async (value) => {
      agent.args = value.split(/\s+/).filter(Boolean);
      await this.saveSettings();
    });

    this.renderStackedField(fieldsEl, t('settings.acp.agentCwd'), agent.cwd ?? '', async (value) => {
      agent.cwd = value.trim() || undefined;
      await this.saveSettings();
    }, '(default)');
  }

  private renderStackedField(
    containerEl: HTMLElement,
    label: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    placeholder?: string,
  ): void {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-acp-stacked-field' });
    fieldEl.createEl('label', { text: label, cls: 'opencodian-acp-field-label' });
    const input = fieldEl.createEl('input', {
      cls: 'opencodian-acp-field-input',
      attr: { type: 'text', value },
    }) as HTMLInputElement;
    if (placeholder) {
      input.placeholder = placeholder;
    }
    input.addEventListener('change', () => {
      void onChange(input.value);
    });
  }

  private async addAgent(agent: AcpAgentConfig): Promise<void> {
    this.plugin.settings.acpAgents = [...this.plugin.settings.acpAgents, agent];
    await this.saveSettings();
    this.rerender();
  }

  private async saveSettings(): Promise<void> {
    await this.plugin.saveSettings();
  }

  private createAgentId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `acp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
