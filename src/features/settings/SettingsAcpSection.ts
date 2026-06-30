/**
 * ACP settings section for managing external agent configurations.
 */

import { Setting } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import type { AcpAgentConfig } from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { renderAgentSwitcherBackendIcon } from './AgentSwitcherFloatingIcons';

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

interface SettingsScrollArea {
  readonly rootEl: HTMLElement;
  readonly viewportEl: HTMLElement;
  readonly contentEl: HTMLElement;
}

interface AcpActionConfig {
  readonly label: string;
  readonly backendIcon: AgentBackendKind | null;
  readonly priority: 'primary' | 'preset';
}

interface AcpPresetActionConfig extends AcpActionConfig {
  readonly agent: Omit<AcpAgentConfig, 'id'>;
}

const ACP_CUSTOM_ACTION: AcpActionConfig = {
  label: 'Custom agent',
  backendIcon: null,
  priority: 'primary',
};

const ACP_PRESETS: readonly AcpPresetActionConfig[] = [
  {
    label: 'OpenCode',
    backendIcon: 'opencode',
    priority: 'preset',
    agent: { name: 'OpenCode', command: 'opencode', args: ['acp'], env: {}, enabled: true },
  },
  {
    label: 'Codex',
    backendIcon: 'codex',
    priority: 'preset',
    agent: { name: 'Codex', command: 'codex', args: ['acp'], env: {}, enabled: true },
  },
  {
    label: 'Claude Code',
    backendIcon: 'claude-code',
    priority: 'preset',
    agent: { name: 'Claude Code', command: 'claude', args: ['acp'], env: {}, enabled: true },
  },
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
    this.bodyEl = containerEl.createDiv({
      cls: 'opencodian-settings-extension-shell opencodian-acp-settings-shell',
      attr: { 'data-settings-extension-surface': 'acp' },
    });
    this.renderCreateCard(this.bodyEl);
    this.renderAgentList(this.bodyEl);
  }

  private rerender(): void {
    if (!this.bodyEl) {
      return;
    }

    const scrollContainer = this.resolveScrollContainer(this.bodyEl);
    const previousScrollTop = scrollContainer?.scrollTop ?? 0;
    this.bodyEl.empty();
    this.renderCreateCard(this.bodyEl);
    this.renderAgentList(this.bodyEl);
    this.restoreScrollTopAfterRender(scrollContainer, previousScrollTop);
  }

  private renderCreateCard(containerEl: HTMLElement): void {
    const createCardEl = containerEl.createDiv({
      cls: 'opencodian-acp-create-card opencodian-acp-preset-rail',
    });
    const headerEl = createCardEl.createDiv({ cls: 'opencodian-acp-create-header' });
    const introEl = headerEl.createDiv({ cls: 'opencodian-acp-create-copy opencodian-acp-preset-intro' });
    introEl.createEl('strong', { cls: 'opencodian-acp-create-title', text: t('settings.acp.addAgent') });
    introEl.createDiv({
      text: t('settings.acp.preset.desc'),
      cls: 'opencodian-acp-create-desc opencodian-acp-preset-desc',
    });

    headerEl.createSpan({
      cls: 'opencodian-acp-create-count-badge',
      text: this.formatAgentCount(),
    });

    const actionsEl = createCardEl.createDiv({
      cls: 'opencodian-acp-create-actions opencodian-acp-preset-actions',
    });

    this.createAcpActionButton(actionsEl, {
      label: t('settings.acp.customAgent'),
      backendIcon: ACP_CUSTOM_ACTION.backendIcon,
      priority: ACP_CUSTOM_ACTION.priority,
    }, () => {
      void this.addAgent({
        id: this.createAgentId(),
        name: 'New Agent',
        command: '',
        args: [],
        env: {},
        enabled: true,
      });
    });

    for (const preset of ACP_PRESETS) {
      this.createAcpActionButton(actionsEl, preset, () => {
        void this.addAgent({ id: this.createAgentId(), ...preset.agent });
      });
    }
  }

  private createAcpActionButton(
    containerEl: HTMLElement,
    action: AcpActionConfig,
    onClick: () => void,
  ): Setting {
    const setting = new Setting(containerEl).setClass('opencodian-acp-create-action');
    setting.settingEl.addClass('opencodian-acp-create-action');
    setting.settingEl.addClass('opencodian-acp-preset-action');
    setting.settingEl.addClass(`opencodian-acp-create-action--${action.priority}`);
    setting.settingEl.setAttribute('data-acp-action-label', action.label);
    setting.settingEl.setAttribute('data-acp-action-priority', action.priority);
    setting.addButton((button) => {
      button
        .setButtonText(action.label)
        .onClick(onClick);
      if (button.buttonEl instanceof HTMLButtonElement) {
        this.decorateAcpActionButton(button.buttonEl, action);
      }
    });
    return setting;
  }

  private decorateAcpActionButton(buttonEl: HTMLButtonElement, action: AcpActionConfig): void {
    buttonEl.empty();
    buttonEl.addClass('opencodian-acp-create-action-button');
    buttonEl.addClass(`opencodian-acp-create-action-button--${action.priority}`);
    buttonEl.setAttribute('aria-label', action.label);

    const iconEl = buttonEl.createSpan({ cls: 'opencodian-acp-create-action-icon' });
    iconEl.setAttribute('aria-hidden', 'true');
    if (action.backendIcon) {
      renderAgentSwitcherBackendIcon(iconEl, action.backendIcon);
    } else {
      iconEl.createSpan({ cls: 'opencodian-acp-create-action-icon-fallback', text: '+' });
    }

    buttonEl.createSpan({
      cls: 'opencodian-acp-create-action-label',
      text: action.label,
    });
  }

  private renderAgentList(containerEl: HTMLElement): void {
    const agents = this.plugin.settings.acpAgents;
    if (agents.length === 0) {
      containerEl.createDiv({ cls: 'opencodian-settings-inline-empty opencodian-acp-empty', text: t('settings.acp.empty') });
      return;
    }

    const listArea = this.createScrollArea(containerEl, {
      rootClass: 'opencodian-acp-agent-list',
      contentClass: 'opencodian-settings-scrollarea-content--acp',
    });
    const listEl = listArea.rootEl;
    listEl.setAttribute('role', 'list');
    for (const agent of agents) {
      this.renderAgentCard(listArea.contentEl, agent);
    }
  }

  private renderAgentCard(containerEl: HTMLElement, agent: AcpAgentConfig): void {
    const cardEl = containerEl.createDiv({
      cls: 'opencodian-acp-agent-row-card opencodian-acp-agent-card',
      attr: {
        role: 'listitem',
        'data-acp-agent-id': agent.id,
        'data-acp-agent-enabled': agent.enabled ? 'true' : 'false',
      },
    });
    const headerEl = cardEl.createDiv({ cls: 'opencodian-acp-agent-card-header' });
    const identityEl = headerEl.createDiv({ cls: 'opencodian-acp-agent-identity' });
    const titleRowEl = identityEl.createDiv({ cls: 'opencodian-acp-agent-title-row' });
    titleRowEl.createEl('strong', { text: agent.name || t('settings.acp.agentName') });
    const statusBadgeEl = titleRowEl.createSpan({
      cls: [
        'opencodian-acp-agent-status-badge',
        agent.enabled ? 'opencodian-acp-agent-status-badge-enabled' : 'opencodian-acp-agent-status-badge-disabled',
      ].join(' '),
      text: agent.enabled ? t('settings.acp.agentEnabled') : t('settings.agent.status.disabled'),
    });
    identityEl.createDiv({
      cls: 'opencodian-acp-agent-command-summary',
      text: this.formatAgentCommand(agent),
    });

    const actionSetting = new Setting(headerEl)
      .setClass('opencodian-acp-agent-actions')
      .addToggle((toggle) => {
        toggle.setValue(agent.enabled).onChange(async (value) => {
          agent.enabled = value;
          cardEl.setAttribute('data-acp-agent-enabled', value ? 'true' : 'false');
          statusBadgeEl.setText(value ? t('settings.acp.agentEnabled') : t('settings.agent.status.disabled'));
          statusBadgeEl.toggleClass('opencodian-acp-agent-status-badge-enabled', value);
          statusBadgeEl.toggleClass('opencodian-acp-agent-status-badge-disabled', !value);
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
    actionSetting.settingEl.addClass('opencodian-settings-extension-actions');

    // Stacked form fields: label above input, full width
    const fieldsEl = cardEl.createDiv({ cls: 'opencodian-acp-field-group opencodian-acp-agent-fields' });

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

  private createScrollArea(
    containerEl: HTMLElement,
    options: { readonly rootClass: string; readonly contentClass: string },
  ): SettingsScrollArea {
    const rootEl = containerEl.createDiv({
      cls: `opencodian-settings-scrollarea ${options.rootClass}`,
    });
    const viewportEl = rootEl.createDiv({
      cls: 'opencodian-settings-scrollarea-viewport',
    });
    const contentEl = viewportEl.createDiv({
      cls: `opencodian-settings-scrollarea-content ${options.contentClass}`,
    });
    rootEl.createDiv({
      cls: 'opencodian-settings-scrollarea-gutter',
      attr: { 'aria-hidden': 'true' },
    });
    this.syncScrollAreaGutter(rootEl, viewportEl);
    return { rootEl, viewportEl, contentEl };
  }

  private syncScrollAreaGutter(rootEl: HTMLElement, viewportEl: HTMLElement): void {
    window.requestAnimationFrame(() => {
      if (!rootEl.isConnected || !viewportEl.isConnected) {
        return;
      }

      const gutterWidth = Math.max(0, viewportEl.offsetWidth - viewportEl.clientWidth);
      rootEl.style.setProperty('--opencodian-settings-scrollbar-track-width', `${gutterWidth}px`);
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

  private formatAgentCount(): string {
    return t('settings.acp.count').replace('{count}', String(this.plugin.settings.acpAgents.length));
  }

  private formatAgentCommand(agent: AcpAgentConfig): string {
    const command = `${agent.command} ${agent.args.join(' ')}`.trim();
    return command || t('settings.acp.command.empty');
  }
}
