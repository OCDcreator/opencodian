import { Notice, Setting } from 'obsidian';

import type { DshBackendSettings } from '../../../../core/types/settings';
import { t, type TranslationKey } from '../../../../i18n';
import { addBackendChoiceSetting, describeBackendSetting } from '../../controls/BackendSettingsControls';
import { type InlineEditModelOverrideHost, SettingsInlineEditSection } from '../../general/SettingsInlineEditSection';
import { type DshMcpPairRow, type DshMcpWorkspaceConnectionPort, type DshMcpWorkspaceHost, SettingsDshMcpWorkspace } from './SettingsDshMcpWorkspace';
import { type DshNativeSettingsHost, type DshNativeSettingsPort, type DshNativeSettingsTask, SettingsDshNativeWorkspace } from './SettingsDshNativeWorkspace';

export { type DshMcpWorkspaceConnectionPort as DshSettingsConnectionPort };

interface DshSettingsHost extends DshMcpWorkspaceHost {
  isEnabled(): boolean;
  modelOverridesHost?: InlineEditModelOverrideHost;
}

const DSH_TABS: readonly { id: string; labelKey: TranslationKey }[] = [
  { id: 'connection', labelKey: 'settings.dsh.tab.connection' },
  { id: 'model', labelKey: 'settings.dsh.tab.model' },
  { id: 'permissions', labelKey: 'settings.dsh.tab.permissions' },
  { id: 'context', labelKey: 'settings.dsh.tab.context' },
  { id: 'tools', labelKey: 'settings.dsh.tab.tools' },
  { id: 'mcp', labelKey: 'settings.dsh.tab.mcp' },
  { id: 'configuration', labelKey: 'settings.dsh.tab.configuration' },
  { id: 'advanced', labelKey: 'settings.dsh.tab.advanced' },
];
/**
 * DSH workspace: connection, MCP declarations and native configuration
 * readback. The section is mounted only for the active DSH backend; it reads
 * and writes `backendSettings.dsh` and never presents another backend's
 * configuration as DSH.
 */
export class SettingsDshSection {
  private readonly mcpWorkspace: SettingsDshMcpWorkspace;
  private readonly nativeWorkspace: SettingsDshNativeWorkspace;
  /** Kept mutable so `attachTabbed` can wire the tabbed renderer's navigation
   * after construction while `attach` (stacked surface) clears it: without a
   * tab bar there is no in-page navigation, so no cross-task links may render. */
  private readonly nativeHost: DshNativeSettingsHost;
  constructor(private readonly host: DshSettingsHost) {
    this.mcpWorkspace = new SettingsDshMcpWorkspace(host);
    this.nativeHost = {
      getSettings: () => host.getSettings(),
      getAdapter: () => host.getAdapter() as (DshMcpWorkspaceConnectionPort & DshNativeSettingsPort) | undefined,
      saveSettings: () => host.saveSettings(),
      vaultPath: host.vaultPath,
      recoveryBaseDir: host.recoveryBaseDir,
      draftOwner: host.modelOverridesHost ?? host.getSettings(),
    };
    this.nativeWorkspace = new SettingsDshNativeWorkspace(this.nativeHost);
  }
  dispose(): void {
    this.nativeWorkspace.dispose();
  }

  attach(containerEl: HTMLElement): void {
    this.nativeHost.navigateTask = undefined;
    for (const tab of DSH_TABS) {
      this.renderTab(containerEl, tab.id, { showSubheading: true });
    }
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string,
    navigate?: (task: 'model' | 'configuration') => void): void {
    this.nativeHost.navigateTask = navigate;
    const tab = DSH_TABS.find((candidate) => candidate.id === secondaryTabId)?.id
      ?? DSH_TABS[0].id;
    this.renderTab(containerEl, tab, { showSubheading: false });
  }

