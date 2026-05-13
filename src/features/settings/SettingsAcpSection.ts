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

interface AcpStackedFieldOptions {
  label: string;
  value: string;
  onChange: (value: string) => Promise<void>;
  placeholder?: string;
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

    const scrollContainer = this.resolveScrollContainer(this.bodyEl);
    const previousScrollTop = scrollContainer?.scrollTop ?? 0;
    this.bodyEl.empty();
    this.renderAddButtons(this.bodyEl);
    this.renderAgentList(this.bodyEl);
    this.restoreScrollTopAfterRender(scrollContainer, previousScrollTop);
  }

  private renderAddButtons(containerEl: HTMLElement): void {
    const presetBarEl = containerEl.createDiv({ cls: 'opencodian-acp-preset-rail' });
    const introEl = presetBarEl.createDiv({ cls: 'opencodian-acp-preset-intro' });
    introEl.createEl('strong', { text: t('settings.acp.addAgent') });
    introEl.createDiv({ text: t('settings.acp.preset.desc'), cls: 'opencodian-acp-preset-desc' });

    new Setting(presetBarEl)
      .setClass('opencodian-acp-preset-action')
      .addButton((button) => {
        button
          .setButtonText(t('settings.acp.customAgent'))
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
        .setClass('opencodian-acp-preset-action')
        .addButton((button) => {
          button
            .setButtonText(preset.name)
            .onClick(() => {
              void this.addAgent({ id: this.createAgentId(), ...preset });
            });
        });
    }
  }

  private renderAgentList(containerEl: HTMLElement): void {
    const agents = this.plugin.settings.acpAgents;
    if (agents.length === 0) {
      containerEl.createDiv({ cls: 'opencodian-settings-inline-empty opencodian-acp-empty', text: t('settings.acp.empty') });
      return;
    }

    const listEl = containerEl.createDiv({ cls: 'opencodian-acp-agent-list' });
    for (const agent of agents) {
      this.renderAgentCard(listEl, agent);
    }
  }

  private renderAgentCard(containerEl: HTMLElement, agent: AcpAgentConfig): void {
    const cardEl = containerEl.createDiv({ cls: 'opencodian-acp-agent-card' });
    const headerEl = cardEl.createDiv({ cls: 'opencodian-acp-agent-card-header' });
    const identityEl = headerEl.createDiv({ cls: 'opencodian-acp-agent-identity' });
    identityEl.createEl('strong', { text: agent.name || t('settings.acp.agentName') });
    identityEl.createDiv({
      cls: 'opencodian-acp-agent-command-summary',
      text: this.formatAgentCommand(agent),
    });

    new Setting(headerEl)
      .setClass('opencodian-acp-agent-actions')
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

    this.renderStackedField(fieldsEl, {
      label: t('settings.acp.agentName'),
      value: agent.name,
      onChange: async (value) => {
        agent.name = value;
        await this.saveSettings();
      },
    });

    this.renderStackedField(fieldsEl, {
      label: t('settings.acp.agentCommand'),
      value: agent.command,
      onChange: async (value) => {
        agent.command = value;
        await this.saveSettings();
      },
    });

    this.renderStackedField(fieldsEl, {
      label: t('settings.acp.agentArgs'),
      value: agent.args.join(' '),
      onChange: async (value) => {
        agent.args = value.split(/\s+/).filter(Boolean);
        await this.saveSettings();
      },
    });

    this.renderStackedField(fieldsEl, {
      label: t('settings.acp.agentCwd'),
      value: agent.cwd ?? '',
      onChange: async (value) => {
        agent.cwd = value.trim() || undefined;
        await this.saveSettings();
      },
      placeholder: '(default)',
    });
  }

  private renderStackedField(
    containerEl: HTMLElement,
    options: AcpStackedFieldOptions,
  ): void {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-acp-stacked-field' });
    const inputId = `opencodian-acp-field-${this.createFieldId(options.label)}`;
    fieldEl.createEl('label', {
      text: options.label,
      cls: 'opencodian-acp-field-label',
      attr: { for: inputId },
    });
    const input = fieldEl.createEl('input', {
      cls: 'opencodian-acp-field-input',
      attr: { id: inputId, type: 'text', value: options.value },
    }) as HTMLInputElement;
    if (options.placeholder) {
      input.placeholder = options.placeholder;
    }
    input.addEventListener('change', () => {
      void options.onChange(input.value);
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

  private resolveScrollContainer(anchorEl: HTMLElement): HTMLElement | null {
    let currentEl: HTMLElement | null = anchorEl;
    while (currentEl) {
      if (
        currentEl.classList.contains('vertical-tab-content')
        || currentEl.classList.contains('modal-content')
        || currentEl.scrollHeight > currentEl.clientHeight
      ) {
        return currentEl;
      }
      currentEl = currentEl.parentElement;
    }

    return null;
  }

  private restoreScrollTopAfterRender(scrollContainer: HTMLElement | null, scrollTop: number): void {
    if (!scrollContainer || scrollTop <= 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!scrollContainer.isConnected) {
        return;
      }

      scrollContainer.scrollTop = scrollTop;
    });
  }

  private createFieldId(label: string): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${label}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private formatAgentCommand(agent: AcpAgentConfig): string {
    const command = `${agent.command} ${agent.args.join(' ')}`.trim();
    return command || t('settings.acp.command.empty');
  }
}