  private renderTab(
    containerEl: HTMLElement,
    tabId: string,
    options: { showSubheading: boolean },
  ): void {
    const blockEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-dsh-settings',
      attr: {
        'data-settings-surface': 'section',
        'data-settings-target': `dsh-${tabId}`,
      },
    });
    // This snapshot covers connection fields, so its controls belong only here.
    const recoveryBar = containerEl.querySelector(':scope > .opencodian-backend-workspace-bar');
    if (recoveryBar) {
      if (tabId === 'connection') containerEl.append(recoveryBar);
      else recoveryBar.remove();
    }
    if (options.showSubheading) {
      blockEl.createEl('h3', {
        cls: 'opencodian-settings-subheading',
        text: t(DSH_TABS.find((candidate) => candidate.id === tabId)?.labelKey
          ?? 'settings.dsh.tab.connection'),
      });
    }
    const bodyEl = blockEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });
    const group = bodyEl.createDiv({ cls: 'opencodian-backend-agent-group opencodian-dsh-settings' });
    if (tabId === 'connection') {
      this.renderConnection(group);
      return;
    }
    if (tabId === 'model') {
      this.renderModel(group);
      return;
    }
    if (tabId === 'mcp') {
      this.renderMcp(group);
      return;
    }
    if (tabId === 'configuration') this.renderConfiguration(group);
    else this.nativeWorkspace.render(group, tabId as DshNativeSettingsTask);
  }

  private renderModel(group: HTMLElement): void {
    this.nativeWorkspace.render(group, 'model');
    group.createEl('h5', {
      cls: 'opencodian-settings-subsection-heading',
      text: t('settings.dsh.model.title'),
    });
    group.createEl('p', {
      cls: 'setting-item-description',
      text: t('settings.dsh.model.desc'),
    });
    if (!this.host.modelOverridesHost) {
      group.createEl('p', {
        cls: 'setting-item-description',
        text: t('settings.dsh.model.unavailable'),
      });
      return;
    }
    SettingsInlineEditSection.renderBackendModelOverrides(
      group,
      'dsh',
      this.host.modelOverridesHost,
    );
  }

  private renderConnection(group: HTMLElement): void {
    const settings = this.host.getSettings();
    group.createEl('h4', { cls: 'opencodian-settings-subsection-heading', text: t('settings.agent.dsh.connection') });
    group.createEl('p', { cls: 'opencodian-dsh-section-description', text: t('settings.agent.dsh.connection.desc') });
    group.createEl('p', { cls: 'opencodian-dsh-application-note', text: t('settings.agent.dsh.connection.application') });
    const transport = addBackendChoiceSetting(group, {
      key: 'transport',
      name: t('settings.agent.dsh.transport'),
      description: t('settings.agent.dsh.transport.desc'),
      value: settings.transport ?? 'native',
      options: [
        { value: 'native', label: t('settings.agent.dsh.transport.native') },
        { value: 'acp', label: t('settings.agent.dsh.transport.acp') },
      ],
      onChange: async (value) => {
        const previous = settings.transport;
        settings.transport = value === 'acp' ? 'acp' : 'native';
        try {
          await this.host.saveSettings();
          transportHint.setText(t(value === 'acp' ? 'settings.agent.dsh.transport.acpDesc' : 'settings.agent.dsh.transport.nativeDesc'));
        } catch (error) {
          settings.transport = previous;
          throw error;
        }
      },
      presentation: {
        key: 'transport', scope: 'vault', effect: 'reconnect', risk: 'medium',
        defaultLabel: t('settings.agent.dsh.transport.native'),
      },
    });
    transport.settingEl.addClass('opencodian-dsh-form-row', 'opencodian-dsh-segmented');
    const transportHint = transport.controlEl.createEl('p', {
      cls: 'opencodian-dsh-control-hint',
      text: t(settings.transport === 'acp' ? 'settings.agent.dsh.transport.acpDesc' : 'settings.agent.dsh.transport.nativeDesc'),
    });
    this.renderPathSetting(group, settings, 'executablePath');
    this.renderPathSetting(group, settings, 'workingDirectory');

    const connection = new Setting(group).setName(t('settings.agent.dsh.connectionStatus'));
    connection.settingEl.addClass('opencodian-dsh-form-row', 'opencodian-dsh-connection-status');
    const status = connection.infoEl.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const adapter = this.host.getAdapter();
    const statusKey = (): TranslationKey => `settings.agent.dsh.status.${adapter?.status ?? 'disconnected'}`;
    status.setText(t(statusKey()));
    connection.addButton((button) => button.setButtonText(t('settings.agent.dsh.testConnection')).onClick(async () => {
      button.setDisabled(true);
      status.setText(t('settings.agent.dsh.status.connecting'));
      try {
        if (!adapter) throw new Error(t('settings.agent.dsh.status.unavailable'));
        await adapter.start();
        status.setText(t(statusKey()));
      } catch {
        status.setText(t('settings.agent.dsh.status.error'));
        new Notice(t('settings.agent.dsh.status.error'));
      } finally { button.setDisabled(false); }
    }));

    const launch = group.createEl('details', { cls: 'opencodian-dsh-launch-advanced' });
    launch.createEl('summary', { text: t('settings.agent.dsh.launch.advanced') });
    const launchBody = launch.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
    launchBody.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.launch.advanced.warn') });
    this.renderLaunchAdvanced(launchBody, settings);
    group.createEl('p', { cls: 'opencodian-dsh-limit-note', text: t('settings.agent.dsh.limits') });
  }

  private renderPathSetting(group: HTMLElement, settings: DshBackendSettings, field: 'executablePath' | 'workingDirectory'): void {
    const executable = field === 'executablePath';
    const nameKey = executable ? 'settings.agent.dsh.executable' : 'settings.agent.dsh.workingDirectory';
    const defaultKey = executable ? 'settings.agent.dsh.executable.auto' : 'settings.agent.dsh.workingDirectory.vault';
    const setting = describeBackendSetting(new Setting(group)
      .setName(t(nameKey))
      .setDesc(t(executable ? 'settings.agent.dsh.executable.desc' : 'settings.agent.dsh.workingDirectory.desc')),
    { key: field, scope: 'vault', effect: 'reconnect', risk: executable ? 'medium' : 'low', defaultLabel: t(defaultKey) });
    setting.settingEl.addClass('opencodian-dsh-form-row', 'opencodian-dsh-path-setting');
    // The settings host enhances this source select with SettingsDropdownControl,
    // including its owner-window portal, keyboard scope and lifecycle cleanup.
    const select = setting.controlEl.createEl('select', { cls: 'dropdown', attr: { 'aria-label': t(nameKey) } });
    select.createEl('option', { attr: { value: 'default' }, text: t(defaultKey) });
    select.createEl('option', { attr: { value: 'custom' }, text: t(executable ? 'settings.agent.dsh.executable.custom' : 'settings.agent.dsh.workingDirectory.custom') });
    select.value = settings[field] ? 'custom' : 'default';
    const holder = setting.controlEl.createDiv({ cls: 'opencodian-dsh-custom-path' });
    holder.hidden = !settings[field];
    const input = holder.createEl('input', { type: 'text', cls: 'opencodian-dsh-path-input', attr: { 'aria-label': t(nameKey), autocomplete: 'off', spellcheck: 'false' } });
    input.placeholder = executable ? '/usr/local/bin/dsh' : t('settings.agent.dsh.workingDirectory.placeholder');
    input.value = settings[field];
    const feedback = setting.controlEl.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    const commit = async (next: string): Promise<void> => {
      const previous = settings[field];
      settings[field] = next;
      select.disabled = true;
      input.disabled = true;
      try {
        await this.host.saveSettings();
        feedback.dataset.state = 'saved';
        feedback.setText(t('settings.agent.dsh.connection.saved'));
      } catch {
        settings[field] = previous;
        input.value = previous;
        select.value = previous ? 'custom' : 'default';
        holder.hidden = !previous;
        feedback.dataset.state = 'error';
        feedback.setText(t('settings.backend.recovery.failed'));
      } finally {
        select.disabled = false;
        input.disabled = false;
      }
    };
    select.addEventListener('change', () => {
      feedback.setText('');
      holder.hidden = select.value !== 'custom';
      if (select.value === 'custom') { input.focus(); return; }
      input.value = '';
      void commit('');
    });
    input.addEventListener('change', () => {
      input.value = input.value.trim();
      if (!input.value) {
        feedback.dataset.state = 'error';
        feedback.setText(t('settings.agent.dsh.path.required'));
        return;
      }
      void commit(input.value);
    });
  }

  private renderLaunchAdvanced(container: HTMLElement, settings: DshBackendSettings): void {
    let argsText = settings.args.join('\n');
    let rows: DshMcpPairRow[] = Object.entries(settings.env).map(([name, value]) => ({ name, value }));
    // Every keystroke persists; failures revert inline and surface here instead
    // of becoming unhandled rejections.
    const launchStatus = container.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite' } });
    const persist = async (): Promise<void> => {
      const previousArgs = settings.args;
      const previousEnv = settings.env;
      settings.args = argsText.split('\n').map((line) => line.trim()).filter(Boolean);
      settings.env = Object.fromEntries(rows
        .map((row) => [row.name.trim(), row.value] as const)
        .filter(([name]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)));
      try {
        await this.host.saveSettings();
        launchStatus.setText('');
      } catch {
        settings.args = previousArgs;
        settings.env = previousEnv;
        launchStatus.setText(t('settings.backend.recovery.failed'));
      }
    };
    describeBackendSetting(
      new Setting(container)
        .setName(t('settings.agent.dsh.launch.args'))
        .setDesc(t('settings.agent.dsh.launch.args.desc'))
        .setClass('opencodian-wide-text-setting')
        .addTextArea((input) => {
          input.setValue(argsText).setPlaceholder(t('settings.agent.dsh.launch.args.placeholder')).onChange((value) => {
            argsText = value;
            void persist();
          });
          input.inputEl.rows = 3;
          input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.launch.args'));
        }),
      { key: 'args', scope: 'vault', effect: 'reconnect', risk: 'high' },
    );
    const environment = describeBackendSetting(
      new Setting(container)
        .setName(t('settings.agent.dsh.launch.env'))
        .setDesc(t('settings.agent.dsh.launch.env.desc'))
        .setClass('opencodian-dsh-environment-setting'),
      { key: 'env', scope: 'vault', effect: 'reconnect', risk: 'high' },
    );
    const envHolder = environment.controlEl.createDiv({ cls: 'opencodian-dsh-kv-rows' });
    const renderEnvRows = (): void => {
      envHolder.empty();
      const namePlaceholder = t('settings.agent.dsh.launch.env.name.placeholder');
      const valuePlaceholder = t('settings.agent.dsh.launch.env.value.placeholder');
      rows.forEach((row, index) => {
        const rowEl = envHolder.createDiv({ cls: 'opencodian-dsh-kv-row' });
        const nameInput = rowEl.createEl('input', { type: 'text', attr: { 'aria-label': `${t('settings.agent.dsh.launch.env')} · ${namePlaceholder}`, placeholder: namePlaceholder } });
        nameInput.value = row.name;
        nameInput.addEventListener('input', () => { row.name = nameInput.value; void persist(); });
        const valueInput = rowEl.createEl('input', { type: 'password', attr: { 'aria-label': `${t('settings.agent.dsh.launch.env')} · ${valuePlaceholder}`, placeholder: valuePlaceholder } });
        valueInput.value = row.value;
        valueInput.addEventListener('input', () => { row.value = valueInput.value; void persist(); });
        const remove = rowEl.createEl('button', { text: t('settings.agent.dsh.launch.env.remove'), attr: { type: 'button', 'aria-label': `${t('settings.agent.dsh.launch.env.remove')} ${index + 1}` } });
        remove.addEventListener('click', () => {
          rows = rows.filter((_, candidate) => candidate !== index);
          renderEnvRows();
          void persist();
        });
      });
      const add = envHolder.createEl('button', { text: t('settings.agent.dsh.launch.env.add'), attr: { type: 'button' } });
      add.addEventListener('click', () => {
        rows = [...rows, { name: '', value: '' }];
        renderEnvRows();
      });
    };
    renderEnvRows();
  }

  private renderMcp(group: HTMLElement): void {
    // Secret-bearing MCP declarations live in their own workspace owner, which
    // also owns the durable machine-local recovery snapshots.
    this.mcpWorkspace.render(group);
  }

  private renderConfiguration(group: HTMLElement): void {
    this.nativeWorkspace.render(group, 'configuration');
  }
}
